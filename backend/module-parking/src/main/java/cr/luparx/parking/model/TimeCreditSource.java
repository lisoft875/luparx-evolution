package cr.luparx.parking.model;

/**
 * Why a minute credit moved ({@code parking_time_credit_entries.source}).
 *
 * <p>Positive movements ({@link #EARLY_FINISH}, {@link #ADJUSTMENT}) create a lot with its own
 * expiry; negative ones record where the minutes went.</p>
 */
public enum TimeCreditSource {

    /** Minutes left over when the citizen closed a session early. Positive. */
    EARLY_FINISH,

    /** Minutes spent starting a session. Negative. */
    SESSION_START,

    /** Minutes spent extending a session. Negative. */
    EXTENSION,

    /** Minutes swept because their lot reached its expiry. Negative. */
    EXPIRY,

    /** Operator correction, in either direction. */
    ADJUSTMENT
}
