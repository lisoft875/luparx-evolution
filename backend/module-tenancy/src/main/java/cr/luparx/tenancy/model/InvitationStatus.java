package cr.luparx.tenancy.model;

/**
 * Lifecycle of a staff invitation (CONTRACT.md v0.27).
 *
 * <p>Three states and no more. There is deliberately no {@code EXPIRED}: expiry is a fact about the
 * clock, not a decision anybody took, and writing it into a column means somebody has to run a job
 * to keep the column true — a job whose lag is a window in which an expired invitation still reads
 * as PENDING. The invitation carries {@code expiresAt} and every reader compares it against now.</p>
 */
public enum InvitationStatus {

    /** Offered and not yet answered. Whether it is still usable also depends on {@code expiresAt}. */
    PENDING,
    /** The person opened an account with it. The row stays: it is who gave them access, and when. */
    ACCEPTED,
    /** Called back before it was used. Also the row stays, for the same reason. */
    REVOKED
}
