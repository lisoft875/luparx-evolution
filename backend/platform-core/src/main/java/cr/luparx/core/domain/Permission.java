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
    PLATFORM_MANAGE,

    // --- enforcement (CONTRACT.md v0.7). Split into three because they are three different jobs:
    // the officer in the street writes citations, the office reads them, and annulling one is an act
    // a municipality does not hand to everybody who can read.
    /** Write a citation: the officer's capability, and only theirs plus their lead's. */
    CITATION_ISSUE,
    /** Read the municipality's citations, filter them and export them. */
    CITATION_READ,
    /** Annul an issued citation, always with a reason. */
    CITATION_VOID,
    /** Configure what the municipality fines and for how much. */
    ENFORCEMENT_MANAGE;

    /** Authority name exposed to Spring Security expressions ({@code hasAuthority('PERM_USER_READ')}). */
    public String authority() {
        return "PERM_" + name();
    }
}
