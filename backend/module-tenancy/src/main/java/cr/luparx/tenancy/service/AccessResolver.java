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

    /**
     * Memberships that would actually produce a usable session right now: active, on this portal,
     * <b>and pointing at a municipality that still allows access</b>.
     *
     * <p>The last clause is what {@link #activeMemberships} deliberately does not check, and the
     * distinction matters. A membership survives its municipality being suspended or closed — the row
     * is history and the person may be re-admitted — but it grants nothing while the municipality is
     * in that state. Counting such a row as "a municipality this person belongs to" is how an account
     * ends up looking as though it had a choice to make when in fact it has none.</p>
     */
    public List<TenantMembership> usableMemberships(UserId userId, Portal portal) {
        List<TenantMembership> result = new ArrayList<>();
        for (TenantMembership membership : activeMemberships(userId, portal)) {
            if (portal == Portal.PLATFORM) {
                // A platform membership belongs to the operator of the product, not to a municipality.
                if (membership.getRole().isPlatformScoped()) {
                    result.add(membership);
                }
                continue;
            }
            if (membership.getTenantId() == null) {
                continue;
            }
            directory.findTenant(TenantId.of(membership.getTenantId()))
                    .filter(tenant -> tenant.getStatus().allowsAccess())
                    .ifPresent(tenant -> result.add(membership));
        }
        return result;
    }

    /**
     * Whether this person can reach anything at all on this portal.
     *
     * <p>False is the state the platform used to report as a bare {@code ACCESS_DENIED} on every
     * endpoint: an account whose only municipality was closed, or one that never received a
     * membership. It says nothing to the person, nothing to support and nothing to whoever is
     * debugging, which is why the caller turns this into an explicit {@code NO_ACTIVE_MEMBERSHIP}.</p>
     */
    public boolean hasUsableMembership(UserId userId, Portal portal) {
        return !usableMemberships(userId, portal).isEmpty();
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

    /**
     * The default tenant of a session: the only municipality this person can actually enter, or none
     * when there is a genuine choice to make.
     *
     * <p>It counts {@link #usableMemberships} and not merely active ones, and that is not a detail.
     * A person whose old municipality was closed and who was then given access to a new one holds two
     * ACTIVE memberships; counting both leaves the session with no tenant, no roles and no
     * permissions, and every tenant-owned endpoint answering "access denied" — for an account that in
     * reality belongs to exactly one municipality and should simply have been placed in it. Only the
     * municipalities that would actually admit the person count as a choice.</p>
     */
    public Optional<TenantId> defaultTenant(UserId userId, Portal portal) {
        List<TenantMembership> usable = usableMemberships(userId, portal);
        if (usable.size() == 1 && usable.get(0).getTenantId() != null) {
            return Optional.of(TenantId.of(usable.get(0).getTenantId()));
        }
        return Optional.empty();
    }
}
