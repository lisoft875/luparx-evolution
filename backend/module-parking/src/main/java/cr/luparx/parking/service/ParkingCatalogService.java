package cr.luparx.parking.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.error.ConflictException;
import cr.luparx.core.money.Money;
import cr.luparx.parking.entity.ParkingRate;
import cr.luparx.parking.entity.ParkingSpace;
import cr.luparx.parking.entity.ParkingZone;
import cr.luparx.parking.model.ParkingSpaceStatus;
import cr.luparx.parking.repository.ParkingRateRepository;
import cr.luparx.parking.repository.ParkingSpaceRepository;
import cr.luparx.parking.repository.ParkingZoneRepository;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.service.TenantService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * What a municipal administrator maintains: its zones and the tariff in force in each of them.
 *
 * <p>Two rules are enforced here rather than in a controller, because they are what keeps a receipt
 * matching the ledger:</p>
 *
 * <ul>
 *   <li><b>A zone is deactivated, never deleted.</b> Every session and citation ever recorded points
 *       at it.</li>
 *   <li><b>A tariff is superseded, never edited.</b> {@link #setRate} closes the current window and
 *       opens a new one, so a stay charged last month can still be read back at the price it was
 *       actually charged.</li>
 * </ul>
 */
@Service
public class ParkingCatalogService {

    private final ParkingZoneRepository zoneRepository;
    private final ParkingRateRepository rateRepository;
    private final ParkingSpaceRepository spaceRepository;
    private final ParkingSpaceFormatService spaceFormatService;
    private final TenantService tenantService;
    private final Clock clock;

    public ParkingCatalogService(ParkingZoneRepository zoneRepository,
                                 ParkingRateRepository rateRepository,
                                 ParkingSpaceRepository spaceRepository,
                                 ParkingSpaceFormatService spaceFormatService,
                                 TenantService tenantService,
                                 Clock clock) {
        this.zoneRepository = zoneRepository;
        this.rateRepository = rateRepository;
        this.spaceRepository = spaceRepository;
        this.spaceFormatService = spaceFormatService;
        this.tenantService = tenantService;
        this.clock = clock;
    }

    /**
     * Adds a bay to a zone, with its code validated against the municipality's own format
     * (CONTRACT.md v0.3: "El servidor valida contra el patrón del tenant al crear espacios y al
     * iniciar una sesión").
     *
     * <p>The code is canonicalised before it is stored, so the string a citizen later types and the
     * string an operator entered here are the same string. Uniqueness is per municipality — two
     * municipalities both numbering from 0001 is the normal case — and the unique index is what
     * guarantees it; the check here is what makes the refusal readable.</p>
     */
    @Transactional
    public ParkingSpace createSpace(TenantId tenantId, UUID zoneId, String code) {
        requireZone(tenantId, zoneId);
        String normalized = spaceFormatService.requireValidCode(tenantId, code);
        if (spaceRepository.findByTenantIdAndCode(tenantId.value(), normalized).isPresent()) {
            throw ConflictException.of(ErrorCode.PARKING_SPACE_CODE_TAKEN, "error.parking.space.code.taken",
                    normalized);
        }
        Instant now = clock.instant();
        return spaceRepository.save(new ParkingSpace(Uuid7.generate(), tenantId.value(), zoneId, normalized,
                ParkingSpaceStatus.AVAILABLE, now));
    }

    @Transactional(readOnly = true)
    public List<ParkingZone> listZones(TenantId tenantId) {
        return zoneRepository.findByTenantIdOrderByCodeAsc(tenantId.value());
    }

    /**
     * The zones a citizen may actually park in: this municipality's, and only the ones still
     * operated.
     *
     * <p>Not paginated, and deliberately so. A zone is a sector a municipality operates — San José
     * has eight — and the number is bounded by how a city is organised, not by how many citizens or
     * sessions it has. The collection that <em>does</em> grow without limit is the bays inside a zone,
     * and that one is only ever read by code or by page. If a municipality ever operates hundreds of
     * zones, this becomes a paginated read; until then a page envelope over eight rows would cost the
     * client a round trip and buy nothing.</p>
     */
    @Transactional(readOnly = true)
    public List<ParkingZone> listActiveZones(TenantId tenantId) {
        return zoneRepository.findByTenantIdAndActiveTrueOrderByCodeAsc(tenantId.value());
    }

    /**
     * The tariff in force in each zone of a municipality, in one query.
     *
     * <p>A zone missing from the map has no open tariff window. That is not "free": it is
     * misconfigured, and the caller has to say so rather than quietly price the stay at zero — which
     * is why this returns a map with holes instead of defaulting.</p>
     */
    @Transactional(readOnly = true)
    public Map<UUID, ParkingRate> ratesInForce(TenantId tenantId, Instant at) {
        Map<UUID, ParkingRate> byZone = new HashMap<>();
        for (ParkingRate rate : rateRepository.findInForce(tenantId.value(), at)) {
            // Ordered zone, then most recent window first: the first row of each zone is the one in
            // force, and a later one can only be an older window that overlaps it.
            byZone.putIfAbsent(rate.getZoneId(), rate);
        }
        return byZone;
    }

    @Transactional(readOnly = true)
    public long countSpaces(TenantId tenantId, UUID zoneId) {
        return spaceRepository.countByTenantIdAndZoneId(tenantId.value(), zoneId);
    }

    @Transactional(readOnly = true)
    public ParkingZone requireZone(TenantId tenantId, UUID zoneId) {
        return zoneRepository.findByTenantIdAndId(tenantId.value(), zoneId)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.PARKING_ZONE_NOT_FOUND,
                        "error.parking.zone.notFound"));
    }

    @Transactional
    public ParkingZone updateZone(TenantId tenantId, UUID zoneId, String name, String description, UUID divisionId,
                                  boolean active) {
        ParkingZone zone = requireZone(tenantId, zoneId);
        if (name == null || name.isBlank()) {
            throw new ValidationException("name", ErrorCode.VALIDATION_FAILED, "error.parking.zone.name.required");
        }
        zone.describe(name.trim(), description == null || description.isBlank() ? null : description.trim(),
                divisionId);
        zone.changeActive(active);
        zone.touch(clock.instant());
        return zoneRepository.save(zone);
    }

    /** Every tariff window of the municipality, or of one zone. Bounded: a zone has few of them. */
    @Transactional(readOnly = true)
    public List<ParkingRate> listRates(TenantId tenantId, UUID zoneId) {
        if (zoneId != null) {
            return rateRepository.findByTenantIdAndZoneIdOrderByValidFromDesc(tenantId.value(), zoneId);
        }
        List<ParkingRate> all = new ArrayList<>();
        for (ParkingZone zone : listZones(tenantId)) {
            all.addAll(rateRepository.findByTenantIdAndZoneIdOrderByValidFromDesc(tenantId.value(), zone.getId()));
        }
        return all;
    }

    /**
     * Sets the tariff in force for a zone: closes whatever window is open and opens a new one from
     * now on. The currency is the municipality's, taken from the tenant rather than accepted from
     * the request — an administrator cannot price a zone in a currency their citizens do not hold.
     */
    @Transactional
    public ParkingRate setRate(TenantId tenantId, UUID zoneId, long amountMinor, int minutes) {
        requireZone(tenantId, zoneId);
        ValidationException.Collector errors = new ValidationException.Collector();
        if (amountMinor < 0L) {
            errors.add("amountMinor", ErrorCode.VALIDATION_FAILED, "error.parking.rate.amount.invalid");
        }
        if (minutes <= 0) {
            errors.add("minutes", ErrorCode.VALIDATION_FAILED, "error.parking.rate.minutes.invalid");
        }
        errors.throwIfAny();

        Tenant tenant = tenantService.require(tenantId);
        Instant now = clock.instant();
        for (ParkingRate current : rateRepository.findByTenantIdAndZoneIdOrderByValidFromDesc(tenantId.value(),
                zoneId)) {
            if (current.getValidTo() != null) {
                continue;
            }
            // A window must end strictly after it started (CHECK in V5_0). Two tariffs set within the
            // same millisecond would otherwise produce valid_to = valid_from and be refused.
            Instant closeAt = current.getValidFrom().isBefore(now) ? now : current.getValidFrom().plusMillis(1L);
            current.close(closeAt);
            rateRepository.save(current);
        }
        Money amount = Money.ofMinor(amountMinor, tenant.getCurrencyCode());
        return rateRepository.save(new ParkingRate(Uuid7.generate(), tenantId.value(), zoneId, amount, minutes,
                now, null, now));
    }
}
