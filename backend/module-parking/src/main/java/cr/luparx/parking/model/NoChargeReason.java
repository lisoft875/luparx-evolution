package cr.luparx.parking.model;

/**
 * Why a stay cost nothing (CONTRACT.md v0.32).
 *
 * <p>It exists because "not charged" with no reason is what leaves an officer in the street with
 * nothing to say to the citizen who is arguing with them. These are three different facts and none
 * of them is a failure to pay.</p>
 */
public enum NoChargeReason {

    /** The zone's courtesy minutes (v0.31). Once per plate per day. */
    COURTESY,

    /** The citizen's own saved minutes covered the whole stay (v0.12). They paid for them before. */
    CREDIT,

    /**
     * Every minute fell outside the municipality's charging hours (v0.3). The citizen parked
     * legitimately at a time this municipality does not charge for.
     */
    OUTSIDE_HOURS
}
