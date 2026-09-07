package cr.luparx.core.domain;

/** Whether a role is granted inside one tenant or across the whole platform (CONTRACT.md §1). */
public enum RoleScope {
    /** Effective only within the tenant that granted the membership. */
    TENANT,
    /** Effective across every tenant; the only explicit exception to tenant isolation (SECURITY.md §3). */
    PLATFORM
}
