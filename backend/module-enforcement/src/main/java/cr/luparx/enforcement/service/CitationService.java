package cr.luparx.enforcement.service;

import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ForbiddenException;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.money.Money;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.enforcement.entity.Citation;
import cr.luparx.enforcement.entity.CitationEvent;
import cr.luparx.enforcement.entity.InfractionType;
import cr.luparx.enforcement.model.CitationAction;
import cr.luparx.enforcement.model.CitationStatus;
import cr.luparx.enforcement.model.EnforcementActor;
import cr.luparx.enforcement.model.EvidenceKind;
import cr.luparx.enforcement.model.EvidenceSource;
import cr.luparx.enforcement.port.ParkingStatusPort;
import cr.luparx.enforcement.repository.CitationEventRepository;
import cr.luparx.enforcement.repository.CitationEvidenceRepository;
import cr.luparx.enforcement.repository.CitationRepository;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.service.TenantService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Citations: the act of writing one, and every legal thing that happens to it afterwards.
 *
 * <h2>Rules this service keeps</h2>
 *
 * <ol>
 *   <li><b>Tenant first, always.</b> Every read goes through a repository method whose first argument
 *       is the municipality in the caller's token. An officer of one municipality cannot reach a
 *       citation of another by guessing an identifier, because the query that would let them does not
 *       exist.</li>
 *   <li><b>An issued citation is never edited and never deleted.</b> It moves through
 *       {@link CitationStatus}, each move guarded by the transition table and written into the
 *       citation's own history. Annulment is a status with a reason.</li>
 *   <li><b>Idempotent by the device's own identifier.</b> The street is where connections drop, so a
 *       resend must resolve to the same act — even when it carries a new {@code Idempotency-Key},
 *       which it will after a reinstall or a queue flushed by another process.</li>
 *   <li><b>Two clocks, both kept.</b> The officer's device declares when the infraction happened; the
 *       server records when it accepted the act. Neither overwrites the other.</li>
 *   <li><b>The amount is the server's.</b> It is copied from the catalogue at issue time; a client
 *       never states what a fine costs.</li>
 * </ol>
 */
@Service
public class CitationService {

    /**
     * How far in the future a device's clock may be and still be believed. A phone whose clock is
     * ahead is common; a citation dated next week is not something to store silently.
     */
    private static final Duration MAX_FUTURE_SKEW = Duration.ofMinutes(15);

    /** How far back a capture may be dated. A patrol that syncs after a long shift is normal. */
    private static final Duration MAX_PAST_SKEW = Duration.ofDays(7);

    /** Open bounds for a search with no dates. Well inside what a {@code timestamptz} can hold. */
    private static final Instant OPEN_START = Instant.parse("1970-01-01T00:00:00Z");
    private static final Instant OPEN_END = Instant.parse("9999-12-31T23:59:59Z");

    private final CitationRepository citationRepository;
    private final CitationEventRepository eventRepository;
    private final CitationEvidenceRepository evidenceRepository;
    private final InfractionTypeService infractionTypeService;
    private final CitationNumberService numberService;
    private final PlateStatusService plateStatusService;
    private final ParkingStatusPort parkingStatus;
    private final TenantService tenantService;
    private final Clock clock;

    public CitationService(CitationRepository citationRepository,
                           CitationEventRepository eventRepository,
                           CitationEvidenceRepository evidenceRepository,
                           InfractionTypeService infractionTypeService,
                           CitationNumberService numberService,
                           PlateStatusService plateStatusService,
                           ParkingStatusPort parkingStatus,
                           TenantService tenantService,
                           Clock clock) {
        this.citationRepository = citationRepository;
        this.eventRepository = eventRepository;
        this.evidenceRepository = evidenceRepository;
        this.infractionTypeService = infractionTypeService;
        this.numberService = numberService;
        this.plateStatusService = plateStatusService;
        this.parkingStatus = parkingStatus;
        this.tenantService = tenantService;
        this.clock = clock;
    }

    // --- writing one -----------------------------------------------------------------------------

