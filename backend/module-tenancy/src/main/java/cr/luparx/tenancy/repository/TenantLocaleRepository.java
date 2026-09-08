package cr.luparx.tenancy.repository;

import cr.luparx.tenancy.entity.TenantLocale;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Languages offered by a municipality. Every read is narrowed by tenant — a list of languages is
 * small, but "small" is not a reason to leave a tenant column out of the query
 * (docs/ARCHITECTURE.md §4).
 */
public interface TenantLocaleRepository extends JpaRepository<TenantLocale, UUID> {

    List<TenantLocale> findByTenantIdOrderBySortOrderAscLocaleAsc(UUID tenantId);

    List<TenantLocale> findByTenantIdAndEnabledTrueOrderBySortOrderAscLocaleAsc(UUID tenantId);

    Optional<TenantLocale> findByTenantIdAndLocale(UUID tenantId, String locale);

    long deleteByTenantId(UUID tenantId);
}
