package cr.luparx.parking.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.money.Money;
import cr.luparx.parking.entity.ParkingRate;
import cr.luparx.parking.entity.ParkingZone;
import cr.luparx.parking.model.ParkingQuote;
import cr.luparx.parking.repository.ParkingRateRepository;
import cr.luparx.parking.repository.ParkingZoneRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Prices a stay. The one place in the platform where a parking amount is computed
 * (CONTRACT.md v0.2: "El cálculo del monto y del crédito ocurre siempre en el servidor; el cliente
 * sólo pide una cotización para mostrarla").
 *
 * <h2>How a stay is priced</h2>
 *
 * <p>A tariff is an amount per block of minutes ({@code parking_rates.minutes}). A stay is charged
 * per <em>started</em> block: 45 minutes on an hourly tariff costs one hour, 61 minutes costs two.
 * Rounding up is stated here once, in the open, rather than being an accident of integer division
 * somewhere.</p>
 *
 * <h2>How credit is applied</h2>
 *
 * <p>The citizen's minutes are consumed first (rule 5) and only the rest is charged. The price of
 * the rest is computed from the rest — not by discounting the full price — because blocks do not
 * divide: with an hourly tariff, 90 minutes of which 30 are credited is one paid hour, not one and a
 * half. Pricing what is actually being bought is the only rule that cannot overcharge.</p>
 */
@Service
public class ParkingQuoteService {

    private final ParkingZoneRepository zoneRepository;
    private final ParkingRateRepository rateRepository;
    private final TimeCreditService timeCreditService;
    private final Clock clock;

    public ParkingQuoteService(ParkingZoneRepository zoneRepository,
                               ParkingRateRepository rateRepository,
                               TimeCreditService timeCreditService,
                               Clock clock) {
        this.zoneRepository = zoneRepository;
        this.rateRepository = rateRepository;
        this.timeCreditService = timeCreditService;
        this.clock = clock;
    }

    /** The zone, refused if it belongs to another municipality or is no longer operated. */
    @Transactional(readOnly = true)
    public ParkingZone requireActiveZone(TenantId tenantId, UUID zoneId) {
        ParkingZone zone = zoneRepository.findByTenantIdAndId(tenantId.value(), zoneId)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.PARKING_ZONE_NOT_FOUND,
                        "error.parking.zone.notFound"));
        if (!zone.isActive()) {
            throw NotFoundException.of(ErrorCode.PARKING_ZONE_NOT_FOUND, "error.parking.zone.notFound");
        }
        return zone;
    }

    /**
     * The tariff in force for a zone right now.
     *
     * @throws NotFoundException {@code PARKING_RATE_NOT_FOUND} when the zone has no open window. A
     *         zone with no price is not free: it is misconfigured, and charging zero would be a
     *         silent revenue loss nobody would notice.
     */
    @Transactional(readOnly = true)
    public ParkingRate requireRate(TenantId tenantId, UUID zoneId, Instant at) {
        List<ParkingRate> candidates = rateRepository
                .findByTenantIdAndZoneIdAndValidFromLessThanEqualOrderByValidFromDesc(tenantId.value(), zoneId, at);
        for (ParkingRate rate : candidates) {
            if (rate.getValidTo() == null || rate.getValidTo().isAfter(at)) {
                return rate;
            }
        }
        throw NotFoundException.of(ErrorCode.PARKING_RATE_NOT_FOUND, "error.parking.rate.notFound");
    }

    /**
     * What {@code minutes} in this zone would cost the citizen right now, credit included.
     *
     * <p>Read-only and side-effect free: asking for a quote never consumes a minute and never opens
     * an account. The same computation is redone inside the transaction that actually starts the
     * session, because a quote the client held on to for ten minutes is a display, not a promise.</p>
     */
    @Transactional
    public ParkingQuote quote(TenantId tenantId, UserId userId, UUID zoneId, int minutes) {
        requireActiveZone(tenantId, zoneId);
        Instant now = clock.instant();
        ParkingRate rate = requireRate(tenantId, zoneId, now);
        int available = timeCreditService.availableMinutes(tenantId, userId);
        return price(rate, minutes, available);
    }

    /**
     * The pure pricing rule, given a tariff, the minutes wanted and the minutes available as credit.
     * Separated from the lookups so that the session flow — which has already loaded the tariff and
     * locked the credit — reuses exactly the same arithmetic instead of a copy of it.
     */
    public ParkingQuote price(ParkingRate rate, int minutes, int availableCreditMinutes) {
        if (minutes <= 0) {
            throw new IllegalArgumentException("a quote covers a positive number of minutes");
        }
        int creditApplied = Math.max(0, Math.min(availableCreditMinutes, minutes));
        int payableMinutes = minutes - creditApplied;
        Money amount = rate.getAmount().multipliedBy(blocks(minutes, rate.getMinutes()));
        Money payable = payableMinutes == 0
                ? Money.zero(rate.getCurrencyCode())
                : rate.getAmount().multipliedBy(blocks(payableMinutes, rate.getMinutes()));
        return new ParkingQuote(minutes, creditApplied, payableMinutes, amount, payable);
    }

    /** Started blocks, rounding up. {@code blockMinutes} is positive by CHECK in V5_0. */
    private static long blocks(int minutes, int blockMinutes) {
        return ((long) minutes + blockMinutes - 1L) / blockMinutes;
    }
}
