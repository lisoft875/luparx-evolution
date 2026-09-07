package cr.luparx.app.repository;

import cr.luparx.core.domain.Portal;
import cr.luparx.core.domain.Role;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.model.UserStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

/**
 * The one query that joins identity and tenancy.
 *
 * <p>It lives in the application module on purpose: neither module-identity nor module-tenancy may
 * depend on the other (docs/ARCHITECTURE.md §1), so the composition happens here, where both are
 * already visible. Should tenancy ever be extracted into its own service, this is the single place
 * that becomes a two-call orchestration.</p>
 *
 * <p>{@code tenantId} is a mandatory parameter with no null branch: an admin-portal user listing can
 * never degrade into "all users of the platform".</p>
 */
public interface TenantScopedUserRepository extends Repository<User, UUID> {

    @Query(value = """
            select distinct u from User u, TenantMembership m
            where m.userId = u.id
              and m.tenantId = :tenantId
              and (:portal is null or m.portal = :portal)
              and (:role is null or m.role = :role)
              and (:status is null or u.status = :status)
              and (:term is null or lower(u.email) like :term or lower(u.givenName) like :term
                   or lower(u.familyName) like :term or lower(u.documentNumberNormalized) like :term)
            """,
            // Explicit count query: a derived one over a two-root join with DISTINCT is exactly the
            // kind of thing that differs subtly between Hibernate versions.
            countQuery = """
                    select count(distinct u) from User u, TenantMembership m
                    where m.userId = u.id
                      and m.tenantId = :tenantId
                      and (:portal is null or m.portal = :portal)
                      and (:role is null or m.role = :role)
                      and (:status is null or u.status = :status)
                      and (:term is null or lower(u.email) like :term or lower(u.givenName) like :term
                           or lower(u.familyName) like :term or lower(u.documentNumberNormalized) like :term)
                    """)
    Page<User> search(@Param("tenantId") UUID tenantId,
                      @Param("portal") Portal portal,
                      @Param("role") Role role,
                      @Param("status") UserStatus status,
                      @Param("term") String term,
                      Pageable pageable);

    /**
     * Membership check used before any single-user read or write on the admin portal: knowing a user
     * id is never enough, the person must actually belong to the active tenant (SECURITY.md §3).
     */
    @Query("""
            select count(m) from TenantMembership m
            where m.tenantId = :tenantId and m.userId = :userId
            """)
    long countMemberships(@Param("tenantId") UUID tenantId, @Param("userId") UUID userId);
}
