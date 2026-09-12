package cr.luparx.app.web;

import cr.luparx.app.web.dto.EnforcementDtos;
import cr.luparx.app.web.dto.ParkingDtos;
import cr.luparx.core.money.Money;
import cr.luparx.enforcement.entity.AppealNotice;
import cr.luparx.enforcement.entity.Citation;
import cr.luparx.enforcement.entity.CitationAppeal;
import cr.luparx.enforcement.entity.CitationEvent;
import cr.luparx.enforcement.entity.CitationEvidence;
import cr.luparx.enforcement.entity.InfractionType;
import cr.luparx.enforcement.model.EvidenceKind;
import cr.luparx.core.id.TenantId;
import cr.luparx.enforcement.entity.EnforcementCheck;
import cr.luparx.enforcement.entity.ExemptionDocument;
import cr.luparx.enforcement.entity.ExemptionPlate;
import cr.luparx.enforcement.entity.ExemptionType;
import cr.luparx.enforcement.entity.PlateExemption;
import cr.luparx.enforcement.repository.CitationRepository;
import cr.luparx.enforcement.repository.ExemptionDocumentRepository;
import cr.luparx.enforcement.repository.ExemptionPlateRepository;
import cr.luparx.enforcement.repository.ExemptionTypeRepository;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.service.UserDirectoryService;
import cr.luparx.enforcement.model.PlateStatus;
import cr.luparx.enforcement.port.ParkingStatusPort;
import cr.luparx.parking.entity.ParkingZone;
import cr.luparx.parking.repository.ParkingZoneRepository;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Entity → DTO mapping for enforcement, kept apart from {@link ParkingMapper} for the same reason
 * that module is kept apart: two contexts that share a mapper end up sharing a shape.
 *
 * <p>Zone names are resolved <b>once per response</b> through a small map of the municipality's zones,
 * never one query per citation. A listing of citations is the collection in this platform most likely
 * to be long, and an N+1 here would get slower exactly as a municipality enforces more.</p>
 *
 * <p>Two views of the same row live here on purpose. {@code toCitation} is what an officer and an
 * administrator read; {@code toFine} is what the citizen reads, and it deliberately omits the officer
 * identifier, the device clock skew and the internal session reference. Writing the difference as two
 * methods, rather than one method with a flag, is what keeps somebody from widening the citizen's view
 * by accident.</p>
 */
@Component
public class EnforcementMapper {

    private final ParkingZoneRepository zoneRepository;
    private final CitationRepository citationRepository;
    private final UserDirectoryService userDirectoryService;
    private final ExemptionTypeRepository exemptionTypeRepository;
    private final ExemptionPlateRepository exemptionPlateRepository;
    private final ExemptionDocumentRepository exemptionDocumentRepository;
    private final Clock clock;

    public EnforcementMapper(ParkingZoneRepository zoneRepository,
                             CitationRepository citationRepository,
                             UserDirectoryService userDirectoryService,
                             ExemptionTypeRepository exemptionTypeRepository,
                             ExemptionPlateRepository exemptionPlateRepository,
                             ExemptionDocumentRepository exemptionDocumentRepository,
                             Clock clock) {
        this.zoneRepository = zoneRepository;
        this.citationRepository = citationRepository;
        this.userDirectoryService = userDirectoryService;
        this.exemptionTypeRepository = exemptionTypeRepository;
        this.exemptionPlateRepository = exemptionPlateRepository;
        this.exemptionDocumentRepository = exemptionDocumentRepository;
        this.clock = clock;
    }

    // --- catalogue ---------------------------------------------------------------------------------

    public EnforcementDtos.InfractionTypeResponse toInfractionType(InfractionType type) {
        return new EnforcementDtos.InfractionTypeResponse(
                type.getId(),
                type.getCode(),
                type.getName(),
                type.getDescription(),
                money(type.getFine()),
                type.hasDiscount() ? money(type.discountedFine()) : null,
                type.getDiscountDays(),
                type.getDiscountPercent(),
                type.getDueDays(),
                type.isRequiresPhoto(),
                type.isAllowsAppeal(),
                type.isActive());
    }

    public List<EnforcementDtos.InfractionTypeResponse> toInfractionTypes(List<InfractionType> types) {
        List<EnforcementDtos.InfractionTypeResponse> body = new ArrayList<>(types.size());
        for (InfractionType type : types) {
            body.add(toInfractionType(type));
        }
        return body;
    }

    // --- plate lookup -------------------------------------------------------------------------------

    public EnforcementDtos.PlateStatusResponse toPlateStatus(PlateStatus status) {
        return toPlateStatus(status, null);
    }

