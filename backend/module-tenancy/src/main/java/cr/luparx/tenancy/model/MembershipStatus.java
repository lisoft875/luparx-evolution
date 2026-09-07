package cr.luparx.tenancy.model;

/** Lifecycle of a tenant membership (CONTRACT.md §1). Only ACTIVE grants access. */
public enum MembershipStatus {

    ACTIVE,
    PENDING_APPROVAL,
    REJECTED,
    REVOKED;

    public boolean grantsAccess() {
        return this == ACTIVE;
    }
}
