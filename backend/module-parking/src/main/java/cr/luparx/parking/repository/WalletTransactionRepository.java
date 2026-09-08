package cr.luparx.parking.repository;

import cr.luparx.parking.entity.WalletTransaction;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * The wallet ledger. Paginated by contract: a citizen who parks daily accumulates movements without
 * limit, so "their movements" is never an unbounded read.
 */
public interface WalletTransactionRepository extends JpaRepository<WalletTransaction, UUID> {

    Page<WalletTransaction> findByTenantIdAndUserIdOrderByCreatedAtDesc(UUID tenantId, UUID userId,
                                                                        Pageable pageable);

    List<WalletTransaction> findBySessionIdOrderByCreatedAtAsc(UUID sessionId);
}
