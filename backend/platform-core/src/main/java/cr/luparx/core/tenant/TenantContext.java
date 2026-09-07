package cr.luparx.core.tenant;

import cr.luparx.core.domain.Permission;
import cr.luparx.core.domain.Portal;
import cr.luparx.core.domain.Role;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Objects;
import java.util.Set;

/**
 * Immutable snapshot of who is calling, through which portal and inside which tenant. It is built
 * once per request from the verified JWT claims — never from a request parameter the client controls
 * (docs/ARCHITECTURE.md §4).
 *
 * @param userId       the authenticated principal
 * @param portal       the portal whose route is being served
 * @param tenantId     the active tenant, null for platform-scoped calls and for a citizen with no
 *                     tenant selected yet
 * @param roles        effective roles inside {@code tenantId} (or platform-wide roles)
 * @param permissions  permissions derived from {@code roles} via RolePermissions
 * @param platformScope true when the caller holds a platform-scoped role; the single, audited
 *                      exception to tenant isolation (SECURITY.md §3)
 */
public record TenantContext(
        UserId userId,
        Portal portal,
        TenantId tenantId,
        Set<Role> roles,
        Set<Permission> permissions,
        boolean platformScope) {

    public TenantContext {
        Objects.requireNonNull(userId, "userId must not be null");
        Objects.requireNonNull(portal, "portal must not be null");
        roles = roles == null || roles.isEmpty()
                ? Collections.emptySet()
                : Collections.unmodifiableSet(EnumSet.copyOf(roles));
        permissions = permissions == null || permissions.isEmpty()
                ? Collections.emptySet()
                : Collections.unmodifiableSet(EnumSet.copyOf(permissions));
    }

    public boolean hasTenant() {
        return tenantId != null;
    }

    public boolean hasPermission(Permission permission) {
        return permissions.contains(permission);
    }

    public boolean hasRole(Role role) {
        return roles.contains(role);
    }
}
