package cr.luparx.enforcement.model;

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
 * @param otherStays      running sessions for the same plate elsewhere in this municipality: what
 *                        makes {@code BAY_MISMATCH} and {@code AMBIGUOUS} actionable instead of just
 *                        a refusal, and never anything about who owns them
 * @param checkedAt       the instant this was true, so the answer can be quoted later
 */
public record PlateStatus(String plate,
                          String plateNormalized,
                          PlateVerdict verdict,
                          ParkingStatusPort.Bay bay,
                          ParkingStatusPort.ActiveStay coveringStay,
                          List<ParkingStatusPort.ActiveStay> otherStays,
                          Instant checkedAt) {

    public PlateStatus {
        otherStays = otherStays == null ? List.of() : List.copyOf(otherStays);
    }

    /** True when the officer must supply the bay before the platform will commit to an answer. */
    public boolean requiresBay() {
        return verdict == PlateVerdict.AMBIGUOUS;
    }
}
