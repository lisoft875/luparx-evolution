package cr.luparx.parking.repository;

import cr.luparx.parking.entity.WalletAccount;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

/** Wallets, always addressed by {@code (tenantId, userId)}: there is no global balance to read. */
public interface WalletAccountRepository extends JpaRepository<WalletAccount, UUID> {

    Optional<WalletAccount> findByTenantIdAndUserId(UUID tenantId, UUID userId);

    boolean existsByTenantIdAndUserId(UUID tenantId, UUID userId);

    /**
     * The same row, taken with a row lock, for the read-decide-write of a charge.
     *
     * <p>Optimistic locking alone would be wrong here: two concurrent charges would both read the
     * same balance, both find it sufficient, and one of them would fail at commit with a lock
     * exception the citizen sees as an error even though their money was there. A pessimistic lock
     * serialises them instead, and both succeed in order. It is held for the length of one short
     * transaction and taken in a fixed order (wallet after session), so it cannot deadlock against
     * itself.</p>
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from WalletAccount a where a.tenantId = :tenantId and a.userId = :userId")
    Optional<WalletAccount> lockByTenantIdAndUserId(@Param("tenantId") UUID tenantId,
                                                    @Param("userId") UUID userId);
}