    /**
     * Records what the officer saw, and issues it unless a photograph is still missing.
     *
     * <p>The two-step shape is the street, not ceremony. An infraction type that demands photographic
     * evidence produces a {@link CitationStatus#DRAFT}: the act is captured, it has no number yet, and
     * it becomes real through {@link #issue} once the upload lands — which may be minutes later, over
     * a connection that did not exist when the officer pressed the button. A type that does not demand
     * a photograph is issued immediately, because there is nothing left to wait for.</p>
     *
     * @return the citation and whether this call created it; a resend of the same
     *         {@code deviceCitationId} returns the original with {@code created = false} and writes
     *         nothing
     */
    @Transactional
    public Captured capture(TenantId tenantId, EnforcementActor actor, Capture command) {
        Tenant tenant = tenantService.requireActive(tenantId);
        Instant now = clock.instant();

        if (command.deviceCitationId() != null) {
            Optional<Citation> existing = citationRepository
                    .findByTenantIdAndDeviceCitationId(tenantId.value(), command.deviceCitationId());
            if (existing.isPresent()) {
                // A retry of an act that already exists. Not an error and not a second citation:
                // the officer wrote one ticket and the citizen must receive exactly one.
                return new Captured(existing.get(), false);
            }
        }

        InfractionType type = infractionTypeService.requireCitable(tenantId, command.infractionTypeId());
        String plateNormalized = plateStatusService.normalize(command.plate());
        Instant occurredAt = validateOccurredAt(command.occurredAt(), now);
        validateLocation(command);

        // The bay, when the officer named one. A citation may legitimately have none — a car parked
        // on a crossing is not on any numbered bay — so this is a lookup, not a requirement.
        ParkingStatusPort.Bay bay = resolveBay(tenantId, command);
        UUID zoneId = bay != null ? bay.zoneId() : command.zoneId();
        String spaceCode = bay != null ? bay.code() : trimToNull(command.spaceCode());

        // The officer's post covers certain sectors, and a citation outside them is refused
        // (CONTRACT.md v0.15). Checked before anything is written, so a refusal leaves no draft
        // behind. An officer with no sectors assigned covers the whole municipality.
        if (!actor.mayActIn(zoneId)) {
            throw ForbiddenException.of(ErrorCode.ZONE_NOT_ASSIGNED, "error.enforcement.zone.notAssigned");
        }

        // The vehicle in the register, only when the plate resolves to exactly one. A reference, and
        // never a copy of the owner's data: the citation is against the vehicle, not against a person.
        UUID vehicleId = parkingStatus.findUniqueVehicleByPlate(plateNormalized)
                .map(ParkingStatusPort.RegisteredVehicle::vehicleId)
                .orElse(null);

        // What the platform knew about the plate at that moment, kept as part of the act: it is the
        // evidence that the officer checked before writing, and the first thing an appeal asks about.
        UUID parkingSessionId = command.parkingSessionId();

        boolean issueNow = !type.isRequiresPhoto();
        Citation citation = new Citation(Uuid7.generate(), tenantId.value(), command.plate().trim(), plateNormalized,
                vehicleId, zoneId, bay != null ? bay.spaceId() : null, spaceCode, command.latitude(),
                command.longitude(), command.locationAccuracyM(), trimToNull(command.addressText()), type, occurredAt,
                actor.userIdValue(), actor.displayName(), command.deviceCitationId(), parkingSessionId,
                trimToNull(command.notes()),
                CitationStatus.DRAFT, now);

        try {
            citation = citationRepository.saveAndFlush(citation);
        } catch (DataIntegrityViolationException concurrent) {
            // Two copies of the same queued capture arriving at once: the unique index on
            // (tenant_id, device_citation_id) settles it in the database, where it must be settled.
            Optional<Citation> winner = command.deviceCitationId() == null
                    ? Optional.empty()
                    : citationRepository.findByTenantIdAndDeviceCitationId(tenantId.value(),
                            command.deviceCitationId());
            return new Captured(winner.orElseThrow(() -> concurrent), false);
        }

        writeEvent(citation, CitationAction.DRAFTED, null, CitationStatus.DRAFT, actor, null, now);
        if (issueNow) {
            citation = issueInternal(tenant, citation, actor, now);
        }
        return new Captured(citation, true);
    }

    /**
     * Turns a draft into an administrative act.
     *
     * <p>This is where the consecutive is taken, where the deadlines are computed from the infraction
     * type, and where "this kind requires a photograph" stops being advice and becomes a refusal.</p>
     */
    @Transactional
    public Citation issue(TenantId tenantId, EnforcementActor actor, UUID citationId) {
        Tenant tenant = tenantService.requireActive(tenantId);
        Citation citation = require(tenantId, citationId);
        requireTransition(citation, CitationStatus.ISSUED);
        return issueInternal(tenant, citation, actor, clock.instant());
    }

