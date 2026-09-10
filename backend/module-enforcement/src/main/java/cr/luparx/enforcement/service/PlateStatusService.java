package cr.luparx.enforcement.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.enforcement.entity.PlateExemption;
import cr.luparx.enforcement.model.PlateFormat;
import cr.luparx.enforcement.model.PlateStatus;
import cr.luparx.enforcement.model.PlateVerdict;
import cr.luparx.enforcement.port.ParkingStatusPort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * "Has this plate paid, here, now?" — the lookup the whole enforcement flow starts from.
 *
 * <p>The interesting part of this service is what it refuses to do. Plates are unique per citizen and
 * not globally, so more than one running session for the same plate is a normal state of the world;
 * a lookup that answered with the first match would let one citizen's payment excuse another
 * citizen's infraction, silently and forever. The rule adopted here is written out in
 * {@link PlateVerdict}: <b>the bay is the discriminator</b>, and without it the answer is
 * {@code AMBIGUOUS} rather than a guess.</p>
 *
 * <p>Nothing here decides to fine anybody. It reports what the platform knows — including, when the
 * plate paid for a different bay, exactly which one — and leaves the decision and the infraction type
 * to the officer, who is the only party standing in front of the car.</p>
 */
@Service
public class PlateStatusService {

    /**
     * How far back a stay counts as "just ran out".
     *
     * <p>Long enough to cover the driver who is still standing by the car arguing, short enough that
     * "venció" never describes something from another shift. Beyond it the plate reads as
     * {@code NOT_COVERED}, which by then is the truer statement.</p>
     */
    private static final Duration EXPIRED_LOOKBACK = Duration.ofHours(3);

    private final ParkingStatusPort parkingStatus;
    private final PlateExemptionService exemptionService;
    private final Clock clock;

    public PlateStatusService(ParkingStatusPort parkingStatus,
                              PlateExemptionService exemptionService,
                              Clock clock) {
        this.parkingStatus = parkingStatus;
        this.exemptionService = exemptionService;
        this.clock = clock;
    }

    /**
     * @param zoneId    the zone the officer is patrolling, optional
     * @param spaceCode the code painted on the bay in front of them, optional — but the answer is
     *                  only ever conclusive when it is supplied
     */
    @Transactional(readOnly = true)
    public PlateStatus lookup(TenantId tenantId, String plate, UUID zoneId, String spaceCode) {
        return lookup(tenantId, plate, zoneId, spaceCode, List.of());
    }

    /**
     * @param visibleZoneIds the zones this officer covers. Empty means no restriction — the same
     *                       reading {@code membership_zones} has everywhere else (CONTRACT.md v0.15).
     *                       It narrows {@code otherStays}, which until v0.28 came back unfiltered and
     *                       told an officer assigned to one sector where a plate was parked across
     *                       the whole municipality.
     */
    @Transactional(readOnly = true)
    public PlateStatus lookup(TenantId tenantId, String plate, UUID zoneId, String spaceCode,
                              Collection<UUID> visibleZoneIds) {
        String normalized = normalize(plate);
        ParkingStatusPort.Bay bay = resolveBay(tenantId, zoneId, spaceCode);
        Instant now = clock.instant();
        int grace = parkingStatus.graceMinutes(tenantId);

        // FIRST, before anything about payment. An exempt vehicle is exempt whether or not it also
        // paid, and asking about payment first would answer "no pagó" for a car this municipality
        // had already decided never to fine.
        Optional<PlateExemption> exemption = exemptionService.inForce(tenantId, normalized);
        if (exemption.isPresent()) {
            return new PlateStatus(plate, normalized, PlateVerdict.EXEMPT, bay, null, null,
                    exemption.get(), List.of(), grace, now);
        }

        List<ParkingStatusPort.ActiveStay> stays = visible(
                parkingStatus.activeStays(tenantId, normalized), visibleZoneIds, bay);
        List<ParkingStatusPort.ActiveStay> expired = parkingStatus.recentlyExpiredStays(
                tenantId, normalized, now.minus(EXPIRED_LOOKBACK));

        if (stays.isEmpty() && expired.isEmpty()) {
            // Nothing running and nothing that just ran out. The clearest case there is.
            return new PlateStatus(plate, normalized, PlateVerdict.NOT_COVERED, bay, null, null, null,
                    List.of(), grace, now);
        }
        if (bay == null) {
            // Matches exist but there is no bay to attribute them to. Saying "covered" here would be
            // guessing which of several cars carrying this plate is the one in front of the officer.
            return new PlateStatus(plate, normalized, PlateVerdict.AMBIGUOUS, null, null, null, null,
                    stays, grace, now);
        }

        ParkingStatusPort.ActiveStay covering = null;
        List<ParkingStatusPort.ActiveStay> elsewhere = new ArrayList<>(stays.size());
        for (ParkingStatusPort.ActiveStay stay : stays) {
            if (covering == null && bay.spaceId().equals(stay.spaceId())) {
                covering = stay;
            } else {
                elsewhere.add(stay);
            }
        }
        if (covering != null) {
            return new PlateStatus(plate, normalized, PlateVerdict.COVERED, bay, covering, null, null,
                    elsewhere, grace, now);
        }

        // Nothing running HERE. Before saying "no pagó", check whether it paid for this very bay and
        // the clock beat them: the most recent one, because a plate may have paid twice today.
        ParkingStatusPort.ActiveStay ranOutHere = null;
        for (ParkingStatusPort.ActiveStay stay : expired) {
            if (bay.spaceId().equals(stay.spaceId())
                    && (ranOutHere == null || stay.expiresAt().isAfter(ranOutHere.expiresAt()))) {
                ranOutHere = stay;
            }
        }
        if (ranOutHere != null) {
            return new PlateStatus(plate, normalized, PlateVerdict.EXPIRED, bay, null, ranOutHere, null,
                    elsewhere, grace, now);
        }
        if (!elsewhere.isEmpty()) {
            return new PlateStatus(plate, normalized, PlateVerdict.BAY_MISMATCH, bay, null, null, null,
                    elsewhere, grace, now);
        }
        // Something ran out, but on another bay. That is not this bay's business and saying
        // "venció" here would attribute a payment to a space it never covered.
        return new PlateStatus(plate, normalized, PlateVerdict.NOT_COVERED, bay, null, null, null,
                List.of(), grace, now);
    }

