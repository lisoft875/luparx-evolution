package cr.luparx.core.domain;

import java.util.Locale;
import java.util.Optional;

/**
 * Roles exactly as declared in CONTRACT.md §1. Each role belongs to one portal and has one scope;
 * a {@code TENANT_ADMIN} role is always relative to the membership that granted it and never
 * implies access to any other tenant (SECURITY.md §3).
 */
public enum Role {

    PLATFORM_ADMIN(Portal.PLATFORM, RoleScope.PLATFORM),
    PLATFORM_SUPPORT(Portal.PLATFORM, RoleScope.PLATFORM),
    TENANT_ADMIN(Portal.ADMIN, RoleScope.TENANT),
    TENANT_FINANCE(Portal.ADMIN, RoleScope.TENANT),
    TENANT_SUPPORT(Portal.ADMIN, RoleScope.TENANT),
    INSPECTOR(Portal.INSPECTOR, RoleScope.TENANT),
    INSPECTOR_LEAD(Portal.INSPECTOR, RoleScope.TENANT),
    CITIZEN(Portal.CITIZEN, RoleScope.TENANT);

    private final Portal portal;
    private final RoleScope scope;

    Role(Portal portal, RoleScope scope) {
        this.portal = portal;
        this.scope = scope;
    }

    public Portal portal() {
        return portal;
    }

    public RoleScope scope() {
        return scope;
    }

    public boolean isPlatformScoped() {
        return scope == RoleScope.PLATFORM;
    }

    /** Authority name exposed to Spring Security expressions ({@code hasRole('TENANT_ADMIN')}). */
    public String authority() {
        return "ROLE_" + name();
    }

    public static Optional<Role> fromName(String name) {
        if (name == null) {
            return Optional.empty();
        }
        String normalized = name.toUpperCase(Locale.ROOT);
        for (Role role : values()) {
            if (role.name().equals(normalized)) {
                return Optional.of(role);
            }
        }
        return Optional.empty();
    }

    /** The role granted by default to a self-registering user on the given portal. */
    public static Role defaultSelfRegistrationRole(Portal portal) {
        return switch (portal) {
            case CITIZEN -> CITIZEN;
            case ADMIN -> TENANT_ADMIN;
            case INSPECTOR -> INSPECTOR;
            case PLATFORM -> throw new IllegalArgumentException("platform portal has no self-registration role");
        };
    }
}
