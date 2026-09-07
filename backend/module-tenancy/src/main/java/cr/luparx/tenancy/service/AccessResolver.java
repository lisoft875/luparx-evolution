package cr.luparx.tenancy.service;

import cr.luparx.core.domain.Permission;
import cr.luparx.core.domain.Portal;
import cr.luparx.core.domain.Role;
import cr.luparx.core.domain.RolePermissions;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ForbiddenException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.entity.TenantMembership;
import cr.luparx.tenancy.model.MembershipStatus;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Turns "who is this user, on which portal, in which tenant" into the roles and permissions that
 * actually apply. This is the single place where authorization is decided; controllers only check
 * the resulting permissions.
 *
 * <p>Isolation rules enforced here:</p>
 * <ul>
 *   <li>a membership only counts for the portal it was granted on — an admin membership never
 *       authorizes an inspector route;</li>
 *   <li>a membership only counts for its own tenant — knowing another tenant's id is not enough;</li>
 *   <li>a suspended or closed tenant grants nothing, whatever the membership says;</li>
 *   <li>platform-scoped roles are the single explicit exception, and only on the platform portal.</li>
 * </ul>
 */
@Service
public class AccessResolver {

    private final AccessDirectory directory;

    public AccessResolver(AccessDirectory directory) {
        this.directory = directory;
    }

    /**
     * Effective grant for a request.
     *
     * @param tenantId the tenant the caller wants to act in; null means "no tenant selected"
     * @throws ForbiddenException when the user has no active membership that authorizes the request
     */
    public AccessGrant resolve(UserId userId, Portal portal, TenantId tenantId) {
        List<TenantMembership> memberships = directory.membershipsOf(userId);

        if (portal == Portal.PLATFORM) {
            Set<Role> platformRoles = EnumSet.noneOf(Role.class);
            for (TenantMembership membership : memberships) {
                if (membership.getPortal() == Portal.PLATFORM
                        && membership.getStatus() == MembershipStatus.ACTIVE
                        && membership.getRole().isPlatformScoped()) {
                    platformRoles.add(membership.getRole());
                }
            }
            if (platformRoles.isEmpty()) {
                throw ForbiddenException.of(ErrorCode.MEMBERSHIP_NOT_ACTIVE, "error.membership.notActive");
            }
            // A platform operator acts across tenants; `tid` stays null so no tenant-owned query is
            // silently narrowed to a tenant the operator merely happened to look at last.
            return new AccessGrant(userId, portal, null, platformRoles,
                    RolePermissions.of(platformRoles), true);
        }

        if (tenantId == null) {
            // A session with no municipality selected is legitimate: a citizen may not have chosen one
            // yet (CONTRACT.md §1), and a person who administers several municipalities must be able to
            // sign in before picking one. Such a session carries NO roles and therefore no permissions,
            // so it reaches only the endpoints that need none (/me, /me/memberships, /session/tenant);
            // anything tenant-owned fails at TenantContextHolder.requireTenantId().
            return new AccessGrant(userId, portal, null, Set.of(), Set.of(), false);
        }

        Tenant tenant = directory.findTenant(tenantId)
                .orElseThrow(() -> ForbiddenException.of(ErrorCode.TENANT_NOT_FOUND, "error.tenant.notFound"));
        if (!tenant.getStatus().allowsAccess()) {
            throw ForbiddenException.of(ErrorCode.TENANT_NOT_ACTIVE, "error.tenant.notActive");
        }

        Set<Role> roles = EnumSet.noneOf(Role.class);
        for (TenantMembership membership : memberships) {
            if (membership.getStatus() == MembershipStatus.ACTIVE
                    && membership.getPortal() == portal
                    && tenantId.value().equals(membership.getTenantId())) {
                roles.add(membership.getRole());
            }
        }
        if (roles.isEmpty()) {
            throw ForbiddenException.of(ErrorCode.MEMBERSHIP_NOT_ACTIVE, "error.membership.notActive");
        }
        Set<Permission> permissions = RolePermissions.of(roles);
        return new AccessGrant(userId, portal, tenantId, roles, permissions, false);
    }

    /** Active memberships of a user on a portal, used to populate the tenant switcher. */
    public List<TenantMembership> activeMemberships(UserId userId, Portal portal) {
        List<TenantMembership> result = new ArrayList<>();
        for (TenantMembership membership : directory.membershipsOf(userId)) {
            if (membership.getStatus() == MembershipStatus.ACTIVE && membership.getPortal() == portal) {
                result.add(membership);
            }
        }
        return result;
    }

    /** Every membership of a user, whatever its status; used by {@code GET /{portal}/me}. */
    public List<TenantMembership> allMemberships(UserId userId) {
        return directory.membershipsOf(userId);
    }

    /**
     * True when the user holds an active platform-scoped role. Used to decide whether an operation
     * may legitimately cross tenant boundaries — and every such crossing is audited by the caller.
     */
    public boolean hasPlatformScope(UserId userId) {
        for (TenantMembership membership : directory.membershipsOf(userId)) {
            if (membership.getStatus() == MembershipStatus.ACTIVE
                    && membership.getPortal() == Portal.PLATFORM
                    && membership.getRole().isPlatformScoped()) {
                return true;
            }
        }
        return false;
    }

    /** The default tenant of a session: the only active membership, or none when there is a choice. */
    public Optional<TenantId> defaultTenant(UserId userId, Portal portal) {
        List<TenantMembership> active = activeMemberships(userId, portal);
        if (active.size() == 1 && active.get(0).getTenantId() != null) {
            return Optional.of(TenantId.of(active.get(0).getTenantId()));
        }
        return Optional.empty();
    }
}
