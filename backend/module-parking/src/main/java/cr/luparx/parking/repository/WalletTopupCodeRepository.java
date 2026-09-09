package cr.luparx.parking.repository;

import cr.luparx.parking.entity.WalletTopupCode;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * Top-up codes. Both reads are scoped to a municipality: the same code may legitimately exist in two
 * municipalities, and a till only ever resolves codes of the one it belongs to.
 */
public interface WalletTopupCodeRepository extends JpaRepository<WalletTopupCode, UUID> {

    Optional<WalletTopupCode> findByTenantIdAndUserId(UUID tenantId, UUID userId);

    Optional<WalletTopupCode> findByTenantIdAndCode(UUID tenantId, String code);

    boolean existsByTenantIdAndCode(UUID tenantId, String code);
}
