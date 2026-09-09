package cr.luparx.tenancy.model;

/**
 * Lifecycle of a tenant membership (CONTRACT.md §1). Only ACTIVE grants access.
 *
 * <p>All of this is about one person's access to <em>one municipality</em>, never about the person.
 * A revoked inspector still has an account and still parks in whatever canton they like: their
 * employer ended a post, not a life. Blocking the person outright is a different act, lives on
 * {@code users.status}, and belongs to a different conversation.</p>
 */
public enum MembershipStatus {

    ACTIVE,
    PENDING_APPROVAL,
    REJECTED,
    /**
     * The end of the post. Kept as a row rather than deleted, because everything the person did
     * while they held it hangs off it and none of that may disappear (CONTRACT.md v0.15).
     */
    REVOKED,
    /**
     * Access paused, reversibly (v0.15): a leave of absence, an internal investigation, a badge
     * that went missing. Distinct from REVOKED because "come back on Monday" and "you no longer
     * work here" are different facts, and an administrator who only has the second one to hand
     * ends up using it for the first.
     */
    SUSPENDED;

    public boolean grantsAccess() {
        return this == ACTIVE;
    }

    /** True where reactivating is a return to work rather than a re-approval or a re-hiring. */
    public boolean isReactivatable() {
        return this == SUSPENDED;
    }
}
