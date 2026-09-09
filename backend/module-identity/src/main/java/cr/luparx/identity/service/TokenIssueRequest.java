package cr.luparx.identity.service;

import cr.luparx.core.domain.Permission;
import cr.luparx.core.domain.Portal;
import cr.luparx.core.domain.Role;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;

import java.util.Set;

/**
 * Everything the token issuer needs, supplied by the caller.
 *
 * <p>Roles and permissions arrive as a parameter instead of being looked up here on purpose:
 * module-identity must not depend on module-tenancy (docs/ARCHITECTURE.md §5), so the application
 * layer resolves the grant through {@code AccessResolver} and passes the result in.</p>
 */
public record TokenIssueRequest(
        UserId userId,
        Portal portal,
        TenantId tenantId,
        Set<Role> roles,
        Set<Permission> permissions,
        String locale,
        int credentialsVersion) {
}
