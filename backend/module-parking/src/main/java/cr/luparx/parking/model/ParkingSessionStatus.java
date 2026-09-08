package cr.luparx.parking.model;

/**
 * Lifecycle of a parking session ({@code parking_sessions.status}).
 *
 * <p>Only {@link #ACTIVE} holds a bay and a vehicle: the two partial unique indexes in V11_0 are
 * defined over exactly this value, so the invariants "one session per bay" and "one session per
 * vehicle" are facts of the schema and not of a service method. The same names are repeated in a
 * CHECK constraint, so a value the database refuses can never arrive through another client.</p>
 */
public enum ParkingSessionStatus {

    /** Running. The bay is taken and the countdown is on the citizen's screen. */
    ACTIVE,

    /** Closed by the citizen before the clock ran out, or exactly at the end. */
    FINISHED,

    /** The clock ran out past the municipality's grace and nobody closed it. */
    EXPIRED;

    public boolean isActive() {
        return this == ACTIVE;
    }
}
