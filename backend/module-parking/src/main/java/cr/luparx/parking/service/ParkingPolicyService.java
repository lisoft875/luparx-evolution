package cr.luparx.parking.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.UnprocessableEntityException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.parking.entity.ParkingPolicy;
import cr.luparx.parking.model.MinuteIncrements;
import cr.luparx.parking.model.ParkingPolicyDefaults;
import cr.luparx.parking.repository.ParkingPolicyRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

/**
 * Reads and writes the parking policy of a municipality, and is the only place that decides what a
 * municipality without a policy row offers.
 *
 * <p>A missing row is not an error: it means "this municipality has not configured anything yet",
 * and the answer is the deployment's configured defaults ({@code platform.defaults.parking.*}),
 * materialised on the first read so that the municipality can then edit a real row. A default that
 * lived as a constant in this class would be a decision the municipality could not make, which is
 * precisely what CONTRACT.md v0.2 forbids.</p>
 */
@Service
public class ParkingPolicyService {

    private final ParkingPolicyRepository repository;
    private final ParkingPolicyDefaults defaults;
    private final Clock clock;

    public ParkingPolicyService(ParkingPolicyRepository repository, ParkingPolicyDefaults defaults, Clock clock) {
        this.repository = repository;
        this.defaults = defaults;
        this.clock = clock;
    }

    /**
     * The policy in force for a municipality, creating it from the configured defaults the first
     * time. Not read-only for that reason: the first caller materialises the row.
     */
    @Transactional
    public ParkingPolicy require(TenantId tenantId) {
        return repository.findById(tenantId.value())
                .orElseGet(() -> repository.save(ParkingPolicy.fromDefaults(tenantId, defaults, clock.instant())));
    }

    /** The row as it is, without creating one. Used where a read must not write. */
    @Transactional(readOnly = true)
    public ParkingPolicy peek(TenantId tenantId) {
        return repository.findById(tenantId.value()).orElse(null);
    }

    /**
     * Replaces the whole policy of a municipality. Validation happens here and not in the
     * controller: the coherence rules between fields are domain rules, and the same rules must hold
     * whatever calls this — an admin endpoint today, an import or a back-office job tomorrow.
     */
    @Transactional
    public ParkingPolicy replace(TenantId tenantId,
                                 List<Integer> sessionIncrements,
                                 int sessionMinMinutes,
                                 int sessionMaxMinutes,
                                 boolean extensionEnabled,
                                 List<Integer> extensionIncrements,
                                 int extensionMaxTotalMinutes,
                                 boolean earlyFinishEnabled,
                                 boolean creditOnEarlyFinishEnabled,
                                 int creditMinRemainingMinutes,
                                 int creditExpiryDays,
                                 int graceMinutes) {
        ValidationException.Collector errors = new ValidationException.Collector();
        MinuteIncrements session = parse(sessionIncrements, "sessionIncrementsMinutes", errors);
        MinuteIncrements extension = parse(extensionIncrements, "extensionIncrementsMinutes", errors);

        if (session != null && session.isEmpty()) {
            errors.add("sessionIncrementsMinutes", ErrorCode.VALIDATION_FAILED,
                    "error.parking.policy.sessionIncrements.required");
        }
        if (sessionMinMinutes <= 0) {
            errors.add("sessionMinMinutes", ErrorCode.VALIDATION_FAILED, "error.parking.policy.sessionMin.invalid");
        }
        if (sessionMaxMinutes < sessionMinMinutes) {
            errors.add("sessionMaxMinutes", ErrorCode.VALIDATION_FAILED, "error.parking.policy.sessionMax.invalid");
        }
        if (extensionEnabled && extension != null && extension.isEmpty()) {
            // Offering extensions with nothing to offer would show the citizen an empty picker.
            errors.add("extensionIncrementsMinutes", ErrorCode.VALIDATION_FAILED,
                    "error.parking.policy.extensionIncrements.required");
        }
        if (extensionMaxTotalMinutes < sessionMaxMinutes) {
            errors.add("extensionMaxTotalMinutes", ErrorCode.VALIDATION_FAILED,
                    "error.parking.policy.extensionMaxTotal.invalid");
        }
        if (creditOnEarlyFinishEnabled && !earlyFinishEnabled) {
            // Minutes are earned by finishing early; crediting them without that is unreachable.
            errors.add("creditOnEarlyFinishEnabled", ErrorCode.VALIDATION_FAILED,
                    "error.parking.policy.creditRequiresEarlyFinish");
        }
        if (creditMinRemainingMinutes < 0) {
            errors.add("creditMinRemainingMinutes", ErrorCode.VALIDATION_FAILED, "error.parking.policy.negative");
        }
        if (creditExpiryDays < 0) {
            errors.add("creditExpiryDays", ErrorCode.VALIDATION_FAILED, "error.parking.policy.negative");
        }
        if (graceMinutes < 0) {
            errors.add("graceMinutes", ErrorCode.VALIDATION_FAILED, "error.parking.policy.negative");
        }
        errors.throwIfAny();

        Instant now = clock.instant();
        ParkingPolicy policy = repository.findById(tenantId.value()).orElse(null);
        if (policy == null) {
            return repository.save(new ParkingPolicy(tenantId.value(), session, sessionMinMinutes,
                    sessionMaxMinutes, extensionEnabled, extension, extensionMaxTotalMinutes, earlyFinishEnabled,
                    creditOnEarlyFinishEnabled, creditMinRemainingMinutes, creditExpiryDays, graceMinutes, now));
        }
        policy.replace(session, sessionMinMinutes, sessionMaxMinutes, extensionEnabled, extension,
                extensionMaxTotalMinutes, earlyFinishEnabled, creditOnEarlyFinishEnabled,
                creditMinRemainingMinutes, creditExpiryDays, graceMinutes, now);
        return repository.save(policy);
    }

