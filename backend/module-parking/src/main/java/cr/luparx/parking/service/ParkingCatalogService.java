package cr.luparx.parking.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.error.ConflictException;
import cr.luparx.core.money.Money;
import cr.luparx.parking.entity.ParkingRate;
import cr.luparx.parking.model.RateKind;
import cr.luparx.parking.model.ZonePriceBook;
import cr.luparx.parking.entity.ParkingSpace;
import cr.luparx.parking.entity.ParkingZone;
import cr.luparx.parking.model.ParkingSpaceRange;
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
import java.util.LinkedHashMap;
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

    /**
     * Opens a new sector of the municipality (CONTRACT.md v0.16).
     *
     * <p>The code is the zone's identity for everybody who is not a database: it is what an operator
     * says on the radio and what a report is grouped by. It is unique per municipality — two
     * municipalities both having a "CENTRO" is the normal case — and it is never changed afterwards,
     * because a zone whose code moves takes every report that ever named it with it. Renaming is
     * what {@link #updateZone} is for; the code is not part of it.</p>
     */
    @Transactional
    public ParkingZone createZone(TenantId tenantId, String code, String name, String description,
                                  UUID divisionId) {
        tenantService.requireActive(tenantId);
        if (code == null || code.isBlank()) {
            throw new ValidationException("code", ErrorCode.VALIDATION_FAILED, "error.parking.zone.code.required");
        }
        if (name == null || name.isBlank()) {
            throw new ValidationException("name", ErrorCode.VALIDATION_FAILED, "error.parking.zone.name.required");
        }
        String normalized = code.trim().toUpperCase(java.util.Locale.ROOT);
        if (zoneRepository.findByTenantIdAndCode(tenantId.value(), normalized).isPresent()) {
            throw ConflictException.of(ErrorCode.PARKING_ZONE_CODE_TAKEN, "error.parking.zone.code.taken",
                    normalized);
        }
        Instant now = clock.instant();
        ParkingZone zone = new ParkingZone(Uuid7.generate(), tenantId.value(), normalized, name.trim(),
                description == null || description.isBlank() ? null : description.trim(), divisionId, true, now);
        return zoneRepository.save(zone);
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
     * The bay code range of each zone of a municipality, in one query.
     *
     * <p>What the citizen app puts under the bay field as "0001–0500". A zone missing from the map has
     * no bays at all — drawn on a map before it was painted — and the app shows no hint rather than an
     * invented one.</p>
     */
    @Transactional(readOnly = true)
    public Map<UUID, ParkingSpaceRange> spaceRangesByZone(TenantId tenantId) {
        Map<UUID, ParkingSpaceRange> byZone = new HashMap<>();
        for (ParkingSpaceRange range : spaceRepository.rangesByZone(tenantId.value())) {
            byZone.put(range.zoneId(), range);
        }
        return byZone;
    }

    /**
     * The tariff in force in each zone of a municipality, in one query.
     *
     * <p>A zone missing from the map has no open tariff window. That is not "free": it is
     * misconfigured, and the caller has to say so rather than quietly price the stay at zero — which
     * is why this returns a map with holes instead of defaulting.</p>
     */
    @Transactional(readOnly = true)
    public Map<UUID, ZonePriceBook> ratesInForce(TenantId tenantId, Instant at) {
        // Ordered zone, then most recent window first, so each zone's rows arrive together and the
        // newest of each kind comes first — which is exactly what ZonePriceBook.of expects.
        Map<UUID, List<ParkingRate>> byZone = new LinkedHashMap<>();
        for (ParkingRate rate : rateRepository.findInForce(tenantId.value(), at)) {
            byZone.computeIfAbsent(rate.getZoneId(), key -> new ArrayList<>()).add(rate);
        }
        Map<UUID, ZonePriceBook> books = new HashMap<>();
        for (Map.Entry<UUID, List<ParkingRate>> entry : byZone.entrySet()) {
            try {
                books.put(entry.getKey(), ZonePriceBook.of(entry.getValue()));
            } catch (IllegalArgumentException noBase) {
                // Rungs without a base is the same misconfiguration as no price at all: the zone
                // stays out of the map and the caller says so, rather than pricing part of it.
                continue;
            }
        }
        return books;
    }

    /**
     * The bays of a zone, or of the whole municipality, by page.
     *
     * <p>Paginated where the zone listing is not, and the asymmetry is the point: a municipality
     * operates a handful of zones and tens of thousands of bays. San José alone has five thousand.
     * A screen that asks for "the bays" without saying which page is asking for a table scan that
     * grows every time the municipality paints a line.</p>
     */
    @Transactional(readOnly = true)
    public PageResponse<ParkingSpace> listSpaces(TenantId tenantId, UUID zoneId, PageRequest request) {
        org.springframework.data.domain.Pageable pageable = org.springframework.data.domain.PageRequest.of(
                request.page(), request.size());
        org.springframework.data.domain.Page<ParkingSpace> page = zoneId == null
                ? spaceRepository.findByTenantIdOrderByCodeAsc(tenantId.value(), pageable)
                : spaceRepository.findByTenantIdAndZoneIdOrderByCodeAsc(tenantId.value(), zoneId, pageable);
        return PageResponse.of(page.getContent(), request.page(), request.size(), page.getTotalElements());
    }

    /**
     * Takes a bay out of service, puts it back, moves it to another zone, or corrects its code.
     *
     * <p>The code became editable in v0.25, reversing the v0.16 rule. The argument that changed it:
     * when a municipality repaints bay 0007 as 0012, that is <em>the same bay</em> — same asphalt,
     * same zone, same history — and forcing an operator to retire a row and create another one to
     * describe a coat of paint splits one bay's record in two. What made the old rule necessary was
     * that a rename used to rewrite the past: the bay code of a stay was resolved live. It no longer
     * is. Every stay carries {@code space_code_snapshot} (V25_0) and every citation carries
     * {@code space_code} (V17_0), so a receipt keeps naming the bay the citizen actually parked in.
     * <b>Do not remove either snapshot without removing this operation first.</b></p>
     *
     * <p>The new code goes through the same validation as a new bay's — the municipality's format,
     * canonicalised, unique inside the municipality — because it is the same kind of fact. The
     * uniqueness check excludes this bay so that re-sending its current code is a no-op rather than
     * a conflict; the unique index is still what guarantees it under a race.</p>
     *
     * <p>A bay is never deleted. {@code OUT_OF_SERVICE} is the answer for a bay that is dug up, and
     * it keeps every stay that was ever paid on it readable.</p>
     */
    @Transactional
    public ParkingSpace updateSpace(TenantId tenantId, UUID spaceId, ParkingSpaceStatus status, UUID zoneId,
                                    String code) {
        ParkingSpace space = spaceRepository.findByTenantIdAndId(tenantId.value(), spaceId)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.PARKING_SPACE_NOT_FOUND,
                        "error.parking.space.notFound"));
        if (code != null && !code.isBlank()) {
            String normalized = spaceFormatService.requireValidCode(tenantId, code);
            if (!normalized.equals(space.getCode())) {
                spaceRepository.findByTenantIdAndCode(tenantId.value(), normalized)
                        .filter((other) -> !other.getId().equals(space.getId()))
                        .ifPresent((other) -> {
                            throw ConflictException.of(ErrorCode.PARKING_SPACE_CODE_TAKEN,
                                    "error.parking.space.code.taken", normalized);
                        });
                space.rename(normalized);
            }
        }
        if (zoneId != null && !zoneId.equals(space.getZoneId())) {
            requireZone(tenantId, zoneId);
            space.reassign(zoneId);
        }
        if (status != null) {
            // Both members of the enum are operator decisions — there is no OCCUPIED to guard
            // against, because occupancy is a consequence of a running stay and is never declared.
            space.changeStatus(status);
        }
        space.touch(clock.instant());
        return spaceRepository.save(space);
    }

    @Transactional(readOnly = true)
    public long countSpaces(TenantId tenantId, UUID zoneId) {
        return spaceRepository.countByTenantIdAndZoneId(tenantId.value(), zoneId);
    }

    /** One bay of this municipality, or {@code PARKING_SPACE_NOT_FOUND}. Narrowed by tenant, always. */
    @Transactional(readOnly = true)
    public ParkingSpace requireSpace(TenantId tenantId, UUID spaceId) {
        return spaceRepository.findByTenantIdAndId(tenantId.value(), spaceId)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.PARKING_SPACE_NOT_FOUND,
                        "error.parking.space.notFound"));
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
     * Sets the <b>base</b> tariff of a zone: closes whatever base window is open and opens a new one
     * from now on. The currency is the municipality's, taken from the tenant rather than accepted
     * from the request — an administrator cannot price a zone in a currency their citizens do not
     * hold.
     *
     * <p>The ladder is untouched. A base and a rung are different statements — "an hour costs ₡550"
     * and "45 minutes costs ₡400" — and changing one has never meant retracting the other.</p>
     */
    @Transactional
    public ParkingRate setRate(TenantId tenantId, UUID zoneId, long amountMinor, int minutes) {
        return setRate(tenantId, zoneId, RateKind.BLOCK, amountMinor, minutes);
    }

    /**
     * Prices one exact duration of a zone (CONTRACT.md v0.24): from now on, a stay of exactly
     * {@code minutes} minutes costs {@code amountMinor}, whatever the base would have computed.
     *
     * <p>Setting a rung twice supersedes it, the same way the base does — the open window closes and
     * a new one opens — so a price change keeps its history instead of overwriting it.</p>
     */
    @Transactional
    public ParkingRate setRung(TenantId tenantId, UUID zoneId, long amountMinor, int minutes) {
        return setRate(tenantId, zoneId, RateKind.EXACT, amountMinor, minutes);
    }

    /**
     * Removes one rung: the duration goes back to being priced by the base.
     *
     * <p>Closes the window rather than deleting the row. What a municipality charged last month has
     * to stay readable, and a rung that is gone from the ladder is exactly as historical as one that
     * was superseded by a new price.</p>
     *
     * @throws NotFoundException {@code PARKING_RATE_NOT_FOUND} when that duration has no open rung
     */
    @Transactional
    public void clearRung(TenantId tenantId, UUID zoneId, int minutes) {
        requireZone(tenantId, zoneId);
        Instant now = clock.instant();
        boolean closed = false;
        for (ParkingRate current : rateRepository.findByTenantIdAndZoneIdOrderByValidFromDesc(tenantId.value(),
                zoneId)) {
            if (current.getValidTo() != null || !current.isExact() || current.getMinutes() != minutes) {
                continue;
            }
            current.close(closeAt(current, now));
            rateRepository.save(current);
            closed = true;
        }
        if (!closed) {
            throw NotFoundException.of(ErrorCode.PARKING_RATE_NOT_FOUND, "error.parking.rate.notFound");
        }
    }

    private ParkingRate setRate(TenantId tenantId, UUID zoneId, RateKind kind, long amountMinor, int minutes) {
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
            if (current.getValidTo() != null || current.getKind() != kind) {
                continue;
            }
            // A rung supersedes only the rung for the same duration; the base supersedes the base.
            // Without this every ladder entry would close every time any price in the zone moved.
            if (kind == RateKind.EXACT && current.getMinutes() != minutes) {
                continue;
            }
            current.close(closeAt(current, now));
            rateRepository.save(current);
        }
        Money amount = Money.ofMinor(amountMinor, tenant.getCurrencyCode());
        return rateRepository.save(new ParkingRate(Uuid7.generate(), tenantId.value(), zoneId, kind, amount,
                minutes, now, null, now));
    }

    /**
     * A window must end strictly after it started (CHECK in V5_0). Two prices set within the same
     * millisecond would otherwise produce {@code valid_to = valid_from} and be refused.
     */
    private static Instant closeAt(ParkingRate current, Instant now) {
        return current.getValidFrom().isBefore(now) ? now : current.getValidFrom().plusMillis(1L);
    }
}