    private Citation issueInternal(Tenant tenant, Citation citation, EnforcementActor actor, Instant now) {
        InfractionType type = infractionTypeService.require(TenantId.of(citation.getTenantId()),
                citation.getInfractionTypeId());
        if (type.isRequiresPhoto()
                && evidenceRepository.countByTenantIdAndCitationIdAndKindAndSource(citation.getTenantId(),
                        citation.getId(), EvidenceKind.PHOTO, EvidenceSource.OFFICER) == 0L) {
            throw ConflictException.of(ErrorCode.CITATION_EVIDENCE_REQUIRED,
                    "error.enforcement.citation.evidenceRequired");
        }
        CitationNumberService.Assigned assigned = numberService.next(tenant, now);
        Instant dueAt = now.plus(Duration.ofDays(type.getDueDays()));
        Money discounted = type.hasDiscount() ? type.discountedFine() : null;
        Instant discountUntil = type.hasDiscount()
                ? now.plus(Duration.ofDays(type.getDiscountDays().longValue()))
                : null;

        CitationStatus from = citation.getStatus();
        citation.issue(assigned.number(), assigned.seriesYear(), assigned.sequence(), now, dueAt, discounted,
                discountUntil);
        citationRepository.save(citation);
        writeEvent(citation, CitationAction.ISSUED, from, CitationStatus.ISSUED, actor, null, now);
        return citation;
    }

    // --- what happens afterwards ------------------------------------------------------------------

    /**
     * The one entry point for every change of state, so that the transition table is consulted once
     * and the history is written every single time. A caller that could move a status without passing
     * through here is a caller that can leave a citation with no record of who moved it.
     */
    @Transactional
    public Citation transition(TenantId tenantId, EnforcementActor actor, UUID citationId, CitationStatus target,
                               CitationAction action, String reason, boolean reasonRequired) {
        Citation citation = require(tenantId, citationId);
        if (reasonRequired && (reason == null || reason.isBlank())) {
            throw new ValidationException("reason", ErrorCode.VALIDATION_FAILED,
                    "error.enforcement.citation.reasonRequired");
        }
        requireTransition(citation, target);
        if (target == CitationStatus.APPEALED) {
            InfractionType type = infractionTypeService.require(tenantId, citation.getInfractionTypeId());
            if (!type.isAllowsAppeal()) {
                throw ConflictException.of(ErrorCode.CITATION_APPEAL_NOT_ALLOWED,
                        "error.enforcement.citation.appealNotAllowed");
            }
        }
        Instant now = clock.instant();
        CitationStatus from = citation.getStatus();
        citation.moveTo(target, trimToNull(reason), now);
        citationRepository.save(citation);
        writeEvent(citation, action, from, target, actor, trimToNull(reason), now);
        return citation;
    }

    /** Annulment: the only way an issued citation stops standing, and it always carries a reason. */
    @Transactional
    public Citation cancel(TenantId tenantId, EnforcementActor actor, UUID citationId, String reason) {
        return transition(tenantId, actor, citationId, CitationStatus.CANCELLED, CitationAction.CANCELLED, reason,
                true);
    }

    /**
     * Moves citations whose payment window closed to {@link CitationStatus#EXPIRED}.
     *
     * <p>Written as a bounded, idempotent, tenant-scoped operation because that is what a scheduled
     * job needs to be able to call safely from any instance: it takes a page at a time, each move is
     * guarded by the same transition table as every other, and running it twice changes nothing the
     * second time. It is also called opportunistically when a single citation is read, so a
     * municipality that never schedules the job still sees the truth on the screen.</p>
     *
     * @return how many citations it moved
     */
    @Transactional
    public int expireOverdue(TenantId tenantId, EnforcementActor actor, int limit) {
        Instant now = clock.instant();
        List<Citation> overdue = citationRepository.findOverdue(tenantId.value(), now,
                org.springframework.data.domain.PageRequest.of(0, Math.max(1, Math.min(limit, 500))));
        for (Citation citation : overdue) {
            CitationStatus from = citation.getStatus();
            citation.moveTo(CitationStatus.EXPIRED, null, now);
            citationRepository.save(citation);
            writeEvent(citation, CitationAction.EXPIRED, from, CitationStatus.EXPIRED, actor, null, now);
        }
        return overdue.size();
    }

    // --- reading ----------------------------------------------------------------------------------