    /**
     * @param checkId the fiscalisation-log entry this lookup produced (v0.29). It travels back so the
     *                citation the officer may write next can point at it.
     */
    public EnforcementDtos.PlateStatusResponse toPlateStatus(PlateStatus status, java.util.UUID checkId) {
        List<EnforcementDtos.ActiveStayResponse> others = new ArrayList<>(status.otherStays().size());
        for (ParkingStatusPort.ActiveStay stay : status.otherStays()) {
            others.add(toStay(stay));
        }
        return new EnforcementDtos.PlateStatusResponse(
                status.plate(),
                status.plateNormalized(),
                status.verdict(),
                status.verdict().labelKey(),
                status.requiresBay(),
                status.bay() == null ? null : new EnforcementDtos.BayResponse(status.bay().spaceId(),
                        status.bay().code(), status.bay().zoneId(), status.bay().zoneCode(),
                        status.bay().zoneName()),
                status.coveringStay() == null ? null : toStay(status.coveringStay()),
                status.expiredStay() == null ? null : toStay(status.expiredStay()),
                status.exemption() == null ? null : toExemptionSummary(status.exemption()),
                others,
                status.graceMinutes(),
                checkId,
                status.checkedAt());
    }

    /** Only what an officer needs in order to justify not fining. Never who granted it, never whose. */
    private EnforcementDtos.PlateExemptionSummary toExemptionSummary(PlateExemption exemption) {
        String typeName = exemption.getExemptionTypeId() == null
                ? null
                : exemptionTypeRepository.findByTenantIdAndId(exemption.getTenantId(),
                        exemption.getExemptionTypeId()).map(ExemptionType::getName).orElse(null);
        return new EnforcementDtos.PlateExemptionSummary(exemption.getId(), exemption.getPlate(),
                exemption.getReason(), exemption.getDocumentRef(), typeName, exemption.getValidFrom(),
                exemption.getValidTo());
    }

    // --- permits (CONTRACT.md v0.30) ---------------------------------------------------------------

    /**
     * A page of the permit register, with categories, plates, document counts and the two names
     * resolved <b>once for the whole page</b>.
     *
     * <p>Four queries for twenty-five permits rather than a hundred: the same rule the citation
     * listing follows, and for the same reason — a screen that asks per row gets slower every month a
     * municipality operates.</p>
     */
    public List<EnforcementDtos.PlateExemptionResponse> toExemptions(TenantId tenantId,
                                                                    List<PlateExemption> exemptions) {
        if (exemptions == null || exemptions.isEmpty()) {
            return List.of();
        }
        List<UUID> ids = exemptions.stream().map(PlateExemption::getId).toList();

        Map<UUID, ExemptionType> types = new HashMap<>();
        for (ExemptionType type : exemptionTypeRepository.findByTenantIdOrderByNameAsc(tenantId.value())) {
            types.put(type.getId(), type);
        }
        Map<UUID, List<ExemptionPlate>> plates = new HashMap<>();
        for (ExemptionPlate plate : exemptionPlateRepository.findById_ExemptionIdInOrderByAddedAtAsc(ids)) {
            plates.computeIfAbsent(plate.getExemptionId(), key -> new ArrayList<>()).add(plate);
        }
        Map<UUID, Integer> documents = new HashMap<>();
        for (Object[] row : exemptionDocumentRepository.countByExemption(tenantId.value(), ids)) {
            documents.put((UUID) row[0], ((Number) row[1]).intValue());
        }
        Map<UUID, String> names = names(exemptions.stream()
                .flatMap(exemption -> java.util.stream.Stream.of(exemption.getRequestedBy(), exemption.getDecidedBy()))
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList());

        Instant now = clock.instant();
        List<EnforcementDtos.PlateExemptionResponse> result = new ArrayList<>(exemptions.size());
        for (PlateExemption exemption : exemptions) {
            ExemptionType type = exemption.getExemptionTypeId() == null
                    ? null
                    : types.get(exemption.getExemptionTypeId());
            result.add(new EnforcementDtos.PlateExemptionResponse(
                    exemption.getId(),
                    exemption.getPlate(),
                    exemption.getPlateRaw(),
                    exemption.getReason(),
                    exemption.getDocumentRef(),
                    exemption.getStatus(),
                    exemption.getValidFrom(),
                    exemption.getValidTo(),
                    // All three computed against now, never stored: running out is a fact about the
                    // clock and a column would need a job to stay true (see ExemptionStatus).
                    exemption.isInForceAt(now),
                    exemption.isPendingAt(now),
                    exemption.isExpiredAt(now),
                    exemption.getGrantedAt(),
                    exemption.getRevokedAt(),
                    exemption.getRevokeReason(),
                    exemption.getExemptionTypeId(),
                    type == null ? null : type.getCode(),
                    type == null ? null : type.getName(),
                    plates.getOrDefault(exemption.getId(), List.of()).stream().map(this::toExemptionPlate).toList(),
                    exemption.getBeneficiaryKind(),
                    exemption.getBeneficiaryName(),
                    exemption.getBeneficiaryDocument(),
                    exemption.getRequestedAt(),
                    names.get(exemption.getRequestedBy()),
                    exemption.getDecidedAt(),
                    names.get(exemption.getDecidedBy()),
                    exemption.getDecisionReason(),
                    exemption.getRequestedBy() != null && exemption.getRequestedBy().equals(exemption.getDecidedBy()),
                    documents.getOrDefault(exemption.getId(), 0)));
        }
        return result;
    }

