package cr.luparx.app.web;

import cr.luparx.app.web.dto.EnforcementDtos;
import cr.luparx.app.web.dto.ParkingDtos;
import cr.luparx.core.money.Money;
import cr.luparx.enforcement.entity.Citation;
import cr.luparx.enforcement.entity.CitationEvent;
import cr.luparx.enforcement.entity.CitationEvidence;
import cr.luparx.enforcement.entity.InfractionType;
import cr.luparx.enforcement.model.EvidenceKind;
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
    private final Clock clock;

    public EnforcementMapper(ParkingZoneRepository zoneRepository, Clock clock) {
        this.zoneRepository = zoneRepository;
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
                others,
                status.checkedAt());
    }

    private EnforcementDtos.ActiveStayResponse toStay(ParkingStatusPort.ActiveStay stay) {
        return new EnforcementDtos.ActiveStayResponse(stay.sessionId(), stay.zoneId(), stay.zoneCode(),
                stay.zoneName(), stay.spaceId(), stay.spaceCode(), stay.startedAt(), stay.expiresAt());
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
                citation.getParkingSessionId(),
                citation.getNotes(),
                evidenceCount);
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
                appealable,
                evidenceCount);
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

    private ParkingDtos.MoneyDto money(Money money) {
        return money == null ? null : new ParkingDtos.MoneyDto(money.minorUnits(), money.currencyCode());
    }
}
