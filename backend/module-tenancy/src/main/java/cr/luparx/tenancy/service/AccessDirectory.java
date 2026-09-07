package cr.luparx.tenancy.service;

import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.entity.TenantMembership;

import java.util.List;
import java.util.Optional;

/**
 * Narrow read port used by {@link AccessResolver}. Keeping the resolver behind this two-method
 * interface (rather than injecting the Spring Data repositories directly) is what lets the tenant
 * isolation rules be unit-tested without a database, and mirrors the port that would front an
 * extracted tenancy service.
 */
public interface AccessDirectory {

    /** Every membership of the user, in any status; the resolver decides which ones grant access. */
    List<TenantMembership> membershipsOf(UserId userId);

    Optional<Tenant> findTenant(TenantId tenantId);
}
