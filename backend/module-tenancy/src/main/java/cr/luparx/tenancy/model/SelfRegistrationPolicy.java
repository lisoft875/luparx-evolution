package cr.luparx.tenancy.model;

/**
 * How a tenant treats self-registration requests on the admin and inspector portals
 * (CONTRACT.md §1).
 */
public enum SelfRegistrationPolicy {

    /** Requests become active immediately. */
    OPEN,
    /** Requests wait for a TENANT_ADMIN or PLATFORM_ADMIN approval (the default). */
    APPROVAL_REQUIRED,
    /** No self-registration at all: memberships are created by an administrator. */
    INVITE_ONLY
}