    public EnforcementDtos.PlateExemptionResponse toExemption(TenantId tenantId, PlateExemption exemption) {
        return toExemptions(tenantId, List.of(exemption)).get(0);
    }

    private EnforcementDtos.ExemptionPlateResponse toExemptionPlate(ExemptionPlate plate) {
        return new EnforcementDtos.ExemptionPlateResponse(plate.getPlate(), plate.getPlateRaw(),
                plate.getStatus(), plate.getAddedAt());
    }

    public EnforcementDtos.ExemptionTypeResponse toExemptionType(ExemptionType type) {
        return new EnforcementDtos.ExemptionTypeResponse(type.getId(), type.getCode(), type.getName(),
                type.getDescription(), type.isRequiresBeneficiary(), type.isActive());
    }

    public List<EnforcementDtos.ExemptionDocumentResponse> toExemptionDocuments(List<ExemptionDocument> documents) {
        if (documents == null || documents.isEmpty()) {
            return List.of();
        }
        Map<UUID, String> names = names(documents.stream()
                .map(ExemptionDocument::getUploadedBy).distinct().toList());
        return documents.stream()
                .map(document -> new EnforcementDtos.ExemptionDocumentResponse(document.getId(),
                        document.getTitle(), document.getContentType(), document.getByteSize(),
                        document.getSha256(), names.get(document.getUploadedBy()), document.getCreatedAt()))
                .toList();
    }

    /** Display names for a set of user identifiers, in one query. */
    private Map<UUID, String> names(List<UUID> userIds) {
        Map<UUID, String> names = new HashMap<>();
        if (userIds.isEmpty()) {
            return names;
        }
        for (User person : userDirectoryService.findAllById(userIds)) {
            names.put(person.getId(), person.displayName());
        }
        return names;
    }

    /**
     * A page of the fiscalisation log, with the names and the citation flag resolved in two queries
     * for the whole page.
     *
     * <p>Never one query per row. This table grows by hundreds of rows per officer per shift, so a
     * screen that resolved a name per row would get slower every day the municipality operates —
     * which is the definition of a page that eventually stops opening.</p>
     */
    public List<EnforcementDtos.EnforcementCheckResponse> toChecks(TenantId tenantId,
                                                                  List<EnforcementCheck> checks) {
        if (checks == null || checks.isEmpty()) {
            return List.of();
        }
        List<java.util.UUID> ids = checks.stream().map(EnforcementCheck::getId).toList();
        java.util.Set<java.util.UUID> withCitation = new java.util.HashSet<>(
                citationRepository.findCheckIdsWithCitation(tenantId.value(), ids));
        java.util.Map<java.util.UUID, String> names = new java.util.HashMap<>();
        for (User person : userDirectoryService.findAllById(
                checks.stream().map(EnforcementCheck::getInspectorUserId).distinct().toList())) {
            names.put(person.getId(), person.displayName());
        }
        java.util.Map<java.util.UUID, String> zoneNames = new java.util.HashMap<>();
        for (ParkingZone zone : zoneRepository.findByTenantIdOrderByCodeAsc(tenantId.value())) {
            zoneNames.put(zone.getId(), zone.getName());
        }
        List<EnforcementDtos.EnforcementCheckResponse> rows = new ArrayList<>(checks.size());
        for (EnforcementCheck check : checks) {
            rows.add(new EnforcementDtos.EnforcementCheckResponse(
                    check.getId(),
                    check.getInspectorUserId(),
                    names.get(check.getInspectorUserId()),
                    check.getPlate(),
                    check.getPlateRaw(),
                    check.getZoneId(),
                    check.getZoneId() == null ? null : zoneNames.get(check.getZoneId()),
                    check.getSpaceCode(),
                    check.getVerdict(),
                    check.getRefusalCode(),
                    check.getLocationState(),
                    check.getLatitude(),
                    check.getLongitude(),
                    check.getLocationAccuracyM(),
                    check.getUserAgent(),
                    withCitation.contains(check.getId()),
                    check.getOccurredAt()));
        }
        return rows;
    }

