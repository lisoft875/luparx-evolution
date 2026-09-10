package cr.luparx.billing.repository;

import cr.luparx.billing.entity.Payment;
import cr.luparx.billing.model.PaymentState;
import cr.luparx.billing.model.ReconciliationStatus;
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
 * Payments of one municipality.
 *
 * <p>Every method starts with {@code tenantId} and there is none that omits it. Money is the one
 * place where a missing tenant filter is not a leak of information but a leak of somebody's income.</p>
 */
public interface PaymentRepository extends JpaRepository<Payment, UUID> {

    Optional<Payment> findByTenantIdAndId(UUID tenantId, UUID id);

    /** The idempotency of the request, before the provider has assigned its own reference. */
    Optional<Payment> findByTenantIdAndIdempotencyKey(UUID tenantId, String idempotencyKey);

    /** The idempotency of the provider: same reference, same payment. */
    Optional<Payment> findByTenantIdAndProviderAndProviderReference(UUID tenantId, String provider,
                                                                    String providerReference);

    /** What the reconciliation matches a statement's lines against, in one query per statement. */
    @Query("""
            select p from Payment p
            where p.tenantId = :tenantId and p.provider = :provider
              and p.providerReference in :references
            """)
    List<Payment> findByProviderReferences(@Param("tenantId") UUID tenantId,
                                           @Param("provider") String provider,
                                           @Param("references") Collection<String> references);

    /**
     * Captured inside a period and not covered by any statement.
     *
     * <p>The query the whole module exists for: money the municipality charged and has not been
     * paid. {@code NOT_APPLICABLE} is excluded rather than filtered in the caller — cash at the
     * counter is never going to appear in a provider's statement, and a list that included it would
     * be a permanent alarm about something that is not a problem.</p>
     */
    @Query("""
            select p from Payment p
            where p.tenantId = :tenantId and p.status = :captured
              and p.reconciliationStatus in :pending
              and p.confirmedAt >= :from and p.confirmedAt < :to
            order by p.confirmedAt asc
            """)
    List<Payment> findUnsettled(@Param("tenantId") UUID tenantId,
                                @Param("captured") PaymentState captured,
                                @Param("pending") Collection<ReconciliationStatus> pending,
                                @Param("from") Instant from,
                                @Param("to") Instant to,
                                Pageable pageable);

    /** The treasurer's listing: everything in a period, whatever became of it. */
    @Query("""
            select p from Payment p
            where p.tenantId = :tenantId
              and (:status is null or p.status = :status)
              and (:reconciliation is null or p.reconciliationStatus = :reconciliation)
              and p.requestedAt >= :from and p.requestedAt < :to
            order by p.requestedAt desc
            """)
    Page<Payment> search(@Param("tenantId") UUID tenantId,
                         @Param("status") PaymentState status,
                         @Param("reconciliation") ReconciliationStatus reconciliation,
                         @Param("from") Instant from,
                         @Param("to") Instant to,
                         Pageable pageable);

    /**
     * The totals of a period, by state.
     *
     * <p>Summed in the database and not by walking the page: a municipality's month is tens of
     * thousands of rows, and a total computed from one page of them would be a number that looks
     * right and is not.</p>
     */
    @Query("""
            select p.status, p.reconciliationStatus, count(p), coalesce(sum(p.grossAmountMinor), 0),
                   coalesce(sum(p.netAmountMinor), 0)
            from Payment p
            where p.tenantId = :tenantId and p.requestedAt >= :from and p.requestedAt < :to
            group by p.status, p.reconciliationStatus
            """)
    List<Object[]> summarise(@Param("tenantId") UUID tenantId,
                             @Param("from") Instant from,
                             @Param("to") Instant to);
}
