package cr.luparx.enforcement.model;

/**
 * Lifecycle of a plate exemption (CONTRACT.md v0.28).
 *
 * <p>Four states since v0.30, when a permit became something that is <em>requested</em> before it is
 * granted — a state that can be rejected implies somebody asked.</p>
 *
 * <p>Still no {@code EXPIRED}: running out is a fact about the clock, not a decision anybody took.
 * Writing it into a column would need a job to keep the column true, and that job's lag is a window
 * in which a permit that has run out still reads as live. The row carries {@code validFrom}/{@code
 * validTo} and every reader compares them against now.</p>
 */
public enum ExemptionStatus {

    /** Requested and not yet resolved. It exempts nobody: a permit grants nothing until it is granted. */
    PENDING,
    /**
     * Granted. Whether it exempts <em>right now</em> also depends on its validity window — see
     * {@code PlateExemption.isInForceAt}.
     */
    APPROVED,
    /** Refused, with a reason. The row stays: a refusal is an answer somebody is owed. */
    REJECTED,
    /**
     * Called back after being granted. The row stays, because explaining why a car was not fined
     * last March needs the permit that was in force last March.
     */
    REVOKED,
    /**
     * What v0.28 called an approved permit, before there was a state in front of it.
     *
     * @deprecated since v0.30. Kept only so a row written by an instance older than V29_0 can still
     *         be read during the expansion phase; the migration rewrote every existing row to
     *         {@link #APPROVED}, and this value disappears in the contraction.
     */
    @Deprecated(since = "0.30")
    ACTIVE;

    /** True for the states in which a permit can actually exempt a vehicle. */
    public boolean isGranted() {
        return this == APPROVED || this == ACTIVE;
    }
}
