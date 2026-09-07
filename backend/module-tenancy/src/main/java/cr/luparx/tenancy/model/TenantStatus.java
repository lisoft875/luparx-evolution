package cr.luparx.tenancy.model;

/** Lifecycle of a municipality (CONTRACT.md §4 {@code POST /platform/tenants/{id}/status}). */
public enum TenantStatus {

    /** Fully operational and publishable in the public tenant catalogue. */
    ACTIVE,
    /** Temporarily disabled: no login, no new memberships; data is preserved. */
    SUSPENDED,
    /** Permanently closed. Rows are kept for audit and historical integrity; never deleted. */
    CLOSED;

    /** Only active tenants appear in the unauthenticated catalogue (SECURITY.md §1). */
    public boolean isPublishable() {
        return this == ACTIVE;
    }

    public boolean allowsAccess() {
        return this == ACTIVE;
    }
}
