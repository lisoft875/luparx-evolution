package cr.luparx.enforcement.repository;

import cr.luparx.enforcement.entity.EnforcementCheck;
import cr.luparx.enforcement.model.PlateVerdict;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

/**
 * The fiscalisation log. Every read is narrowed by tenant; there is deliberately no method that
 * returns checks across municipalities.
 */
public interface EnforcementCheckRepository extends JpaRepository<EnforcementCheck, UUID> {

    /**
     * The activity screen: what was consulted, by whom, where and with what result.
     *
     * <p>Every criterion is applied in the database. This table is the largest the platform will
     * have — hundreds of rows per officer per shift — so a filter resolved in memory would be a
     * table scan wearing a costume, and would get slower every single day.</p>
     */
    @Query("""
            select c from EnforcementCheck c
            where c.tenantId = :tenantId
              and (:inspector is null or c.inspectorUserId = :inspector)
              and (:zoneId is null or c.zoneId = :zoneId)
              and (:plate is null or c.plate like :plate)
              and (:verdict is null or c.verdict = :verdict)
              and c.occurredAt >= :from and c.occurredAt < :to
            order by c.occurredAt desc
            """)
    Page<EnforcementCheck> search(@Param("tenantId") UUID tenantId,
                                  @Param("inspector") UUID inspector,
                                  @Param("zoneId") UUID zoneId,
                                  @Param("plate") String plate,
                                  @Param("verdict") PlateVerdict verdict,
                                  @Param("from") Instant from,
                                  @Param("to") Instant to,
                                  Pageable pageable);

    /**
     * Deletes one batch of checks older than the cutoff, and answers how many it removed.
     *
     * <p>In batches, not all at once. A single statement over a year of a busy municipality's
     * lookups takes a long lock on the table the officers are writing to right now, and the officer
     * in the street does not care that it is purge night. The caller loops until this returns less
     * than the batch size.</p>
     *
     * <p>Native, because JPQL has no {@code limit} on a bulk delete and a subquery on the primary key
     * is the portable way to express one.</p>
     */
    @Modifying
    @Query(value = """
            delete from enforcement_checks
            where id in (
                select id from enforcement_checks
                where occurred_at < :cutoff
                order by occurred_at
                limit :batchSize
            )
            """, nativeQuery = true)
    int deleteBatchOlderThan(@Param("cutoff") Instant cutoff, @Param("batchSize") int batchSize);

    /** How much is due for deletion, for the job to say something true in its audit entry. */
    long countByOccurredAtBefore(Instant cutoff);
}
