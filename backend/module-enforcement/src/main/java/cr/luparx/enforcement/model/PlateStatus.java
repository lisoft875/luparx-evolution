package cr.luparx.enforcement.model;

import cr.luparx.enforcement.entity.PlateExemption;
import cr.luparx.enforcement.port.ParkingStatusPort;

import java.time.Instant;
import java.util.List;

/**
 * What the platform knows about one plate, at one bay, at one instant — the answer to the only
 * question an inspector asks before deciding whether to write a citation.
 *
 * @param plate           the plate as the officer typed it
 * @param plateNormalized the form the platform compared
 * @param verdict         see {@link PlateVerdict}; the server never says {@code COVERED} without a bay
 * @param bay             the bay the lookup was narrowed to, null when none was given
 * @param coveringStay    the running session on that bay for this plate, when there is one
 * @param expiredStay     the session that ran out on this bay for this plate, when that is why the
 *                        verdict is {@code EXPIRED}. It is what turns "no pagó" into "pagó hasta las
 *                        14:30", which is a different thing to say to a driver
 * @param exemption       the exemption in force, when there is one. Present only for {@code EXEMPT},
 *                        and carrying its reason: an officer who does not fine a car has to be able
 *                        to say why, on the spot and months later
 * @param otherStays      running sessions for the same plate elsewhere in this municipality, already
 *                        narrowed to the zones this officer covers, and never anything about who
 *                        owns them
 * @param graceMinutes    the municipality's tolerance after the clock runs out. Carried so the
 *                        screen can explain a {@code COVERED} whose expiry time has already passed —
 *                        which until v0.28 read as a contradiction on screen with no explanation
 * @param checkedAt       the instant this was true, so the answer can be quoted later
 */
public record PlateStatus(String plate,
                          String plateNormalized,
                          PlateVerdict verdict,
                          ParkingStatusPort.Bay bay,
                          ParkingStatusPort.ActiveStay coveringStay,
                          ParkingStatusPort.ActiveStay expiredStay,
                          PlateExemption exemption,
                          List<ParkingStatusPort.ActiveStay> otherStays,
                          int graceMinutes,
                          Instant checkedAt) {

    public PlateStatus {
        otherStays = otherStays == null ? List.of() : List.copyOf(otherStays);
    }

    /** True when the officer must supply the bay before the platform will commit to an answer. */
    public boolean requiresBay() {
        return verdict == PlateVerdict.AMBIGUOUS;
    }
}
