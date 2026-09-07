package cr.luparx.core.domain;

/**
 * Fine-grained capabilities (CONTRACT.md §1). Endpoints authorize on a permission, never on a role
 * name, so that changing what a role may do is a configuration change in {@link RolePermissions}
 * rather than an edit scattered across controllers.
 */
public enum Permission {

    USER_READ,
    USER_WRITE,
    USER_BLOCK,
    MEMBERSHIP_APPROVE,
    ROLE_ASSIGN,
    ZONE_ASSIGN,
    AUDIT_READ,
    EXPORT_RUN,
    TENANT_MANAGE,
    PLATFORM_MANAGE;

    /** Authority name exposed to Spring Security expressions ({@code hasAuthority('PERM_USER_READ')}). */
    public String authority() {
        return "PERM_" + name();
    }
}