    /**
     * The stays this officer may be told about.
     *
     * <p>The bay they are standing at is always included even when its zone is not in their
     * assignment: they were allowed to ask about it, so refusing to explain the answer would leave
     * them with a verdict and no reason for it. Everything else is narrowed to the sectors they
     * cover — an officer assigned to one zone has no business learning where a plate is parked
     * across the whole municipality, and until v0.28 that is exactly what came back.</p>
     */
    private static List<ParkingStatusPort.ActiveStay> visible(List<ParkingStatusPort.ActiveStay> stays,
                                                              Collection<UUID> visibleZoneIds,
                                                              ParkingStatusPort.Bay bay) {
        if (visibleZoneIds == null || visibleZoneIds.isEmpty()) {
            return stays;
        }
        List<ParkingStatusPort.ActiveStay> allowed = new ArrayList<>(stays.size());
        for (ParkingStatusPort.ActiveStay stay : stays) {
            if (visibleZoneIds.contains(stay.zoneId())
                    || (bay != null && bay.spaceId().equals(stay.spaceId()))) {
                allowed.add(stay);
            }
        }
        return allowed;
    }

    /**
     * The bay, when the officer named one. Both parts are required together: a zone without a code
     * does not identify a bay, and a code without a zone is not unique across a municipality's zones
     * unless the format says so — so asking for both is the honest contract.
     */
    private ParkingStatusPort.Bay resolveBay(TenantId tenantId, UUID zoneId, String spaceCode) {
        boolean hasZone = zoneId != null;
        boolean hasCode = spaceCode != null && !spaceCode.isBlank();
        if (!hasZone && !hasCode) {
            return null;
        }
        if (hasZone != hasCode) {
            throw new ValidationException(hasZone ? "spaceCode" : "zoneId", ErrorCode.VALIDATION_FAILED,
                    "error.enforcement.plate.bayIncomplete");
        }
        Optional<ParkingStatusPort.Bay> bay = parkingStatus.findBay(tenantId, zoneId, spaceCode.trim());
        return bay.orElseThrow(() -> NotFoundException.of(ErrorCode.PARKING_SPACE_NOT_FOUND,
                "error.parking.space.notFound"));
    }

    /**
     * Normalises the plate the way the parking domain does — upper case, separators removed — so that
     * {@code sjp-123} read off a windscreen matches {@code SJP123} in the register.
     *
     * <p>Kept as a method here because it is what every caller of this service already reaches for;
     * the rule itself lives in {@link PlateFormat}, where the exemption register shares it without
     * the two services having to depend on each other.</p>
     */
    public String normalize(String plate) {
        return PlateFormat.normalize(plate);
    }

    /** The same treatment for a fragment typed into a search box — see {@link PlateFormat}. */
    public String normalizeFragment(String fragment) {
        return PlateFormat.normalizeFragment(fragment);
    }
}
