package cr.luparx.enforcement.repository;

import cr.luparx.enforcement.entity.ExternalInfractionMapping;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Causal translations of one municipality (CONTRACT.md v0.34). */
public interface ExternalInfractionMappingRepository extends JpaRepository<ExternalInfractionMapping, UUID> {

    Optional<ExternalInfractionMapping> findByTenantIdAndSourceSystemAndExternalCode(
            UUID tenantId, String sourceSystem, String externalCode);

    Optional<ExternalInfractionMapping> findByTenantIdAndId(UUID tenantId, UUID id);

    /**
     * Every translation of one municipality.
     *
     * <p>Not paginated, and that is a considered exception to the rule on this module's other
     * listings: this is a configuration table with as many rows as the other system has causals —
     * dozens, and bounded by somebody typing them. Paginating it would make the ingest's warm cache
     * a page of an arbitrary order.</p>
     */
    List<ExternalInfractionMapping> findByTenantIdOrderBySourceSystemAscExternalCodeAsc(UUID tenantId);
}
