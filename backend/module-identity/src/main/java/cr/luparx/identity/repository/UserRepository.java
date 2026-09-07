package cr.luparx.identity.repository;

import cr.luparx.geo.model.IdentityDocumentTypeCode;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.model.UserStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Users are global (CONTRACT.md §1), so this repository has no tenant parameter. Tenant scoping is
 * applied one layer up: an admin-portal query first resolves the user ids that hold a membership in
 * the active tenant and then calls {@link #searchByIds}. There is deliberately no unbounded
 * "list all users" method reachable from a tenant portal.
 */
public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    boolean existsByDocumentCountryCodeAndDocumentTypeAndDocumentNumberNormalized(
            String documentCountryCode, IdentityDocumentTypeCode documentType, String documentNumberNormalized);

    Optional<User> findByDocumentCountryCodeAndDocumentTypeAndDocumentNumberNormalized(
            String documentCountryCode, IdentityDocumentTypeCode documentType, String documentNumberNormalized);

    List<User> findByIdIn(Collection<UUID> ids);

    /** Tenant-scoped listing: the caller supplies the ids that belong to the active tenant. */
    @Query("""
            select u from User u
            where u.id in :ids
              and (:status is null or u.status = :status)
              and (:term is null or lower(u.email) like :term or lower(u.givenName) like :term
                   or lower(u.familyName) like :term or lower(u.documentNumberNormalized) like :term)
            """)
    Page<User> searchByIds(@Param("ids") Collection<UUID> ids,
                           @Param("term") String term,
                           @Param("status") UserStatus status,
                           Pageable pageable);

    /** Platform-wide padrón (CONTRACT.md §4 {@code GET /platform/users}). Platform scope only. */
    @Query("""
            select u from User u
            where (:status is null or u.status = :status)
              and (:countryCode is null or u.nationalityCode = :countryCode)
              and (:term is null or lower(u.email) like :term or lower(u.givenName) like :term
                   or lower(u.familyName) like :term or lower(u.documentNumberNormalized) like :term)
            """)
    Page<User> searchGlobal(@Param("term") String term,
                            @Param("status") UserStatus status,
                            @Param("countryCode") String countryCode,
                            Pageable pageable);

    /** Registered-users report at platform level, grouped by nationality. */
    @Query("""
            select u.nationalityCode, count(u) from User u
            where u.createdAt >= :from and u.createdAt < :to
            group by u.nationalityCode
            """)
    List<Object[]> countByCountry(@Param("from") Instant from, @Param("to") Instant to);

    /** Registered-users report at platform level, grouped by month (UTC). */
    @Query(value = """
            select to_char(date_trunc('month', created_at at time zone 'UTC'), 'YYYY-MM') as bucket,
                   count(*) as total
            from users
            where created_at >= :from and created_at < :to
            group by bucket
            order by bucket
            """, nativeQuery = true)
    List<Object[]> countByMonth(@Param("from") Instant from, @Param("to") Instant to);

    long countByCreatedAtBetween(Instant from, Instant to);
}
