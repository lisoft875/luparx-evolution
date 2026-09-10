package cr.luparx.parking.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.UnprocessableEntityException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.parking.entity.ParkingPolicy;
import cr.luparx.parking.entity.ParkingZonePolicy;
import cr.luparx.parking.model.MinuteIncrements;
import cr.luparx.parking.model.ParkingPolicyDefaults;
import cr.luparx.parking.model.ZoneRules;
import cr.luparx.parking.repository.ParkingPolicyRepository;
import cr.luparx.parking.repository.ParkingZonePolicyRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Reads and writes the parking policy of a municipality, and is the only place that decides what a
 * municipality without a policy row offers.
 *
 * <p>A missing row is not an error: it means "this municipality has not configured anything yet",
 * and the answer is the deployment's configured defaults ({@code platform.defaults.parking.*}),
 * materialised on the first read so that the municipality can then edit a real row. A default that
 * lived as a constant in this class would be a decision the municipality could not make, which is
 * precisely what CONTRACT.md v0.2 forbids.</p>
 *
 * <h2>What applies in one zone</h2>
 *
 * <p>Since v0.31 a zone may depart from some of these numbers, and {@link #rulesFor} is the single
 * place that folds the two rows into one answer ({@link ZoneRules}). Every caller reads a plain
 * number from it and none of them reaches for the zone row itself: the alternative is the same
 * fallback written in six places, and the day one of them forgets it a zone silently gets a maximum
 * stay of zero.</p>
 *
 * <p>A zone row is <b>never created on read</b>, unlike the municipality's. Materialising a row of
 * nulls for every zone somebody looks at would fill the table with rows that say nothing, and
 * "departs in nothing" is already what the absence of a row means.</p>
 */
@Service
public class ParkingPolicyService {

    private final ParkingPolicyRepository repository;
    private final ParkingZonePolicyRepository zoneRepository;
    private final ParkingPolicyDefaults defaults;
    private final Clock clock;

    public ParkingPolicyService(ParkingPolicyRepository repository, ParkingZonePolicyRepository zoneRepository,
                                ParkingPolicyDefaults defaults, Clock clock) {
        this.repository = repository;
        this.zoneRepository = zoneRepository;
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

    /**
     * The rules that actually apply in one zone: the municipality's, with the zone's departures
     * folded in.
     *
     * @param zoneId the zone, or null for the municipality's own rules with nothing overridden
     */
    @Transactional
    public ZoneRules rulesFor(TenantId tenantId, UUID zoneId) {
        ParkingPolicy policy = require(tenantId);
        if (zoneId == null) {
            return ZoneRules.of(policy);
        }
        return ZoneRules.of(policy, zoneId,
                zoneRepository.findByTenantIdAndZoneId(tenantId.value(), zoneId).orElse(null));
    }

    /** The rules of a whole page of zones, resolved in two queries rather than two per row. */
    @Transactional
    public Map<UUID, ZoneRules> rulesFor(TenantId tenantId, Collection<UUID> zoneIds) {
        ParkingPolicy policy = require(tenantId);
        Map<UUID, ZoneRules> resolved = new HashMap<>();
        if (zoneIds == null || zoneIds.isEmpty()) {
            return resolved;
        }
        Map<UUID, ParkingZonePolicy> overrides = new HashMap<>();
        for (ParkingZonePolicy override : zoneRepository.findByTenantIdAndZoneIdIn(tenantId.value(), zoneIds)) {
            overrides.put(override.getZoneId(), override);
        }
        for (UUID zoneId : zoneIds) {
            resolved.put(zoneId, ZoneRules.of(policy, zoneId, overrides.get(zoneId)));
        }
        return resolved;
    }

    /** What a zone departs in, if anything. Absent is the normal case, never a missing row. */
    @Transactional(readOnly = true)
    public Optional<ParkingZonePolicy> zoneOverride(TenantId tenantId, UUID zoneId) {
        return zoneRepository.findByTenantIdAndZoneId(tenantId.value(), zoneId);
    }

    /**
     * Replaces everything a zone departs in, as one form.
     *
     * <p>A form where every field came back empty means "this zone follows the municipality in
     * everything", and the row is <b>deleted</b> rather than kept full of nulls: a row that says
     * nothing is a row somebody will one day read as if it said something.</p>
     *
     * <p>The numbers are validated against each other but deliberately <b>not</b> against the
     * municipality's. A zone that sells shorter stays than the municipality's minimum is exactly the
     * kind of departure this exists for; requiring it to stay inside the municipality's range would
     * make the range a ceiling the zone cannot lower, which is the opposite of the point.</p>
     */
    @Transactional
    public Optional<ParkingZonePolicy> replaceZone(TenantId tenantId, UUID zoneId,
                                                   List<Integer> sessionIncrements,
                                                   Integer sessionMinMinutes,
                                                   Integer sessionMaxMinutes,
                                                   List<Integer> extensionIncrements,
                                                   Integer extensionMaxTotalMinutes,
                                                   Integer freeMinutes) {
        ValidationException.Collector errors = new ValidationException.Collector();
        MinuteIncrements session = sessionIncrements == null || sessionIncrements.isEmpty()
                ? null
                : parse(sessionIncrements, "sessionIncrementsMinutes", errors);
        MinuteIncrements extension = extensionIncrements == null || extensionIncrements.isEmpty()
                ? null
                : parse(extensionIncrements, "extensionIncrementsMinutes", errors);

        if (sessionMinMinutes != null && sessionMinMinutes.intValue() <= 0) {
            errors.add("sessionMinMinutes", ErrorCode.VALIDATION_FAILED, "error.parking.policy.sessionMin.invalid");
        }
        if (sessionMaxMinutes != null && sessionMaxMinutes.intValue() <= 0) {
            errors.add("sessionMaxMinutes", ErrorCode.VALIDATION_FAILED, "error.parking.policy.sessionMax.invalid");
        }
        if (sessionMinMinutes != null && sessionMaxMinutes != null
                && sessionMaxMinutes.intValue() < sessionMinMinutes.intValue()) {
            errors.add("sessionMaxMinutes", ErrorCode.VALIDATION_FAILED, "error.parking.policy.sessionMax.invalid");
        }
        if (extensionMaxTotalMinutes != null && extensionMaxTotalMinutes.intValue() <= 0) {
            errors.add("extensionMaxTotalMinutes", ErrorCode.VALIDATION_FAILED,
                    "error.parking.policy.extensionMaxTotal.invalid");
        }
        if (freeMinutes != null && freeMinutes.intValue() < 0) {
            errors.add("freeMinutes", ErrorCode.VALIDATION_FAILED, "error.parking.policy.negative");
        }
        // Courtesy longer than the longest stay this zone sells would make every stay in it free.
        // Checked against the RESOLVED maximum, so a zone that only departed on the courtesy is still
        // held to the municipality's maximum rather than to nothing.
        int effectiveMax = sessionMaxMinutes != null
                ? sessionMaxMinutes.intValue()
                : require(tenantId).getSessionMaxMinutes();
        if (freeMinutes != null && freeMinutes.intValue() > effectiveMax) {
            errors.add("freeMinutes", ErrorCode.VALIDATION_FAILED, "error.parking.policy.freeMinutes.tooLong");
        }
        errors.throwIfAny();

        Instant now = clock.instant();
        ParkingZonePolicy override = zoneRepository.findByTenantIdAndZoneId(tenantId.value(), zoneId)
                .orElseGet(() -> new ParkingZonePolicy(zoneId, tenantId.value(), now));
        override.replace(session, sessionMinMinutes, sessionMaxMinutes, extension, extensionMaxTotalMinutes,
                freeMinutes, now);
        if (override.isEmpty()) {
            if (override.getVersion() > 0L || zoneRepository.existsById(zoneId)) {
                zoneRepository.delete(override);
            }
            return Optional.empty();
        }
        return Optional.of(zoneRepository.save(override));
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
                                 int graceMinutes,
                                 int freeMinutes) {
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
        if (freeMinutes < 0) {
            errors.add("freeMinutes", ErrorCode.VALIDATION_FAILED, "error.parking.policy.negative");
        }
        if (freeMinutes > sessionMaxMinutes) {
            // Courtesy longer than the longest stay sold would make every stay free — almost always a
            // typo, and one whose cost nobody notices because nothing fails.
            errors.add("freeMinutes", ErrorCode.VALIDATION_FAILED, "error.parking.policy.freeMinutes.tooLong");
        }
        errors.throwIfAny();

        Instant now = clock.instant();
        ParkingPolicy policy = repository.findById(tenantId.value()).orElse(null);
        if (policy == null) {
            return repository.save(new ParkingPolicy(tenantId.value(), session, sessionMinMinutes,
                    sessionMaxMinutes, extensionEnabled, extension, extensionMaxTotalMinutes, earlyFinishEnabled,
                    creditOnEarlyFinishEnabled, creditMinRemainingMinutes, creditExpiryDays, graceMinutes,
                    freeMinutes, now));
        }
        policy.replace(session, sessionMinMinutes, sessionMaxMinutes, extensionEnabled, extension,
                extensionMaxTotalMinutes, earlyFinishEnabled, creditOnEarlyFinishEnabled,
                creditMinRemainingMinutes, creditExpiryDays, graceMinutes, freeMinutes, now);
        return repository.save(policy);
    }

    /**
     * Checks a requested duration against what the municipality offers when starting.
     *
     * @throws UnprocessableEntityException {@code INVALID_INCREMENT} when the value is not on the
     *         list. It is never rounded to the nearest offered option: charging for something other
     *         than what the citizen asked for is worse than refusing.
     */
    public void requireSessionIncrement(ZoneRules rules, int minutes) {
        requireSessionIncrement(rules, minutes, 0);
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
    public void requireSessionIncrement(ZoneRules rules, int minutes, int savedMinutes) {
        if (minutes > 0 && minutes == savedMinutes && minutes <= rules.sessionMaxMinutes()) {
            return;
        }
        if (!rules.sessionIncrements().allows(minutes)
                || minutes < rules.sessionMinMinutes()
                || minutes > rules.sessionMaxMinutes()) {
            throw UnprocessableEntityException.of(ErrorCode.INVALID_INCREMENT, "error.parking.increment.invalid",
                    Integer.valueOf(minutes));
        }
    }

    /** The same check for an extension. The two lists are configured separately by the municipality. */
    public void requireExtensionIncrement(ZoneRules rules, int minutes) {
        if (!rules.extensionIncrements().allows(minutes)) {
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
