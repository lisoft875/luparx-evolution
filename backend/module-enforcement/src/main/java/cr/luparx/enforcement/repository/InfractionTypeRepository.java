package cr.luparx.enforcement.repository;

import cr.luparx.enforcement.entity.InfractionType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The infraction catalogue of one municipality. Every read takes {@code tenantId} first
 * (docs/ARCHITECTURE.md §4): there is deliberately no "list every type", because a query without a
 * tenant is how one municipality's configuration ends up on another's screen.
 */
public interface InfractionTypeRepository extends JpaRepository<InfractionType, UUID> {

    List<InfractionType> findByTenantIdOrderBySortOrderAscCodeAsc(UUID tenantId);

    List<InfractionType> findByTenantIdAndActiveTrueOrderBySortOrderAscCodeAsc(UUID tenantId);

    Optional<InfractionType> findByTenantIdAndId(UUID tenantId, UUID id);

    Optional<InfractionType> findByTenantIdAndCode(UUID tenantId, String code);

    long countByTenantId(UUID tenantId);
}