    private EnforcementDtos.ActiveStayResponse toStay(ParkingStatusPort.ActiveStay stay) {
        return new EnforcementDtos.ActiveStayResponse(stay.sessionId(), stay.zoneId(), stay.zoneCode(),
                stay.zoneName(), stay.spaceId(), stay.spaceCode(), stay.startedAt(), stay.expiresAt(),
                stay.paymentStatus(), stay.noChargeReason(),
                new ParkingDtos.MoneyDto(stay.amountMinor(), stay.currencyCode()),
                stay.paymentTransactionId());
    }

    // --- citations ------------------------------------------------------------------------------------

    /** One citation, with the zone map supplied by the caller so a listing stays one query. */
    public EnforcementDtos.CitationResponse toCitation(Citation citation, Map<UUID, ParkingZone> zones,
                                                       int evidenceCount) {
        ParkingZone zone = citation.getZoneId() == null ? null : zones.get(citation.getZoneId());
        Instant now = clock.instant();
        return new EnforcementDtos.CitationResponse(
                citation.getId(),
                citation.getNumber(),
                citation.getSeriesYear(),
                citation.getStatus(),
                citation.getStatus().labelKey(),
                citation.getStatusReason(),
                citation.getPlate(),
                citation.getVehicleId(),
                citation.getZoneId(),
                zone == null ? null : zone.getCode(),
                zone == null ? null : zone.getName(),
                citation.getSpaceId(),
                citation.getSpaceCode(),
                citation.getLatitude(),
                citation.getLongitude(),
                citation.getLocationAccuracyM(),
                citation.getAddressText(),
                citation.getInfractionTypeId(),
                citation.getInfractionCode(),
                citation.getInfractionName(),
                money(citation.getFine()),
                money(citation.amountPayableAt(now)),
                citation.getDiscountedFine() == null ? null : money(citation.getDiscountedFine()),
                citation.getDiscountUntil(),
                citation.getDueAt(),
                citation.getOccurredAt(),
                citation.getIssuedAt(),
                citation.getDeviceClockSkewSeconds(),
                citation.getInspectorUserId(),
                citation.getInspectorNameSnapshot(),
                citation.getParkingSessionId(),
                citation.getNotes(),
                evidenceCount,
                citation.getSource(),
                citation.getSource().labelKey(),
                citation.getSourceSystem(),
                citation.getExternalStatus(),
                citation.getLastSeenAt(),
                citation.getSource().isManagedHere());
    }

    public List<EnforcementDtos.CitationResponse> toCitations(List<Citation> citations, UUID tenantId) {
        Map<UUID, ParkingZone> zones = zonesOf(tenantId);
        List<EnforcementDtos.CitationResponse> body = new ArrayList<>(citations.size());
        for (Citation citation : citations) {
            // The count is left at zero in listings on purpose: fetching it per row would be the very
            // N+1 this class exists to avoid, and no list screen shows it. The detail response has it.
            body.add(toCitation(citation, zones, 0));
        }
        return body;
    }

    /** The citizen's narrower view of the same act. */
    public EnforcementDtos.FineResponse toFine(Citation citation, Map<UUID, ParkingZone> zones, boolean appealable,
                                               int evidenceCount) {
        ParkingZone zone = citation.getZoneId() == null ? null : zones.get(citation.getZoneId());
        Instant now = clock.instant();
        return new EnforcementDtos.FineResponse(
                citation.getId(),
                citation.getNumber(),
                citation.getStatus(),
                citation.getStatus().labelKey(),
                citation.getPlate(),
                citation.getInfractionCode(),
                citation.getInfractionName(),
                zone == null ? null : zone.getName(),
                citation.getSpaceCode(),
                citation.getAddressText(),
                money(citation.getFine()),
                money(citation.amountPayableAt(now)),
                citation.getDiscountUntil(),
                citation.getDueAt(),
                citation.getOccurredAt(),
                citation.getIssuedAt(),
                // A mirrored fine is never appealable here, whatever its causal allows: the defence
                // against an act raised elsewhere is filed where that act lives, and offering the
                // button would be offering a door that opens onto a refusal.
                appealable && citation.getSource().isManagedHere(),
                evidenceCount,
                citation.getSource(),
                citation.getSource().labelKey(),
                citation.getSourceSystem(),
                citation.getExternalStatus(),
                citation.getSource().isManagedHere());
    }

