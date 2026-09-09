package cr.luparx.app.web;

import cr.luparx.app.web.dto.ParkingDtos;
import cr.luparx.core.money.Money;
import cr.luparx.parking.entity.ParkingPolicy;
import cr.luparx.parking.entity.ParkingRate;
import cr.luparx.parking.entity.ParkingSchedule;
import cr.luparx.parking.entity.ParkingScheduleException;
import cr.luparx.parking.entity.ParkingScheduleSlot;
import cr.luparx.parking.entity.ParkingSession;
import cr.luparx.parking.entity.ParkingSessionExtension;
import cr.luparx.parking.entity.ParkingSpace;
import cr.luparx.parking.entity.ParkingSpaceFormat;
import cr.luparx.parking.entity.ParkingTimeCreditEntry;
import cr.luparx.parking.entity.ParkingZone;
import cr.luparx.parking.entity.Vehicle;
import cr.luparx.parking.entity.WalletTransaction;
import cr.luparx.parking.model.ChargingBand;
import cr.luparx.parking.model.ExtensionOption;
import cr.luparx.parking.model.ChargingSchedule;
import cr.luparx.parking.model.ParkingQuote;
import cr.luparx.parking.model.ParkingSpaceRange;
import cr.luparx.parking.repository.ParkingSpaceRepository;
import cr.luparx.parking.repository.ParkingZoneRepository;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.EnumMap;
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
                vehicle.getType().name(),
                vehicle.getType().labelKey(),
                vehicle.getColor() == null ? null : vehicle.getColor().name(),
                vehicle.getColor() == null ? null : vehicle.getColor().labelKey(),
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

    /**
     * A zone as a citizen sees it, with the tariff in force. The rate is passed in rather than looked
     * up here so that a list of zones resolves its prices in one query instead of one per row.
     */
    public ParkingDtos.CitizenParkingZoneResponse toCitizenZone(ParkingZone zone, ParkingRate rate,
                                                                ParkingSpaceRange range) {
        return new ParkingDtos.CitizenParkingZoneResponse(
                zone.getId(),
                zone.getCode(),
                zone.getName(),
                zone.getDescription(),
                rate == null ? null : new ParkingDtos.ParkingRateSummary(toMoney(rate.getAmount()),
                        rate.getMinutes()),
                range == null ? null : new ParkingDtos.SpaceCodeRange(range.firstCode(), range.lastCode(),
                        range.count()));
    }

    public ParkingDtos.QuoteResponse toQuote(ParkingQuote quote) {
        return new ParkingDtos.QuoteResponse(
                quote.minutes(),
                quote.chargeableMinutes(),
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

    public ParkingDtos.ExtensionOptionResponse toExtensionOption(ExtensionOption option) {
        ParkingQuote quote = option.quote();
        return new ParkingDtos.ExtensionOptionResponse(
                option.minutes(),
                quote.chargeableMinutes(),
                toMoney(quote.amount()),
                quote.creditMinutesApplied(),
                quote.payableMinutes(),
                toMoney(quote.payable()),
                option.newExpiresAt(),
                option.allowed(),
                option.unavailableReason());
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

    public ParkingDtos.ParkingSpaceResponse toSpace(ParkingSpace space) {
        return new ParkingDtos.ParkingSpaceResponse(space.getId(), space.getZoneId(), space.getCode(),
                space.getStatus());
    }

    public ParkingDtos.ParkingSpaceFormatResponse toSpaceFormat(ParkingSpaceFormat format) {
        return new ParkingDtos.ParkingSpaceFormatResponse(
                format.getPrefix(),
                format.getDigits(),
                format.isAllowLetters(),
                format.getPattern(),
                format.getExample(),
                format.getUpdatedAt());
    }

    // --- charging schedule -------------------------------------------------------------------------

    /**
     * A band on the wire: the minutes the domain works in, plus the {@code HH:mm} a screen prints.
     * {@code endsAt} is null when the band closes the day, which is the honest rendering of 1440 —
     * there is no wall-clock string for midnight-at-the-end.
     */
    public ParkingDtos.ChargingBandDto toBand(ChargingBand band) {
        LocalTime end = band.endTime();
        return new ParkingDtos.ChargingBandDto(
                band.startMinute(),
                band.endMinute(),
                band.startTime().toString(),
                end == null ? null : end.toString());
    }

    /**
     * The whole timetable, week and exceptions, plus the two answers a client actually renders:
     * whether charging is running right now and, if not, when it resumes.
     */
    public ParkingDtos.ParkingScheduleResponse toSchedule(ParkingSchedule header,
                                                          List<ParkingScheduleSlot> slots,
                                                          List<ParkingScheduleException> exceptions,
                                                          Map<UUID, List<ChargingBand>> exceptionBands,
                                                          ChargingSchedule resolved,
                                                          Instant now) {
        Map<DayOfWeek, List<ParkingDtos.ChargingBandDto>> byDay = new EnumMap<>(DayOfWeek.class);
        for (ParkingScheduleSlot slot : slots) {
            byDay.computeIfAbsent(slot.weekday(), key -> new ArrayList<>()).add(toBand(slot.band()));
        }
        // Every weekday is listed, including the ones with no band: a form has to be able to show
        // "Sunday — not charged" rather than leave the reader to notice an absence.
        List<ParkingDtos.ChargingDayDto> week = new ArrayList<>(DayOfWeek.values().length);
        for (DayOfWeek weekday : DayOfWeek.values()) {
            week.add(new ParkingDtos.ChargingDayDto(weekday, byDay.getOrDefault(weekday, List.of())));
        }

        List<ParkingDtos.ChargingExceptionDto> mappedExceptions = new ArrayList<>(exceptions.size());
        for (ParkingScheduleException exception : exceptions) {
            List<ParkingDtos.ChargingBandDto> bands = new ArrayList<>();
            for (ChargingBand band : exceptionBands.getOrDefault(exception.getId(), List.of())) {
                bands.add(toBand(band));
            }
            mappedExceptions.add(new ParkingDtos.ChargingExceptionDto(
                    exception.getExceptionDate(),
                    Boolean.valueOf(exception.isCharges()),
                    Boolean.valueOf(exception.isChargesAllDay()),
                    exception.getLabel(),
                    bands));
        }

        boolean chargingNow = resolved.chargesAt(now);
        Instant next = chargingNow ? null : resolved.nextChargingStart(now).orElse(null);
        return new ParkingDtos.ParkingScheduleResponse(
                resolved.zone().getId(),
                header.isChargesAllDay(),
                week,
                mappedExceptions,
                chargingNow,
                next,
                header.getUpdatedAt());
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
