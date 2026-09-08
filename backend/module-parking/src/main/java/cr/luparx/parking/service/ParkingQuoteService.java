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
 *
 * <h2>What is actually being bought</h2>
 *
 * <p>Since CONTRACT.md v0.3 that is not "the minutes asked for" but "the minutes asked for that fall
 * inside the municipality's charging hours". A stay from 17:30 to 19:00 where charging closes at
 * 18:00 is priced as thirty minutes; the citizen still parks until 19:00, and the clock the app shows
 * still runs to 19:00 — only the money stops at 18:00. Everything downstream (tariff blocks, credit,
 * the wallet) then works on the chargeable minutes, so there is exactly one place where free time is
 * turned into zero and it is here.</p>
 */
@Service
public class ParkingQuoteService {

    private final ParkingZoneRepository zoneRepository;
    private final ParkingRateRepository rateRepository;
    private final TimeCreditService timeCreditService;
    private final ParkingScheduleService scheduleService;
    private final Clock clock;

    public ParkingQuoteService(ParkingZoneRepository zoneRepository,
                               ParkingRateRepository rateRepository,
                               TimeCreditService timeCreditService,
                               ParkingScheduleService scheduleService,
                               Clock clock) {
        this.zoneRepository = zoneRepository;
        this.rateRepository = rateRepository;
        this.timeCreditService = timeCreditService;
        this.scheduleService = scheduleService;
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
        int chargeable = chargeableMinutes(tenantId, now, minutes);
        return price(rate, minutes, chargeable, available);
    }

    /**
     * How many of the {@code minutes} starting at {@code from} the municipality charges for.
     *
     * <p>A quote for a stay entirely outside the hours answers zero rather than failing: the citizen
     * asked what it would cost and the honest answer is "nothing". Refusing to <em>start</em> such a
     * session is a separate decision, taken in {@code ParkingSessionService} with
     * {@code OUTSIDE_CHARGING_HOURS}, because that is where the next charging band can be offered
     * alongside the refusal.</p>
     */
    @Transactional
    public int chargeableMinutes(TenantId tenantId, Instant from, int minutes) {
        if (minutes <= 0) {
            return 0;
        }
        return scheduleService.chargeableMinutes(tenantId, from, from.plusSeconds((long) minutes * 60L));
    }

    /**
     * The pure pricing rule, given a tariff, the minutes wanted and the minutes available as credit.
     * Separated from the lookups so that the session flow — which has already loaded the tariff and
     * locked the credit — reuses exactly the same arithmetic instead of a copy of it.
     */
    public ParkingQuote price(ParkingRate rate, int minutes, int chargeableMinutes, int availableCreditMinutes) {
        if (minutes <= 0) {
            throw new IllegalArgumentException("a quote covers a positive number of minutes");
        }
        int chargeable = Math.max(0, Math.min(chargeableMinutes, minutes));
        if (chargeable == 0) {
            // Free time: no money, and no credit spent on it either.
            Money nothing = Money.zero(rate.getCurrencyCode());
            return new ParkingQuote(minutes, 0, 0, 0, nothing, nothing);
        }
        int creditApplied = Math.max(0, Math.min(availableCreditMinutes, chargeable));
        int payableMinutes = chargeable - creditApplied;
        Money amount = rate.getAmount().multipliedBy(blocks(chargeable, rate.getMinutes()));
        Money payable = payableMinutes == 0
                ? Money.zero(rate.getCurrencyCode())
                : rate.getAmount().multipliedBy(blocks(payableMinutes, rate.getMinutes()));
        return new ParkingQuote(minutes, chargeable, creditApplied, payableMinutes, amount, payable);
    }

    /** Started blocks, rounding up. {@code blockMinutes} is positive by CHECK in V5_0. */
    private static long blocks(int minutes, int blockMinutes) {
        return ((long) minutes + blockMinutes - 1L) / blockMinutes;
    }
}
