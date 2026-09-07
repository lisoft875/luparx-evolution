package cr.luparx.app.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

/**
 * Audit queries. The tenant-scoped variant takes a non-null {@code tenantId}; the platform variant is
 * a separate, explicitly named method so that "read every tenant's audit trail" can never happen by
 * forgetting a parameter.
 */
public interface AuditEventRepository extends JpaRepository<AuditEventEntity, UUID> {

    @Query("""
            select a from AuditEventEntity a
            where a.tenantId = :tenantId
              and (:actor is null or a.actorUserId = :actor)
              and (:action is null or a.action = :action)
              and a.occurredAt >= :from and a.occurredAt < :to
            order by a.occurredAt desc
            """)
    Page<AuditEventEntity> searchInTenant(@Param("tenantId") UUID tenantId,
                                          @Param("actor") UUID actor,
                                          @Param("action") String action,
                                          @Param("from") Instant from,
                                          @Param("to") Instant to,
                                          Pageable pageable);

    @Query("""
            select a from AuditEventEntity a
            where (:tenantId is null or a.tenantId = :tenantId)
              and (:actor is null or a.actorUserId = :actor)
              and (:action is null or a.action = :action)
              and a.occurredAt >= :from and a.occurredAt < :to
            order by a.occurredAt desc
            """)
    Page<AuditEventEntity> searchGlobal(@Param("tenantId") UUID tenantId,
                                        @Param("actor") UUID actor,
                                        @Param("action") String action,
                                        @Param("from") Instant from,
                                        @Param("to") Instant to,
                                        Pageable pageable);
}
