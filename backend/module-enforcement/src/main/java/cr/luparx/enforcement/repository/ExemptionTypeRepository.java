package cr.luparx.enforcement.repository;

import cr.luparx.enforcement.entity.ExemptionType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Permit categories of one municipality. Every method is narrowed by tenant, without exception. */
public interface ExemptionTypeRepository extends JpaRepository<ExemptionType, UUID> {

    List<ExemptionType> findByTenantIdOrderByNameAsc(UUID tenantId);

    List<ExemptionType> findByTenantIdAndActiveTrueOrderByNameAsc(UUID tenantId);

    Optional<ExemptionType> findByTenantIdAndId(UUID tenantId, UUID id);

    Optional<ExemptionType> findByTenantIdAndCode(UUID tenantId, String code);

    boolean existsByTenantId(UUID tenantId);
}