    public List<EnforcementDtos.FineResponse> toFines(List<Citation> citations, UUID tenantId,
                                                      Map<UUID, Boolean> appealableByType) {
        Map<UUID, ParkingZone> zones = zonesOf(tenantId);
        List<EnforcementDtos.FineResponse> body = new ArrayList<>(citations.size());
        for (Citation citation : citations) {
            boolean appealable = Boolean.TRUE.equals(appealableByType.get(citation.getInfractionTypeId()))
                    && citation.getStatus().isPayable();
            body.add(toFine(citation, zones, appealable, 0));
        }
        return body;
    }

    public EnforcementDtos.EvidenceResponse toEvidence(CitationEvidence evidence, String contentUrl) {
        return new EnforcementDtos.EvidenceResponse(
                evidence.getId(),
                evidence.getKind(),
                evidence.getSource(),
                evidence.getContentType(),
                evidence.getByteSize(),
                evidence.getSha256(),
                evidence.getNote(),
                evidence.getCapturedAt(),
                evidence.getLatitude(),
                evidence.getLongitude(),
                evidence.getCreatedAt(),
                evidence.getKind() == EvidenceKind.PHOTO ? contentUrl : null);
    }

    /**
     * Evidence for one citation, each photograph carrying the URL its bytes are fetched from. The base
     * path is passed in by the controller, so the same mapper serves the officer's route and the
     * administration's without either of them being able to hand out the other's.
     */
    public List<EnforcementDtos.EvidenceResponse> toEvidenceList(List<CitationEvidence> evidence, String basePath) {
        List<EnforcementDtos.EvidenceResponse> body = new ArrayList<>(evidence.size());
        for (CitationEvidence item : evidence) {
            body.add(toEvidence(item, basePath + "/" + item.getId()));
        }
        return body;
    }

    // --- appeals ---------------------------------------------------------------------------------

    public EnforcementDtos.AppealNoticeResponse toNotice(AppealNotice notice) {
        return new EnforcementDtos.AppealNoticeResponse(notice.getId(), notice.getVersion(), notice.getLocale(),
                notice.getBody(), notice.getEffectiveFrom(), notice.isCountryDefault());
    }

    /**
     * A defence with the images attached to it.
     *
     * <p>The image URLs are built from a base path the caller supplies, so the citizen's route and
     * the administration's each hand out their own and neither can hand out the other's.</p>
     */
    public EnforcementDtos.AppealResponse toAppeal(CitationAppeal appeal, List<CitationEvidence> images,
                                                   int maxImages, String evidenceBasePath) {
        return new EnforcementDtos.AppealResponse(
                appeal.getId(),
                appeal.getCitationId(),
                appeal.getStatus(),
                appeal.getStatus().labelKey(),
                appeal.getBody(),
                appeal.getSubmittedAt(),
                appeal.getResolvedAt(),
                appeal.getResolutionReason(),
                appeal.getNoticeVersion(),
                maxImages,
                toEvidenceList(images, evidenceBasePath));
    }

    public List<EnforcementDtos.CitationEventResponse> toHistory(List<CitationEvent> events) {
        List<EnforcementDtos.CitationEventResponse> body = new ArrayList<>(events.size());
        for (CitationEvent event : events) {
            body.add(new EnforcementDtos.CitationEventResponse(
                    event.getId(),
                    event.getAction(),
                    event.getAction().labelKey(),
                    event.getFromStatus(),
                    event.getToStatus(),
                    event.getActorUserId(),
                    event.getActorPortal(),
                    event.getReason(),
                    event.getOccurredAt()));
        }
        return body;
    }

    /** The municipality's zones, by identifier. Bounded by how a city is organised, so one query. */
    public Map<UUID, ParkingZone> zonesOf(UUID tenantId) {
        Map<UUID, ParkingZone> zones = new HashMap<>();
        for (ParkingZone zone : zoneRepository.findByTenantIdOrderByCodeAsc(tenantId)) {
            zones.put(zone.getId(), zone);
        }
        return zones;
    }

    /** The same mapping the DTOs use, for a caller that has an amount and not a citation (v0.41). */
    public ParkingDtos.MoneyDto toMoney(Money amount) {
        return money(amount);
    }

    private ParkingDtos.MoneyDto money(Money money) {
        return money == null ? null : new ParkingDtos.MoneyDto(money.minorUnits(), money.currencyCode());
    }
}