    /**
     * Checks a requested duration against what the municipality offers when starting.
     *
     * @throws UnprocessableEntityException {@code INVALID_INCREMENT} when the value is not on the
     *         list. It is never rounded to the nearest offered option: charging for something other
     *         than what the citizen asked for is worse than refusing.
     */
    public void requireSessionIncrement(ParkingPolicy policy, int minutes) {
        requireSessionIncrement(policy, minutes, 0);
    }

    /**
     * The same check, plus the one duration that is the citizen's rather than the municipality's:
     * exactly the minutes they have saved (CONTRACT.md v0.12).
     *
     * <p>Saved minutes come from finishing early and rarely land on an offered increment — 44 left
     * over from an hour, against a list of 30, 60 and 120. Without this, they can only be spent as
     * part of a longer stay: ask for 60 and the 44 are applied to it, or ask for 30 and 14 of them
     * stay behind. There was no way to say "just use what I have", which is the one thing a person
     * with saved minutes wants to do.</p>
     *
     * <p><b>The municipality's minimum does not apply to it.</b> {@code sessionMinMinutes} is the
     * shortest stay the municipality <em>sells</em>, and this one is not being sold: it was paid for
     * already, and the money for it moved when it was. Applying the minimum here would refuse the
     * exact case the rule exists for, since a municipality typically sets the minimum to its
     * smallest increment. The maximum <em>does</em> apply: it is about how long a car may hold a bay,
     * which is true whoever paid for the time.</p>
     *
     * @param savedMinutes the citizen's time-credit balance in this municipality, read inside the
     *                     same transaction that will spend it; 0 when they have none
     */
    public void requireSessionIncrement(ParkingPolicy policy, int minutes, int savedMinutes) {
        if (minutes > 0 && minutes == savedMinutes && minutes <= policy.getSessionMaxMinutes()) {
            return;
        }
        if (!policy.sessionIncrements().allows(minutes)
                || minutes < policy.getSessionMinMinutes()
                || minutes > policy.getSessionMaxMinutes()) {
            throw UnprocessableEntityException.of(ErrorCode.INVALID_INCREMENT, "error.parking.increment.invalid",
                    Integer.valueOf(minutes));
        }
    }

    /** The same check for an extension. The two lists are configured separately by the municipality. */
    public void requireExtensionIncrement(ParkingPolicy policy, int minutes) {
        if (!policy.extensionIncrements().allows(minutes)) {
            throw UnprocessableEntityException.of(ErrorCode.INVALID_INCREMENT, "error.parking.increment.invalid",
                    Integer.valueOf(minutes));
        }
    }

    private MinuteIncrements parse(List<Integer> values, String field, ValidationException.Collector errors) {
        try {
            return MinuteIncrements.of(values);
        } catch (IllegalArgumentException exception) {
            errors.add(field, ErrorCode.VALIDATION_FAILED, "error.parking.policy.increments.invalid");
            return null;
        }
    }
}
