package cr.luparx.tenancy.service;

import cr.luparx.core.domain.Permission;
import cr.luparx.core.domain.Portal;
import cr.luparx.core.domain.Role;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

/**
 * Effective authorization of one user on one portal, optionally inside one tenant. This is what the
 * token issuer copies into the {@code roles[]}/{@code perms[]} claims and what the request-scoped
 * tenant context is built from.
 */
public record AccessGrant(
        UserId userId,
        Portal portal,
        TenantId tenantId,
        Set<Role> roles,
        Set<Permission> permissions,
        boolean platformScope) {

    public AccessGrant {
        roles = roles == null || roles.isEmpty()
                ? Collections.emptySet()
                : Collections.unmodifiableSet(EnumSet.copyOf(roles));
        permissions = permissions == null || permissions.isEmpty()
                ? Collections.emptySet()
                : Collections.unmodifiableSet(EnumSet.copyOf(permissions));
    }

    public boolean isEmpty() {
        return roles.isEmpty();
    }

    public boolean has(Permission permission) {
        return permissions.contains(permission);
    }
}
