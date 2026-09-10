package cr.luparx.billing.repository;

import cr.luparx.billing.entity.Settlement;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/** Provider statements of one municipality. */
public interface SettlementRepository extends JpaRepository<Settlement, UUID> {

    Optional<Settlement> findByTenantIdAndId(UUID tenantId, UUID id);

    /** The identity of the document: importing the same statement twice must not create a second. */
    Optional<Settlement> findByTenantIdAndProviderAndExternalReference(UUID tenantId, String provider,
                                                                       String externalReference);

    Page<Settlement> findByTenantIdOrderByPeriodEndDesc(UUID tenantId, Pageable pageable);
}
