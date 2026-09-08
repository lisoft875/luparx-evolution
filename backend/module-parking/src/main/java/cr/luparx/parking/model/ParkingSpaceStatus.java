package cr.luparx.parking.model;

/**
 * Operational state of a bay ({@code parking_spaces.status}).
 *
 * <p>There is no {@code DELETED} member on purpose: a bay that stops existing on the street is taken
 * out of service, so the parking sessions and citations that reference it stay referentially valid.
 * The enum is persisted by name, and the same names are repeated in a CHECK constraint in V10_0 — a
 * value the database refuses can never reach a row through a different client.</p>
 */
public enum ParkingSpaceStatus {

    /** Usable: it can be occupied and charged for. */
    AVAILABLE,

    /** Physically unusable (works, event, reserved area). Not chargeable, not deleted. */
    OUT_OF_SERVICE;

    public boolean isUsable() {
        return this == AVAILABLE;
    }
}
