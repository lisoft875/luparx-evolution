package cr.luparx.enforcement.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.enforcement.model.PlateStatus;
import cr.luparx.enforcement.model.PlateVerdict;
import cr.luparx.enforcement.port.ParkingStatusPort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
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

    /** Longest plate accepted, matching {@code vehicles.plate_normalized} in the parking domain. */
    private static final int MAX_PLATE_LENGTH = 16;

    private final ParkingStatusPort parkingStatus;
    private final Clock clock;

    public PlateStatusService(ParkingStatusPort parkingStatus, Clock clock) {
        this.parkingStatus = parkingStatus;
        this.clock = clock;
    }

    /**
     * @param zoneId    the zone the officer is patrolling, optional
     * @param spaceCode the code painted on the bay in front of them, optional — but the answer is
     *                  only ever conclusive when it is supplied
     */
    @Transactional(readOnly = true)
    public PlateStatus lookup(TenantId tenantId, String plate, UUID zoneId, String spaceCode) {
        String normalized = normalize(plate);
        ParkingStatusPort.Bay bay = resolveBay(tenantId, zoneId, spaceCode);
        List<ParkingStatusPort.ActiveStay> stays = parkingStatus.activeStays(tenantId, normalized);

        if (stays.isEmpty()) {
            // Nothing running for this plate anywhere in the municipality. The clearest case there is.
            return new PlateStatus(plate, normalized, PlateVerdict.NOT_COVERED, bay, null, List.of(),
                    clock.instant());
        }
        if (bay == null) {
            // Matches exist but there is no bay to attribute them to. Saying "covered" here would be
            // guessing which of several cars carrying this plate is the one in front of the officer.
            return new PlateStatus(plate, normalized, PlateVerdict.AMBIGUOUS, null, null, stays, clock.instant());
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
        PlateVerdict verdict = covering != null ? PlateVerdict.COVERED : PlateVerdict.BAY_MISMATCH;
        return new PlateStatus(plate, normalized, verdict, bay, covering, elsewhere, clock.instant());
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
     * {@code sjp-123} scanned off a windscreen matches {@code SJP123} in the register. No country's
     * plate shape is validated: rejecting a valid foreign plate would leave an officer unable to cite
     * a car that is very much parked in front of them.
     */
    public String normalize(String plate) {
        if (plate == null) {
            throw new ValidationException("plate", ErrorCode.VALIDATION_FAILED, "error.parking.plate.invalid");
        }
        String upper = plate.toUpperCase(Locale.ROOT);
        StringBuilder builder = new StringBuilder(upper.length());
        for (int index = 0; index < upper.length(); index++) {
            char character = upper.charAt(index);
            if ((character >= 'A' && character <= 'Z') || (character >= '0' && character <= '9')) {
                builder.append(character);
            }
        }
        if (builder.isEmpty() || builder.length() > MAX_PLATE_LENGTH) {
            throw new ValidationException("plate", ErrorCode.VALIDATION_FAILED, "error.parking.plate.invalid");
        }
        return builder.toString();
    }
}