    /** One citation of this municipality. Same answer for "not yours" as for "does not exist". */
    @Transactional(readOnly = true)
    public Citation require(TenantId tenantId, UUID citationId) {
        return citationRepository.findByTenantIdAndId(tenantId.value(), citationId)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.CITATION_NOT_FOUND,
                        "error.enforcement.citation.notFound"));
    }

    /**
     * One citation, with its overdue state settled first. Used by the detail screens: a single row is
     * cheap to correct on read, and it means an unpaid citation past its date never renders as if the
     * deadline had not passed.
     */
    @Transactional
    public Citation requireCurrent(TenantId tenantId, EnforcementActor actor, UUID citationId) {
        Citation citation = require(tenantId, citationId);
        Instant now = clock.instant();
        if (citation.isOverdueAt(now)) {
            CitationStatus from = citation.getStatus();
            citation.moveTo(CitationStatus.EXPIRED, null, now);
            citationRepository.save(citation);
            writeEvent(citation, CitationAction.EXPIRED, from, CitationStatus.EXPIRED, actor, null, now);
        }
        return citation;
    }

    /** The officer's own citations, newest first. */
    @Transactional(readOnly = true)
    public PageResponse<Citation> listForInspector(TenantId tenantId, UUID inspectorUserId, PageRequest request) {
        Page<Citation> page = citationRepository.findByTenantIdAndInspectorUserIdOrderByOccurredAtDesc(
                tenantId.value(), inspectorUserId, toPageable(request));
        return PageResponse.of(page.getContent(), request.page(), request.size(), page.getTotalElements());
    }

    /**
     * The administration's filtered search. Every criterion optional, the tenant never.
     *
     * <p>An absent date becomes an open bound rather than a null parameter: see
     * {@code CitationRepository.search} — PostgreSQL cannot type a parameter that only ever appears
     * in {@code ? is null}, and a range that excludes nothing is exactly what "no filter" means.</p>
     */
    @Transactional(readOnly = true)
    public PageResponse<Citation> search(TenantId tenantId, CitationStatus status, UUID zoneId, UUID inspectorUserId,
                                         String plate, Instant from, Instant to, PageRequest request) {
        String plateNormalized = plate == null || plate.isBlank() ? null : plateStatusService.normalize(plate);
        Page<Citation> page = citationRepository.search(tenantId.value(), status, zoneId, inspectorUserId,
                plateNormalized, from == null ? OPEN_START : from, to == null ? OPEN_END : to,
                toPageable(request));
        return PageResponse.of(page.getContent(), request.page(), request.size(), page.getTotalElements());
    }

    /**
     * The citizen's fines in this municipality: only citations linked to a vehicle they registered.
     * See {@code CitationRepository.findForVehicles} for why matching on the plate alone would be a
     * data leak rather than a convenience.
     */
    @Transactional(readOnly = true)
    public PageResponse<Citation> listForVehicles(TenantId tenantId, Collection<UUID> vehicleIds,
                                                  CitationStatus status, PageRequest request) {
        if (vehicleIds == null || vehicleIds.isEmpty()) {
            return PageResponse.empty(request);
        }
        Page<Citation> page = citationRepository.findForVehicles(tenantId.value(), vehicleIds, status,
                toPageable(request));
        return PageResponse.of(page.getContent(), request.page(), request.size(), page.getTotalElements());
    }

    @Transactional(readOnly = true)
    public Citation requireForVehicles(TenantId tenantId, Collection<UUID> vehicleIds, UUID citationId) {
        if (vehicleIds == null || vehicleIds.isEmpty()) {
            throw NotFoundException.of(ErrorCode.CITATION_NOT_FOUND, "error.enforcement.citation.notFound");
        }
        return citationRepository.findForVehicle(tenantId.value(), citationId, vehicleIds)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.CITATION_NOT_FOUND,
                        "error.enforcement.citation.notFound"));
    }

    /** The citation's own history — part of the act, and returned with it. */
    @Transactional(readOnly = true)
    public List<CitationEvent> history(TenantId tenantId, UUID citationId) {
        return eventRepository.findByTenantIdAndCitationIdOrderByOccurredAtAsc(tenantId.value(), citationId);
    }

    /** Written by {@code EvidenceService} once a file or a note is safely stored. */
    @Transactional
    public void recordEvidenceAttached(Citation citation, EnforcementActor actor, Instant now) {
        writeEvent(citation, CitationAction.EVIDENCE_ATTACHED, citation.getStatus(), citation.getStatus(), actor,
                null, now);
    }

    // --- internals --------------------------------------------------------------------------------

    private void writeEvent(Citation citation, CitationAction action, CitationStatus from, CitationStatus to,
                            EnforcementActor actor, String reason, Instant now) {
        eventRepository.save(new CitationEvent(Uuid7.generate(), citation.getTenantId(), citation.getId(), action,
                from, to, actor == null ? null : actor.userIdValue(), actor == null ? null : actor.portal(), reason,
                actor == null ? null : actor.ipHash(), now));
    }

    private void requireTransition(Citation citation, CitationStatus target) {
        if (!citation.getStatus().canMoveTo(target)) {
            throw ConflictException.of(ErrorCode.CITATION_INVALID_TRANSITION,
                    "error.enforcement.citation.invalidTransition");
        }
    }

    private ParkingStatusPort.Bay resolveBay(TenantId tenantId, Capture command) {
        if (command.spaceId() != null) {
            return parkingStatus.findBayById(tenantId, command.spaceId())
                    .orElseThrow(() -> NotFoundException.of(ErrorCode.PARKING_SPACE_NOT_FOUND,
                            "error.parking.space.notFound"));
        }
        if (command.zoneId() != null && command.spaceCode() != null && !command.spaceCode().isBlank()) {
            return parkingStatus.findBay(tenantId, command.zoneId(), command.spaceCode().trim())
                    .orElseThrow(() -> NotFoundException.of(ErrorCode.PARKING_SPACE_NOT_FOUND,
                            "error.parking.space.notFound"));
        }
        return null;
    }

    /**
     * The moment the officer declared, checked but never rewritten.
     *
     * <p>A device clock that is slightly ahead is ordinary and is accepted as the officer sent it; one
     * that claims next Tuesday is refused, because storing it would put a citation outside every
     * report and every deadline. The bound in the past is generous on purpose: a patrol that syncs at
     * the end of a long shift, or after a week without coverage, is exactly the case this module is
     * built for.</p>
     */
    private Instant validateOccurredAt(Instant occurredAt, Instant now) {
        if (occurredAt == null) {
            // The device did not say. The server's own clock is the honest fallback, and the citation
            // records both moments anyway.
            return now;
        }
        if (occurredAt.isAfter(now.plus(MAX_FUTURE_SKEW))) {
            throw new ValidationException("occurredAt", ErrorCode.VALIDATION_FAILED,
                    "error.enforcement.citation.occurredAtFuture");
        }
        if (occurredAt.isBefore(now.minus(MAX_PAST_SKEW))) {
            throw new ValidationException("occurredAt", ErrorCode.VALIDATION_FAILED,
                    "error.enforcement.citation.occurredAtTooOld");
        }
        return occurredAt;
    }

    /** Coordinates are either a complete, plausible fix or absent. Half a fix is not a location. */
    private void validateLocation(Capture command) {
        boolean hasLatitude = command.latitude() != null;
        boolean hasLongitude = command.longitude() != null;
        if (hasLatitude != hasLongitude) {
            throw new ValidationException(hasLatitude ? "longitude" : "latitude", ErrorCode.VALIDATION_FAILED,
                    "error.enforcement.citation.coordinatesIncomplete");
        }
        if (!hasLatitude) {
            return;
        }
        if (outOfRange(command.latitude(), 90L) || outOfRange(command.longitude(), 180L)) {
            throw new ValidationException("latitude", ErrorCode.VALIDATION_FAILED,
                    "error.enforcement.citation.coordinatesInvalid");
        }
        if (command.locationAccuracyM() != null && command.locationAccuracyM().signum() < 0) {
            throw new ValidationException("locationAccuracyM", ErrorCode.VALIDATION_FAILED,
                    "error.enforcement.citation.coordinatesInvalid");
        }
    }

    private boolean outOfRange(BigDecimal value, long bound) {
        BigDecimal rounded = value.setScale(6, RoundingMode.HALF_UP);
        return rounded.abs().compareTo(BigDecimal.valueOf(bound)) > 0;
    }

    private org.springframework.data.domain.Pageable toPageable(PageRequest request) {
        return org.springframework.data.domain.PageRequest.of(request.page(), request.size());
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /**
     * What an officer's device sends. A record, so the controller cannot hand the domain a
     * half-built entity and so every field the domain accepts is visible in one place (mass
     * assignment, SECURITY.md §4).
     */
    public record Capture(UUID infractionTypeId, String plate, UUID zoneId, UUID spaceId, String spaceCode,
                          BigDecimal latitude, BigDecimal longitude, BigDecimal locationAccuracyM, String addressText,
                          Instant occurredAt, String deviceCitationId, UUID parkingSessionId, String notes) {
    }

    /** A citation and whether this call is the one that created it. */
    public record Captured(Citation citation, boolean created) {
    }
}
