package cr.luparx.app.web;

import cr.luparx.app.web.dto.ParkingDtos;
import cr.luparx.core.money.Money;
import cr.luparx.parking.entity.ParkingPolicy;
import cr.luparx.parking.entity.ParkingRate;
import cr.luparx.parking.entity.ParkingSession;
import cr.luparx.parking.entity.ParkingSessionExtension;
import cr.luparx.parking.entity.ParkingSpace;
import cr.luparx.parking.entity.ParkingTimeCreditEntry;
import cr.luparx.parking.entity.ParkingZone;
import cr.luparx.parking.entity.Vehicle;
import cr.luparx.parking.entity.WalletTransaction;
import cr.luparx.parking.model.ParkingQuote;
import cr.luparx.parking.repository.ParkingSpaceRepository;
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
 * Explicit entity → DTO mapping for the parking domain, kept apart from {@link ResponseMapper} so
 * that the parking context does not drag identity and tenancy collaborators into a class it shares
 * with nothing.
 *
 * <p>A session is shown with the <em>name</em> of its zone and the <em>code</em> of its bay, because
 * those are what a citizen recognises; the identifiers travel too, for the client's own navigation.
 * Both are resolved in one query per collection rather than one per row — a list of sessions must not
 * turn into an N+1 (CONTRACT.md §7).</p>
 */
@Component
public class ParkingMapper {

    private final ParkingZoneRepository zoneRepository;
    private final ParkingSpaceRepository spaceRepository;
    private final Clock clock;

    public ParkingMapper(ParkingZoneRepository zoneRepository, ParkingSpaceRepository spaceRepository,
                         Clock clock) {
        this.zoneRepository = zoneRepository;
        this.spaceRepository = spaceRepository;
        this.clock = clock;
    }

    public ParkingDtos.MoneyDto toMoney(Money money) {
        return new ParkingDtos.MoneyDto(money.minorUnits(), money.currencyCode());
    }

    // --- vehicles --------------------------------------------------------------------------------

    public ParkingDtos.VehicleResponse toVehicle(Vehicle vehicle) {
        return new ParkingDtos.VehicleResponse(
                vehicle.getId(),
                vehicle.getPlate(),
                vehicle.getPlateNormalized(),
                vehicle.getName(),
                vehicle.getBrand(),
                vehicle.getModel(),
                vehicle.getYear(),
                vehicle.isOwner(),
                vehicle.isPrimary(),
                vehicle.getCreatedAt());
    }

    // --- policy and quote ------------------------------------------------------------------------

    public ParkingDtos.ParkingPolicyResponse toPolicy(ParkingPolicy policy) {
        return new ParkingDtos.ParkingPolicyResponse(
                policy.sessionIncrements().values(),
                policy.getSessionMinMinutes(),
                policy.getSessionMaxMinutes(),
                policy.isExtensionEnabled(),
                policy.extensionIncrements().values(),
                policy.getExtensionMaxTotalMinutes(),
                policy.isEarlyFinishEnabled(),
                policy.isCreditOnEarlyFinishEnabled(),
                policy.getCreditMinRemainingMinutes(),
                policy.getCreditExpiryDays(),
                policy.getGraceMinutes(),
                policy.getUpdatedAt());
    }

    public ParkingDtos.QuoteResponse toQuote(ParkingQuote quote) {
        return new ParkingDtos.QuoteResponse(
                quote.minutes(),
                toMoney(quote.amount()),
                quote.creditMinutesApplied(),
                quote.payableMinutes(),
                toMoney(quote.payable()));
    }

    // --- sessions --------------------------------------------------------------------------------

    /** One session. Two point lookups; use {@link #toSessions} for a collection. */
    public ParkingDtos.ParkingSessionResponse toSession(ParkingSession session) {
        String zoneName = zoneRepository.findById(session.getZoneId())
                .map(ParkingZone::getName)
                .orElse(null);
        String spaceCode = spaceRepository.findById(session.getSpaceId())
                .map(ParkingSpace::getCode)
                .orElse(null);
        return toSession(session, zoneName, spaceCode);
    }

