package cr.luparx.billing.repository;

import cr.luparx.billing.entity.SettlementLine;
import cr.luparx.billing.model.LineMatchStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface SettlementLineRepository extends JpaRepository<SettlementLine, UUID> {

    List<SettlementLine> findByTenantIdAndSettlementIdOrderByProviderReferenceAsc(UUID tenantId,
                                                                                  UUID settlementId);

    /** Only what needs a person, for a screen that should show the exceptions and not the volume. */
    @Query("""
            select l from SettlementLine l
            where l.tenantId = :tenantId and l.settlementId = :settlementId
              and l.matchStatus <> :matched
            order by l.providerReference asc
            """)
    List<SettlementLine> findFindings(@Param("tenantId") UUID tenantId,
                                      @Param("settlementId") UUID settlementId,
                                      @Param("matched") LineMatchStatus matched);

    /** How many lines fell into each outcome, for the header of the reconciliation. */
    @Query("""
            select l.matchStatus, count(l), coalesce(sum(l.grossAmountMinor), 0)
            from SettlementLine l
            where l.tenantId = :tenantId and l.settlementId = :settlementId
            group by l.matchStatus
            """)
    List<Object[]> summariseByMatch(@Param("tenantId") UUID tenantId, @Param("settlementId") UUID settlementId);
}
