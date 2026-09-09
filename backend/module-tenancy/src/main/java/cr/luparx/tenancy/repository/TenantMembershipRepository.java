package cr.luparx.tenancy.repository;

import cr.luparx.core.domain.Portal;
import cr.luparx.core.domain.Role;
import cr.luparx.tenancy.entity.TenantMembership;
import cr.luparx.tenancy.model.MembershipStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Membership queries. Every method that reads tenant-owned data takes {@code tenantId} as a
 * mandatory parameter (docs/ARCHITECTURE.md §4) — the only tenant-free reads are the ones that
 * resolve the memberships of one specific user, which is that user's own data.
 */
public interface TenantMembershipRepository extends JpaRepository<TenantMembership, UUID> {

    List<TenantMembership> findByUserId(UUID userId);

    List<TenantMembership> findByUserIdAndStatus(UUID userId, MembershipStatus status);

    Optional<TenantMembership> findByTenantIdAndUserIdAndPortal(UUID tenantId, UUID userId, Portal portal);

    List<TenantMembership> findByTenantIdAndUserId(UUID tenantId, UUID userId);

    /** Batched variant used to attach memberships to a page of users without an N+1 query. */
    List<TenantMembership> findByTenantIdAndUserIdIn(UUID tenantId, java.util.Collection<UUID> userIds);

    /** Same, for the platform padrón where memberships of every tenant are shown. */
    List<TenantMembership> findByUserIdIn(java.util.Collection<UUID> userIds);

    Page<TenantMembership> findByTenantIdAndStatus(UUID tenantId, MembershipStatus status, Pageable pageable);

    Page<TenantMembership> findByTenantId(UUID tenantId, Pageable pageable);

    /**
     * The municipality's staff: every membership on a portal other than the citizen's
     * (CONTRACT.md v0.15). Not filtered by status — a suspended or revoked officer has to stay
     * visible in the panel, which is where they are brought back or looked up months later.
     */
    Page<TenantMembership> findByTenantIdAndPortalNot(UUID tenantId, cr.luparx.core.domain.Portal portal,
                                                      Pageable pageable);

    Page<TenantMembership> findByTenantIdAndPortalNotAndStatus(UUID tenantId, cr.luparx.core.domain.Portal portal,
                                                               MembershipStatus status, Pageable pageable);

    /** Ids of the users that hold a membership in this tenant, used to scope every admin user query. */
    @Query("""
            select m.userId from TenantMembership m
            where m.tenantId = :tenantId
              and (:portal is null or m.portal = :portal)
              and (:role is null or m.role = :role)
              and (:status is null or m.status = :status)
            """)
    Page<UUID> findUserIdsInTenant(@Param("tenantId") UUID tenantId,
                                   @Param("portal") Portal portal,
                                   @Param("role") Role role,
                                   @Param("status") MembershipStatus status,
                                   Pageable pageable);

    long countByTenantIdAndStatus(UUID tenantId, MembershipStatus status);

    /** Registered-users report per tenant, grouped by portal (CONTRACT.md §4). */
    @Query("""
            select m.portal, count(m) from TenantMembership m
            where m.tenantId = :tenantId
              and m.requestedAt >= :from and m.requestedAt < :to
            group by m.portal
            """)
    List<Object[]> countByPortalInTenant(@Param("tenantId") UUID tenantId,
                                         @Param("from") Instant from,
                                         @Param("to") Instant to);

    /** Platform-wide registered-users report, grouped by tenant. Platform scope only. */
    @Query("""
            select m.tenantId, count(m) from TenantMembership m
            where m.requestedAt >= :from and m.requestedAt < :to
            group by m.tenantId
            """)
    List<Object[]> countByTenant(@Param("from") Instant from, @Param("to") Instant to);
}
