package cr.luparx.enforcement.model;

/**
 * Lifecycle of a plate exemption (CONTRACT.md v0.28).
 *
 * <p>Two states, and no {@code EXPIRED}: running out is a fact about the clock, not a decision
 * anybody took. Writing it into a column would need a job to keep the column true, and that job's
 * lag is a window in which an exemption that has run out still reads as live. The row carries
 * {@code validFrom}/{@code validTo} and every reader compares them against now.</p>
 */
public enum ExemptionStatus {

    /** Registered. Whether it exempts <em>right now</em> also depends on its validity window. */
    ACTIVE,
    /**
     * Called back before its window ended. The row stays, because explaining why a car was not fined
     * last March needs the exemption that was in force last March.
     */
    REVOKED
}
