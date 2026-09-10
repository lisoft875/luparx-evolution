package cr.luparx.app.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Audit queries. The tenant-scoped variant takes a non-null {@code tenantId}; the platform variant is
 * a separate, explicitly named method so that "read every tenant's audit trail" can never happen by
 * forgetting a parameter.
 */
public interface AuditEventRepository extends JpaRepository<AuditEventEntity, UUID> {

    /**
     * @param ipHash restricts to the entries that came from one connection (CONTRACT.md v0.33). The
     *               <em>hash</em> and never an address: the caller obtains it from
     *               {@code POST /admin/audit-events/ip-fingerprint}, which is the only place an
     *               address is ever handled, and it is handled in a request body
     */
    @Query("""
            select a from AuditEventEntity a
            where a.tenantId = :tenantId
              and (:actor is null or a.actorUserId = :actor)
              and (:action is null or a.action = :action)
              and (:ipHash is null or a.ipHash = :ipHash)
              and a.occurredAt >= :from and a.occurredAt < :to
            order by a.occurredAt desc
            """)
    Page<AuditEventEntity> searchInTenant(@Param("tenantId") UUID tenantId,
                                          @Param("actor") UUID actor,
                                          @Param("action") String action,
                                          @Param("ipHash") String ipHash,
                                          @Param("from") Instant from,
                                          @Param("to") Instant to,
                                          Pageable pageable);

    /**
     * How many entries of this municipality came from one connection inside a window.
     *
     * <p>The answer to "was this address here at all", which is the question the probe endpoint is
     * really being asked. Counting is cheaper than fetching and, more to the point, a count can be
     * given to somebody who then decides whether to go and look — a zero ends the enquiry without
     * anybody reading a single entry.</p>
     *
     * <p>Written out rather than derived from the method name so the window is bounded exactly as
     * {@link #searchInTenant} bounds it: {@code >= from} and {@code < to}. A derived {@code Between}
     * is inclusive at both ends, and a count that disagreed with the list by one entry at a boundary
     * is precisely the sort of discrepancy that costs an afternoon on the one screen where a
     * discrepancy is alarming.</p>
     */
    @Query("""
            select count(a) from AuditEventEntity a
            where a.tenantId = :tenantId
              and a.ipHash = :ipHash
              and a.occurredAt >= :from and a.occurredAt < :to
            """)
    long countFromOrigin(@Param("tenantId") UUID tenantId,
                         @Param("ipHash") String ipHash,
                         @Param("from") Instant from,
                         @Param("to") Instant to);

    /**
     * How many times one actor performed one action recently.
     *
     * <p>This is what rate-limits the directory lookup, and the choice is deliberate: the counter is
     * the audit trail itself, so the limit cannot drift from the record, it holds across every
     * backend instance (an in-memory counter would be bypassed by spreading requests over replicas,
     * ARCHITECTURE.md §7), and there is no second table to keep. It rides
     * {@code ix_audit_events_actor_occurred}, which narrows to one person's recent events before the
     * action is compared.</p>
     */
    long countByActorUserIdAndActionAndOccurredAtAfter(UUID actorUserId, String action, Instant occurredAt);

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

    /**
     * Every entry of one chain inside a window, in the exact order the seal digests them
     * (CONTRACT.md v0.32).
     *
     * <p>{@code tenantKey} being the platform sentinel means "the entries with no municipality"; a
     * null cannot be compared with {@code =}, so the caller passes a flag rather than the service
     * building two queries that could drift apart.</p>
     *
     * <p>Ordered by {@code (occurredAt, id)} and never by insertion: two entries can share an instant,
     * and a digest whose order depends on how PostgreSQL happened to return the rows would fail to
     * verify on a replica for no reason at all.</p>
     */
    @Query("""
            select a from AuditEventEntity a
            where ((:platform = true and a.tenantId is null) or a.tenantId = :tenantId)
              and a.occurredAt >= :from and a.occurredAt < :to
            order by a.occurredAt asc, a.id asc
            """)
    List<AuditEventEntity> findForSeal(@Param("tenantId") UUID tenantId,
                                       @Param("platform") boolean platform,
                                       @Param("from") Instant from,
                                       @Param("to") Instant to);

    /** The oldest entry of a chain, which is where a chain that has none yet has to start. */
    @Query("""
            select min(a.occurredAt) from AuditEventEntity a
            where (:platform = true and a.tenantId is null) or a.tenantId = :tenantId
            """)
    Instant findEarliest(@Param("tenantId") UUID tenantId, @Param("platform") boolean platform);

    /** Every municipality that has written anything, so the sealing job knows which chains exist. */
    @Query("select distinct a.tenantId from AuditEventEntity a")
    List<UUID> findTenantsWithEvents();
}
