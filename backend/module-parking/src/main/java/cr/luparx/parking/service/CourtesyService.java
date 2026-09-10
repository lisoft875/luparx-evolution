package cr.luparx.parking.service;

import cr.luparx.core.i18n.TimeZones;
import cr.luparx.core.id.TenantId;
import cr.luparx.parking.model.ZoneRules;
import cr.luparx.parking.repository.ParkingSessionRepository;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.service.TenantService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * Whether a stay can be given away (CONTRACT.md v0.31, "Minutos de cortesía").
 *
 * <h2>What courtesy is</h2>
 *
 * <p>The first minutes of a stay are not charged, so that somebody who stops to drop something off
 * does not pay. In a prepaid model that means one thing concretely: the citizen may start a
 * <b>free stay</b> no longer than the zone's courtesy, and nothing is taken from their wallet or from
 * their saved minutes for it.</p>
 *
 * <h2>Why it is limited, and to what</h2>
 *
 * <p>Free minutes with no limit are not courtesy, they are free parking: leaving and starting again
 * every fifteen minutes would hold a bay all day for nothing, and the bay is the scarce thing a
 * municipality is managing. The limit is <b>one courtesy stay per plate per calendar day</b>, in the
 * municipality's own time zone.</p>
 *
 * <p>Three choices inside that sentence, each of which could have gone the other way:</p>
 * <ul>
 *   <li><b>Per plate</b>, not per account. The bay is held by a car. Counting per account would let
 *       one household's three cars take three free bays, and would punish somebody who parks a
 *       borrowed car once.</li>
 *   <li><b>Per municipality</b>, not per zone. Moving one block to reset the free quarter-hour is the
 *       obvious way around this, and it is the abuse the limit exists for.</li>
 *   <li><b>Per calendar day</b>, not a rolling window. "Once a day" is a sentence a person at a
 *       counter can say and a citizen can predict. A rolling twenty-four hours is fairer in the
 *       abstract and unexplainable in practice — the answer to "why can't I?" becomes an arithmetic
 *       problem about yesterday afternoon.</li>
 * </ul>
 *
 * <p>The count is over the stays themselves rather than a ledger of its own: "has this plate had its
 * courtesy today" is a question about stays that already exist, not a new fact that needs recording
 * somewhere else.</p>
 */
@Service
public class CourtesyService {

    private final ParkingSessionRepository sessionRepository;
    private final TenantService tenantService;

    public CourtesyService(ParkingSessionRepository sessionRepository, TenantService tenantService) {
        this.sessionRepository = sessionRepository;
        this.tenantService = tenantService;
    }

    /**
     * Whether this stay would be a courtesy one.
     *
     * @param plate the normalised plate, which is what the limit is counted against
     * @return false when the zone offers no courtesy, when the stay is longer than it, or when this
     *         plate has already had one today
     */
    @Transactional(readOnly = true)
    public boolean isAvailable(TenantId tenantId, ZoneRules rules, String plate, int minutes, Instant now) {
        if (!rules.isCourtesyLength(minutes) || plate == null || plate.isBlank()) {
            return false;
        }
        return !usedToday(tenantId, plate, now);
    }

    /** Whether this plate has already taken its courtesy stay today, in the municipality's own day. */
    @Transactional(readOnly = true)
    public boolean usedToday(TenantId tenantId, String plate, Instant now) {
        ZoneId zone = zoneOf(tenantId);
        LocalDate today = now.atZone(zone).toLocalDate();
        Instant dayStart = today.atStartOfDay(zone).toInstant();
        Instant dayEnd = today.plusDays(1).atStartOfDay(zone).toInstant();
        return sessionRepository.existsByTenantIdAndPlateSnapshotAndCourtesyTrueAndStartedAtBetween(
                tenantId.value(), plate, dayStart, dayEnd);
    }

    /**
     * The municipality's own zone. A midnight is a local fact: "once a day" has to mean the day the
     * person is standing in, not a day that turns over at seven in the evening.
     */
    private ZoneId zoneOf(TenantId tenantId) {
        Tenant tenant = tenantService.require(tenantId);
        return TimeZones.parse(tenant.getTimeZone()).orElse(ZoneId.of("UTC"));
    }
}
