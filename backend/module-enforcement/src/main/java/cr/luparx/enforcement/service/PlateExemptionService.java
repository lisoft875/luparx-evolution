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
import cr.luparx.enforcement.entity.ExemptionPlate;
import cr.luparx.enforcement.entity.ExemptionType;
import cr.luparx.enforcement.entity.PlateExemption;
import cr.luparx.enforcement.model.BeneficiaryKind;
import cr.luparx.enforcement.model.ExemptionStatus;
import cr.luparx.enforcement.model.PlateFormat;
import cr.luparx.enforcement.repository.ExemptionPlateRepository;
import cr.luparx.enforcement.repository.PlateExemptionRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * The register of permits under which this municipality does not fine a vehicle (CONTRACT.md v0.30).
 *
 * <h2>Requested, then decided</h2>
 *
 * <p>A permit is <b>asked for</b> and then granted or refused, by two different acts. That is not
 * ceremony: "who authorised that this car did not pay" is the question an auditor asks, and it is not
 * answered by naming whoever typed the request. The same person may do both — a small municipality
 * may have nobody else, and refusing would push the work off the platform and out of the record —
 * but the row then says so plainly, because {@link PlateExemption#getRequestedBy()} and
 * {@link PlateExemption#getDecidedBy()} are the same person and the audit entry names that.</p>
 *
 * <h2>One permit, several plates</h2>
 *
 * <p>Because a disability permit belongs to the person and travels with them: some days in their own
 * car, some days in the car of whoever drives them. One plate per permit means registering the same
 * permit twice, and the day one is revoked the other keeps exempting.</p>
 *
 * <h2>Everything here is per municipality</h2>
 *
 * <p>A permit granted by one council says nothing about another: whether an ambulance parks free in
 * the next canton is that canton's decision, and a platform-wide exemption would be one municipality
 * legislating for the rest.</p>
 */
@Service
public class PlateExemptionService {

    /** As many plates as one permit may cover. Beyond this it is a fleet policy, not a permit. */
    private static final int MAX_PLATES = 10;

    private static final int MAX_REASON = 300;
    private static final int MAX_BENEFICIARY_NAME = 200;
    private static final int MAX_BENEFICIARY_DOCUMENT = 64;

    /** The states in which a granted permit can be found, during the expansion phase (ADR 0010). */
    private static final Collection<ExemptionStatus> GRANTED =
            List.of(ExemptionStatus.APPROVED, ExemptionStatus.ACTIVE);

    private final PlateExemptionRepository exemptionRepository;
    private final ExemptionPlateRepository plateRepository;
    private final ExemptionTypeService typeService;
    private final Clock clock;

    public PlateExemptionService(PlateExemptionRepository exemptionRepository,
                                 ExemptionPlateRepository plateRepository,
                                 ExemptionTypeService typeService,
                                 Clock clock) {
        this.exemptionRepository = exemptionRepository;
        this.plateRepository = plateRepository;
        this.typeService = typeService;
        this.clock = clock;
    }

    // --- the request ------------------------------------------------------------------------------

    /**
     * Registers a request. It is PENDING and it exempts nobody: a permit grants nothing until it is
     * granted.
     *
     * <p>Every plate goes through the same normaliser the officer's lookup uses. Comparing anything
     * else would be comparing nothing: a permit registered as {@code SJP-123} that the lookup cannot
     * find as {@code SJP123} is a fine written against a vehicle the municipality had already decided
     * not to fine.</p>
     */
    @Transactional
    public PlateExemption request(TenantId tenantId, Draft draft, UserId actor) {
        ExemptionType type = typeService.requireUsable(tenantId, draft.exemptionTypeId());
        List<Plate> plates = validate(draft, type);
        Instant now = clock.instant();

        Plate primary = plates.get(0);
        PlateExemption exemption = new PlateExemption(Uuid7.generate(), tenantId.value(), type.getId(),
                primary.normalized(), primary.raw(), draft.beneficiaryKind(), trimToNull(draft.beneficiaryName()),
                trimToNull(draft.beneficiaryDocument()), draft.reason().trim(), trimToNull(draft.documentRef()),
                draft.validFrom() == null ? now : draft.validFrom(), draft.validTo(),
                actor == null ? null : actor.value(), now);
        exemption = exemptionRepository.save(exemption);

        for (Plate plate : plates) {
            // Refused at the door rather than after the paperwork is gathered: a plate that already
            // carries a granted permit has to have it revoked first, and that is a deliberate act
            // with a reason. The real gate is at approval — see requireFree — because between the
            // request and the decision somebody else's permit may have been granted.
            requireFree(tenantId, plate.normalized(), exemption.getId());
            plateRepository.save(new ExemptionPlate(exemption.getId(), tenantId.value(), plate.normalized(),
                    plate.raw(), ExemptionStatus.PENDING, now));
        }
        return exemption;
    }

    // --- the decision -----------------------------------------------------------------------------

    /**
     * Grants it. From here on it exempts, subject to its window.
     *
     * <p>Self-approval is not refused here; it is recorded. The caller compares
     * {@link PlateExemption#getRequestedBy()} with the actor and says so in the audit entry.</p>
     */
    @Transactional
    public PlateExemption approve(TenantId tenantId, UUID id, UserId actor) {
        PlateExemption exemption = requirePending(tenantId, id);
        List<ExemptionPlate> plates = plateRepository.findById_ExemptionIdOrderByAddedAtAsc(id);
        for (ExemptionPlate plate : plates) {
            requireFree(tenantId, plate.getPlate(), id);
        }
        exemption.approve(actor == null ? null : actor.value(), clock.instant());
        mirror(plates, ExemptionStatus.APPROVED);
        return exemption;
    }

    /** Refuses it, with a reason. The row stays: a refusal is an answer somebody is owed. */
    @Transactional
    public PlateExemption reject(TenantId tenantId, UUID id, String reason, UserId actor) {
        PlateExemption exemption = requirePending(tenantId, id);
        exemption.reject(actor == null ? null : actor.value(), requireReason(reason, "decisionReason"),
                clock.instant());
        mirror(plateRepository.findById_ExemptionIdOrderByAddedAtAsc(id), ExemptionStatus.REJECTED);
        return exemption;
    }

    /**
     * Calls a granted permit back, with a reason.
     *
     * <p>Required for the same argument the request's reason is: this is the answer to "why was this
     * car not fined between March and June, and why is it fined now", and an empty cell is not an
     * answer. The row is kept, never deleted.</p>
     */
    @Transactional
    public PlateExemption revoke(TenantId tenantId, UUID id, String reason, UserId actor) {
        PlateExemption exemption = requireInScope(tenantId, id);
        if (exemption.getStatus() == ExemptionStatus.REVOKED) {
            return exemption;
        }
        if (!exemption.getStatus().isGranted()) {
            throw ConflictException.of(ErrorCode.EXEMPTION_NOT_ACTIVE, "error.exemption.notActive");
        }
        exemption.revoke(actor == null ? null : actor.value(), requireReason(reason, "reason"), clock.instant());
        mirror(plateRepository.findById_ExemptionIdOrderByAddedAtAsc(id), ExemptionStatus.REVOKED);
        return exemption;
    }

    /** Corrects the category, the window, the beneficiary or the paperwork. Plates are changed apart. */
    @Transactional
    public PlateExemption amend(TenantId tenantId, UUID id, Draft draft) {
        PlateExemption exemption = requireEditable(tenantId, id);
        ExemptionType type = typeService.requireUsable(tenantId, draft.exemptionTypeId());
        validateFields(draft, type, exemption.getValidFrom());
        exemption.amend(type.getId(), draft.beneficiaryKind(), trimToNull(draft.beneficiaryName()),
                trimToNull(draft.beneficiaryDocument()), draft.reason().trim(), trimToNull(draft.documentRef()),
                draft.validFrom() == null ? exemption.getValidFrom() : draft.validFrom(), draft.validTo());
        return exemption;
    }

    // --- the plates -------------------------------------------------------------------------------

    /** Adds a plate to a permit that is still open. */
    @Transactional
    public ExemptionPlate addPlate(TenantId tenantId, UUID id, String plate) {
        PlateExemption exemption = requireEditable(tenantId, id);
        Plate parsed = parsePlate(plate, "plates");
        if (plateRepository.findByTenantIdAndId_ExemptionIdAndId_Plate(tenantId.value(), id, parsed.normalized())
                .isPresent()) {
            // Already covered. Saying so is more useful than silently doing nothing.
            throw ConflictException.of(ErrorCode.EXEMPTION_ALREADY_EXISTS, "error.exemption.alreadyExists",
                    parsed.normalized());
        }
        if (plateRepository.countById_ExemptionId(id) >= MAX_PLATES) {
            throw ConflictException.of(ErrorCode.EXEMPTION_PLATE_LIMIT, "error.exemption.plateLimit", MAX_PLATES);
        }
        requireFree(tenantId, parsed.normalized(), id);
        ExemptionPlate added = plateRepository.save(new ExemptionPlate(id, tenantId.value(), parsed.normalized(),
                parsed.raw(), exemption.getStatus(), clock.instant()));
        mirrorPrimary(exemption, id);
        return added;
    }

    /**
     * Removes a plate from a permit.
     *
     * <p>The last one cannot go: a permit covering nothing is a row that says a municipality decided
     * something about no vehicle at all. Revoking the permit is the act that was meant.</p>
     */
    @Transactional
    public void removePlate(TenantId tenantId, UUID id, String plate) {
        PlateExemption exemption = requireEditable(tenantId, id);
        String normalized = PlateFormat.normalize(plate);
        ExemptionPlate row = plateRepository
                .findByTenantIdAndId_ExemptionIdAndId_Plate(tenantId.value(), id, normalized)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.EXEMPTION_NOT_FOUND, "error.exemption.notFound"));
        if (plateRepository.countById_ExemptionId(id) <= 1) {
            throw ConflictException.of(ErrorCode.EXEMPTION_LAST_PLATE, "error.exemption.lastPlate");
        }
        plateRepository.delete(row);
        plateRepository.flush();
        mirrorPrimary(exemption, id);
    }

    @Transactional(readOnly = true)
    public List<ExemptionPlate> platesOf(UUID exemptionId) {
        return plateRepository.findById_ExemptionIdOrderByAddedAtAsc(exemptionId);
    }

    /** The plates of a whole page of permits, so a list screen does not ask once per row. */
    @Transactional(readOnly = true)
    public Map<UUID, List<ExemptionPlate>> platesOf(Collection<UUID> exemptionIds) {
        Map<UUID, List<ExemptionPlate>> byExemption = new LinkedHashMap<>();
        if (exemptionIds == null || exemptionIds.isEmpty()) {
            return byExemption;
        }
        for (ExemptionPlate plate : plateRepository.findById_ExemptionIdInOrderByAddedAtAsc(exemptionIds)) {
            byExemption.computeIfAbsent(plate.getExemptionId(), key -> new ArrayList<>()).add(plate);
        }
        return byExemption;
    }

    // --- the officer's question -------------------------------------------------------------------

    /**
     * The permit in force for this plate right now, or nothing. This is what the officer's lookup
     * asks.
     *
     * <p>It answers only for a permit that is granted <em>and</em> inside its window: one approved for
     * next month exempts nobody today, and one that ran out yesterday exempts nobody either, however
     * {@code APPROVED} its column still reads.</p>
     *
     * <p>The second attempt is the price of the expansion phase, not a design: an instance older than
     * V29_0 grants a permit by writing the parent's deprecated plate column alone, and missing it
     * would mean fining a vehicle this municipality had already decided not to fine. It goes when the
     * column does.</p>
     */
    @Transactional(readOnly = true)
    public Optional<PlateExemption> inForce(TenantId tenantId, String plateNormalized) {
        Instant now = clock.instant();
        Optional<PlateExemption> current = plateRepository
                .findByTenantIdAndId_PlateAndStatus(tenantId.value(), plateNormalized, ExemptionStatus.APPROVED)
                .flatMap(plate -> exemptionRepository.findByIdAndTenantId(plate.getExemptionId(), tenantId.value()));
        if (current.isEmpty()) {
            current = exemptionRepository.findByTenantIdAndPlateAndStatusIn(tenantId.value(), plateNormalized,
                    GRANTED);
        }
        return current.filter(exemption -> exemption.isInForceAt(now));
    }

    // --- reading ----------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public PageResponse<PlateExemption> list(TenantId tenantId, ExemptionStatus status, UUID exemptionTypeId,
                                             String plateFragment, PageRequest request) {
        Pageable pageable = org.springframework.data.domain.PageRequest.of(request.page(), request.size());
        String fragment = plateFragment == null || plateFragment.isBlank()
                ? null
                : "%" + PlateFormat.normalizeFragment(plateFragment) + "%";
        Page<PlateExemption> page = exemptionRepository.search(tenantId.value(), status, exemptionTypeId, fragment,
                pageable);
        return PageResponse.of(page.getContent(), request.page(), request.size(), page.getTotalElements());
    }

    @Transactional(readOnly = true)
    public PlateExemption requireInScope(TenantId tenantId, UUID id) {
        return exemptionRepository.findByIdAndTenantId(id, tenantId.value())
                .orElseThrow(() -> NotFoundException.of(ErrorCode.EXEMPTION_NOT_FOUND,
                        "error.exemption.notFound"));
    }

    // --- internals --------------------------------------------------------------------------------

    private PlateExemption requirePending(TenantId tenantId, UUID id) {
        PlateExemption exemption = requireInScope(tenantId, id);
        if (exemption.getStatus() != ExemptionStatus.PENDING) {
            // "Somebody got there first" is the honest answer, and it is not the same as "not found".
            throw ConflictException.of(ErrorCode.EXEMPTION_NOT_PENDING, "error.exemption.notPending");
        }
        return exemption;
    }

    /** Open to change: waiting for a decision, or granted. A refusal or a revocation is not edited. */
    private PlateExemption requireEditable(TenantId tenantId, UUID id) {
        PlateExemption exemption = requireInScope(tenantId, id);
        if (exemption.getStatus() != ExemptionStatus.PENDING && !exemption.getStatus().isGranted()) {
            throw ConflictException.of(ErrorCode.EXEMPTION_NOT_EDITABLE, "error.exemption.notEditable");
        }
        return exemption;
    }

    /**
     * Refuses a plate that another permit already covers with a granted one.
     *
     * <p>Two granted rows mean revoking the one an operator can see leaves the other exempting, which
     * is the kind of mistake nobody discovers — nobody complains about a fine that was not issued.
     * The database holds the same invariant with a partial unique index; this is what turns the
     * constraint violation into a sentence somebody can read.</p>
     */
    private void requireFree(TenantId tenantId, String plate, UUID selfId) {
        plateRepository.findByTenantIdAndId_PlateAndStatus(tenantId.value(), plate, ExemptionStatus.APPROVED)
                .filter(existing -> !existing.getExemptionId().equals(selfId))
                .ifPresent(existing -> {
                    throw ConflictException.of(ErrorCode.EXEMPTION_ALREADY_EXISTS, "error.exemption.alreadyExists",
                            plate);
                });
    }

    /** Copies the parent's state onto its plates, in the parent's own transaction. */
    private void mirror(List<ExemptionPlate> plates, ExemptionStatus status) {
        for (ExemptionPlate plate : plates) {
            plate.mirrorStatus(status);
            plateRepository.save(plate);
        }
    }

    /** Keeps the parent's deprecated single-plate column pointing at the first covered plate. */
    private void mirrorPrimary(PlateExemption exemption, UUID id) {
        plateRepository.findById_ExemptionIdOrderByAddedAtAsc(id).stream().findFirst()
                .ifPresent(first -> exemption.mirrorPrimaryPlate(first.getPlate(), first.getPlateRaw()));
    }

    private List<Plate> validate(Draft draft, ExemptionType type) {
        validateFields(draft, type, null);
        ValidationException.Collector errors = new ValidationException.Collector();
        List<String> raw = draft.plates() == null ? List.of() : draft.plates();
        if (raw.isEmpty()) {
            errors.add("plates", ErrorCode.VALIDATION_FAILED, "error.exemption.plates.required");
            errors.throwIfAny();
        }
        if (raw.size() > MAX_PLATES) {
            errors.add("plates", ErrorCode.VALIDATION_FAILED, "error.exemption.plateLimit");
            errors.throwIfAny();
        }
        // A set, because the same plate typed twice is a slip and not a second vehicle; the order the
        // operator typed is kept, since the first one is what the deprecated column mirrors.
        Set<String> seen = new LinkedHashSet<>();
        List<Plate> plates = new ArrayList<>(raw.size());
        for (int index = 0; index < raw.size(); index++) {
            String value = raw.get(index);
            String normalized;
            try {
                normalized = PlateFormat.normalize(value);
            } catch (ValidationException invalid) {
                errors.add("plates[" + index + "]", ErrorCode.VALIDATION_FAILED, "error.exemption.plate.invalid");
                continue;
            }
            if (seen.add(normalized)) {
                plates.add(new Plate(normalized, value.trim()));
            }
        }
        errors.throwIfAny();
        return plates;
    }

    private void validateFields(Draft draft, ExemptionType type, Instant currentFrom) {
        ValidationException.Collector errors = new ValidationException.Collector();
        String reason = draft.reason() == null ? "" : draft.reason().trim();
        if (reason.isEmpty() || reason.length() > MAX_REASON) {
            // Required in words and not only as a category: the category says which rule was applied,
            // and the reason says why this vehicle falls under it. Both are read by whoever asks.
            errors.add("reason", ErrorCode.VALIDATION_FAILED, "error.exemption.reason.required");
        }
        String name = trimToNull(draft.beneficiaryName());
        if (type.isRequiresBeneficiary()) {
            if (name == null) {
                // Per category, because the two are genuinely different obligations: a half-hour
                // courtesy may have no beneficiary; a disability permit without a person is not one.
                errors.add("beneficiaryName", ErrorCode.VALIDATION_FAILED, "error.exemption.beneficiary.required");
            }
            if (draft.beneficiaryKind() == null) {
                errors.add("beneficiaryKind", ErrorCode.VALIDATION_FAILED, "error.exemption.beneficiary.required");
            }
        }
        if (name != null && name.length() > MAX_BENEFICIARY_NAME) {
            errors.add("beneficiaryName", ErrorCode.VALIDATION_FAILED, "error.exemption.beneficiary.name");
        }
        String document = trimToNull(draft.beneficiaryDocument());
        if (document != null && document.length() > MAX_BENEFICIARY_DOCUMENT) {
            errors.add("beneficiaryDocument", ErrorCode.VALIDATION_FAILED, "error.exemption.beneficiary.document");
        }
        Instant from = draft.validFrom() == null ? currentFrom : draft.validFrom();
        if (draft.validTo() != null && from != null && !draft.validTo().isAfter(from)) {
            errors.add("validTo", ErrorCode.VALIDATION_FAILED, "error.exemption.window.invalid");
        }
        errors.throwIfAny();
    }

    private static Plate parsePlate(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new ValidationException(field, ErrorCode.VALIDATION_FAILED, "error.exemption.plates.required");
        }
        return new Plate(PlateFormat.normalize(value), value.trim());
    }

    private static String requireReason(String reason, String field) {
        String trimmed = reason == null ? "" : reason.trim();
        if (trimmed.isEmpty() || trimmed.length() > MAX_REASON) {
            throw new ValidationException(field, ErrorCode.VALIDATION_FAILED, "error.exemption.reason.required");
        }
        return trimmed;
    }

    private static String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /** A plate as stored and as typed. Both are kept: the second is what an appeal argues over. */
    private record Plate(String normalized, String raw) {
    }

    /**
     * A permit as somebody submitted it.
     *
     * <p>A record and not the entity: what arrives from the wire is a request, and letting a
     * controller hand a half-built entity to the domain is how mass assignment gets in. Note what is
     * <b>not</b> here — the status, the decision, the requester: those are the platform's to write.</p>
     */
    public record Draft(UUID exemptionTypeId, List<String> plates, BeneficiaryKind beneficiaryKind,
                        String beneficiaryName, String beneficiaryDocument, String reason, String documentRef,
                        Instant validFrom, Instant validTo) {
    }
}
