package cr.luparx.tenancy.repository;

import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.model.TenantStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TenantRepository extends JpaRepository<Tenant, UUID> {

    Optional<Tenant> findBySlug(String slug);

    boolean existsBySlug(String slug);

    List<Tenant> findByStatusAndCountryCodeOrderByDisplayNameAsc(TenantStatus status, String countryCode);

    List<Tenant> findByStatusOrderByDisplayNameAsc(TenantStatus status);

    /**
     * Platform back-office search. Tenants are the one entity a PLATFORM_ADMIN legitimately lists
     * across the whole platform, which is why this query has no tenant filter.
     */
    @Query("""
            select t from Tenant t
            where (:status is null or t.status = :status)
              and (:countryCode is null or t.countryCode = :countryCode)
              and (:term is null or lower(t.displayName) like :term or lower(t.legalName) like :term
                   or lower(t.slug) like :term)
            """)
    Page<Tenant> search(@Param("term") String term,
                        @Param("status") TenantStatus status,
                        @Param("countryCode") String countryCode,
                        Pageable pageable);
}
