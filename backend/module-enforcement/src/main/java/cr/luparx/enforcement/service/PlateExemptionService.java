package cr.luparx.enforcement.service;

import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.enforcement.entity.PlateExemption;
import cr.luparx.enforcement.model.ExemptionStatus;
import cr.luparx.enforcement.model.PlateFormat;
import cr.luparx.enforcement.repository.PlateExemptionRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * The register of plates this municipality does not fine for non-payment (CONTRACT.md v0.28).
 *
 * <p>Everything here is per municipality. An exemption granted by one council says nothing about
 * another: whether an ambulance parks free in the next canton is that canton's decision, and a
 * platform-wide exemption would be one municipality legislating for the rest.</p>
 */
@Service
public class PlateExemptionService {

    private final PlateExemptionRepository exemptionRepository;
    private final Clock clock;

    public PlateExemptionService(PlateExemptionRepository exemptionRepository, Clock clock) {
        this.exemptionRepository = exemptionRepository;
        this.clock = clock;
    }

    /**
     * Registers an exemption.
     *
     * <p>The plate goes through the same normaliser the officer's lookup uses. Comparing anything
     * else would be comparing nothing: an exemption registered as {@code SJP-123} that the lookup
     * cannot find as {@code SJP123} is a fine written against a vehicle the municipality had already
     * decided not to fine.</p>
     *
     * <p>A plate that already has a live exemption is refused rather than silently given a second
     * one. Two live rows mean revoking the one an operator can see leaves the other exempting, which
     * is the kind of mistake nobody discovers — nobody complains about a fine that was not issued.</p>
     */
    @Transactional
    public PlateExemption grant(TenantId tenantId, String plate, String reason, String documentRef,
                                Instant validFrom, Instant validTo, UserId actor) {
        String normalized = PlateFormat.normalize(plate);
        String trimmedReason = reason == null ? "" : reason.trim();
        if (trimmedReason.isEmpty()) {
            // Required in words, and not as a category: what one country exempts is not what another
            // does, so an enum here would be one nation's law baked into the schema. What is
            // invariant is that somebody has to write down why.
            throw new ValidationException("reason", ErrorCode.VALIDATION_FAILED, "error.exemption.reason.required");
        }
        Instant from = validFrom == null ? clock.instant() : validFrom;
        if (validTo != null && !validTo.isAfter(from)) {
            throw new ValidationException("validTo", ErrorCode.VALIDATION_FAILED, "error.exemption.window.invalid");
        }
        exemptionRepository.findByTenantIdAndPlateAndStatus(tenantId.value(), normalized, ExemptionStatus.ACTIVE)
                .ifPresent(existing -> {
                    throw ConflictException.of(ErrorCode.EXEMPTION_ALREADY_EXISTS,
                            "error.exemption.alreadyExists", normalized);
                });
        return exemptionRepository.save(new PlateExemption(Uuid7.generate(), tenantId.value(), normalized,
                plate.trim(), trimmedReason, blankToNull(documentRef), from, validTo,
                actor == null ? null : actor.value(), clock.instant()));
    }

    /**
     * The exemption in force for this plate right now, or nothing.
     *
     * <p>This is what the officer's lookup asks. It answers only for an exemption that is live
     * <em>and</em> inside its window — one granted for next month exempts nobody today, and one that
     * ran out yesterday exempts nobody either, however {@code ACTIVE} its column still reads.</p>
     */
    @Transactional(readOnly = true)
    public Optional<PlateExemption> inForce(TenantId tenantId, String plateNormalized) {
        Instant now = clock.instant();
        return exemptionRepository
                .findByTenantIdAndPlateAndStatus(tenantId.value(), plateNormalized, ExemptionStatus.ACTIVE)
                .filter(exemption -> exemption.isInForceAt(now));
    }

    /** Corrects the window or the paperwork of a live exemption. The plate is never edited here. */
    @Transactional
    public PlateExemption amend(TenantId tenantId, UUID id, String reason, String documentRef,
                                Instant validFrom, Instant validTo) {
        PlateExemption exemption = requireInScope(tenantId, id);
        if (exemption.getStatus() != ExemptionStatus.ACTIVE) {
            throw ConflictException.of(ErrorCode.EXEMPTION_NOT_ACTIVE, "error.exemption.notActive");
        }
        String trimmedReason = reason == null ? "" : reason.trim();
        if (trimmedReason.isEmpty()) {
            throw new ValidationException("reason", ErrorCode.VALIDATION_FAILED, "error.exemption.reason.required");
        }
        Instant from = validFrom == null ? exemption.getValidFrom() : validFrom;
        if (validTo != null && !validTo.isAfter(from)) {
            throw new ValidationException("validTo", ErrorCode.VALIDATION_FAILED, "error.exemption.window.invalid");
        }
        exemption.amend(trimmedReason, blankToNull(documentRef), from, validTo);
        return exemption;
    }

    /**
     * Calls an exemption back, with a reason.
     *
     * <p>The reason is required for the same argument the grant's is: this is the answer to "why was
     * this car not fined between March and June, and why is it fined now", and an empty cell is not
     * an answer. The row is kept, never deleted.</p>
     */
    @Transactional
    public PlateExemption revoke(TenantId tenantId, UUID id, String reason, UserId actor) {
        PlateExemption exemption = requireInScope(tenantId, id);
        if (exemption.getStatus() == ExemptionStatus.REVOKED) {
            return exemption;
        }
        String trimmedReason = reason == null ? "" : reason.trim();
        if (trimmedReason.isEmpty()) {
            throw new ValidationException("reason", ErrorCode.VALIDATION_FAILED, "error.exemption.reason.required");
        }
        exemption.revoke(actor == null ? null : actor.value(), trimmedReason, clock.instant());
        return exemption;
    }

    @Transactional(readOnly = true)
    public PageResponse<PlateExemption> list(TenantId tenantId, ExemptionStatus status, String plateFragment,
                                             PageRequest request) {
        Pageable pageable = org.springframework.data.domain.PageRequest.of(request.page(), request.size());
        String fragment = plateFragment == null || plateFragment.isBlank()
                ? null
                : "%" + PlateFormat.normalizeFragment(plateFragment) + "%";
        Page<PlateExemption> page = exemptionRepository.search(tenantId.value(), status, fragment, pageable);
        return PageResponse.of(page.getContent(), request.page(), request.size(), page.getTotalElements());
    }

    @Transactional(readOnly = true)
    public PlateExemption requireInScope(TenantId tenantId, UUID id) {
        return exemptionRepository.findByIdAndTenantId(id, tenantId.value())
                .orElseThrow(() -> NotFoundException.of(ErrorCode.EXEMPTION_NOT_FOUND,
                        "error.exemption.notFound"));
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