    /**
     * A collection of sessions, with the zone names and bay codes resolved in one query each.
     *
     * <p>The two lookups are by identifier and are not narrowed by tenant, which is safe precisely
     * because the identifiers come from rows that were already read through their tenant: a session
     * cannot reference a zone of another municipality (foreign key plus the tenant column on both).</p>
     */
    public List<ParkingDtos.ParkingSessionResponse> toSessions(List<ParkingSession> sessions) {
        if (sessions == null || sessions.isEmpty()) {
            return List.of();
        }
        List<UUID> zoneIds = sessions.stream().map(ParkingSession::getZoneId).distinct().toList();
        List<UUID> spaceIds = sessions.stream().map(ParkingSession::getSpaceId).distinct().toList();
        Map<UUID, String> zoneNames = new HashMap<>();
        for (ParkingZone zone : zoneRepository.findAllById(zoneIds)) {
            zoneNames.put(zone.getId(), zone.getName());
        }
        Map<UUID, String> spaceCodes = new HashMap<>();
        for (ParkingSpace space : spaceRepository.findAllById(spaceIds)) {
            spaceCodes.put(space.getId(), space.getCode());
        }
        List<ParkingDtos.ParkingSessionResponse> result = new ArrayList<>(sessions.size());
        for (ParkingSession session : sessions) {
            result.add(toSession(session, zoneNames.get(session.getZoneId()),
                    spaceCodes.get(session.getSpaceId())));
        }
        return result;
    }

    private ParkingDtos.ParkingSessionResponse toSession(ParkingSession session, String zoneName,
                                                         String spaceCode) {
        Instant now = clock.instant();
        return new ParkingDtos.ParkingSessionResponse(
                session.getId(),
                session.getVehicleId(),
                session.getPlateSnapshot(),
                session.getZoneId(),
                zoneName,
                session.getSpaceId(),
                spaceCode,
                session.getStartedAt(),
                session.getExpiresAt(),
                session.getEndedAt(),
                session.getStatus(),
                session.bookedMinutes(),
                // What the countdown shows. Computed server-side so two clients never disagree.
                session.getStatus().isActive() ? session.remainingMinutesAt(now) : 0,
                toMoney(session.getAmount()),
                session.getCreditMinutesApplied());
    }

    public ParkingDtos.ParkingSessionExtensionResponse toExtension(ParkingSessionExtension extension) {
        return new ParkingDtos.ParkingSessionExtensionResponse(
                extension.getId(),
                extension.getMinutes(),
                toMoney(extension.getAmount()),
                extension.getCreditMinutesApplied(),
                extension.getExtendedAt());
    }

    // --- wallet and credits ----------------------------------------------------------------------

    public ParkingDtos.WalletTransactionResponse toWalletTransaction(WalletTransaction transaction) {
        return new ParkingDtos.WalletTransactionResponse(
                transaction.getId(),
                transaction.getType(),
                toMoney(transaction.getAmount()),
                toMoney(transaction.getBalanceAfter()),
                transaction.getSessionId(),
                transaction.getCreatedAt());
    }

    public ParkingDtos.TimeCreditLotResponse toCreditLot(ParkingTimeCreditEntry entry) {
        return new ParkingDtos.TimeCreditLotResponse(
                entry.getId(),
                entry.getSource(),
                entry.getMinutes(),
                entry.getRemainingMinutes(),
                entry.getSessionId(),
                entry.getExpiresAt(),
                entry.getCreatedAt());
    }

    // --- admin -----------------------------------------------------------------------------------

    public ParkingDtos.ParkingZoneResponse toZone(ParkingZone zone, long spaceCount) {
        return new ParkingDtos.ParkingZoneResponse(
                zone.getId(),
                zone.getCode(),
                zone.getName(),
                zone.getDescription(),
                zone.getDivisionId(),
                zone.isActive(),
                spaceCount);
    }

    public ParkingDtos.ParkingRateResponse toRate(ParkingRate rate) {
        return new ParkingDtos.ParkingRateResponse(
                rate.getId(),
                rate.getZoneId(),
                toMoney(rate.getAmount()),
                rate.getMinutes(),
                rate.getValidFrom(),
                rate.getValidTo());
    }
}
