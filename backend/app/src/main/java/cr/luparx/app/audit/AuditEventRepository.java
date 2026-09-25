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
              and (:resourceType is null or a.resourceType = :resourceType)
              and (:ipHash is null or a.ipHash = :ipHash)
              and a.occurredAt >= :from and a.occurredAt < :to
            order by a.occurredAt desc
            """)
    Page<AuditEventEntity> searchInTenant(@Param("tenantId") UUID tenantId,
                                          @Param("actor") UUID actor,
                                          @Param("action") String action,
                                          @Param("resourceType") String resourceType,
                                          @Param("ipHash") String ipHash,
                                          @Param("from") Instant from,
                                          @Param("to") Instant to,
                                          Pageable pageable);

    /**
     * Lo mismo, y además acotado por un texto que quien consulta escribió.
     *
     * <h2>Por qué es una consulta APARTE y no un parámetro opcional de la de arriba</h2>
     *
     * <p>Porque lo fue durante unas horas del 25-09-2026 y tiró la pantalla entera. Con un
     * {@code (:q is null or …)} dentro de la consulta única, el caso «sin búsqueda» —que es el 99%
     * de las cargas— pasaba a depender de que Hibernate acertara el tipo SQL de un parámetro nulo
     * que sólo aparece dentro de un {@code concat}. No acertó: 500 en cada llamada, en las dos
     * municipalidades, y una bitácora vacía donde antes había ciento cincuenta entradas.</p>
     *
     * <p>Separarlas cuesta un método y compra dos cosas: el camino sin búsqueda vuelve a ser
     * exactamente la consulta que funcionó durante meses —una función nueva no puede romper lo que
     * no toca— y acá {@code :q} nunca es nulo, así que no hay nada que inferir.</p>
     *
     * @param prefijo  patrón ya armado para el identificador de recurso: {@code "<texto>%"}. Por
     *                 prefijo y no por contenido para que el índice sirva; un UUID pegado entero
     *                 —el caso real— acierta igual
     * @param contiene patrón para el código de acción: {@code "%<texto>%"}. Ahí sí por contenido,
     *                 porque la columna es corta y nadie se acuerda de si la acción empieza por
     *                 {@code MEMBERSHIP} o por {@code STAFF}
     */
    @Query("""
            select a from AuditEventEntity a
            where a.tenantId = :tenantId
              and (:actor is null or a.actorUserId = :actor)
              and (:action is null or a.action = :action)
              and (:resourceType is null or a.resourceType = :resourceType)
              and (:ipHash is null or a.ipHash = :ipHash)
              and a.occurredAt >= :from and a.occurredAt < :to
              and (lower(coalesce(a.resourceId, '')) like :prefijo
                   or lower(a.action) like :contiene)
            order by a.occurredAt desc
            """)
    Page<AuditEventEntity> searchInTenantMatching(@Param("tenantId") UUID tenantId,
                                                  @Param("actor") UUID actor,
                                                  @Param("action") String action,
                                                  @Param("resourceType") String resourceType,
                                                  @Param("ipHash") String ipHash,
                                                  @Param("from") Instant from,
                                                  @Param("to") Instant to,
                                                  @Param("prefijo") String prefijo,
                                                  @Param("contiene") String contiene,
                                                  Pageable pageable);

    /**
     * Everything this municipality's trail recorded about ONE record.
     *
     * <p>The §4 of the functional guide (24-09-2026) asks that from a modified tariff one can see who
     * changed it, when, and from what to what. The trail already stored all of it — every write in
     * {@code AdminParkingController} records {@code resourceType} and {@code resourceId}, and
     * {@code changes} carries the field-by-field before and after. What was missing was a way to ask
     * the question by record instead of by date, which is the only way somebody standing in front of
     * a tariff asks it.</p>
     *
     * <p>Not paginated and bounded by {@code Pageable} at the call site rather than by a date window:
     * a single record's history is short by nature, and the interesting entry is often the oldest
     * one — the change that started the argument — which a date window would be the first to hide.</p>
     */
    @Query("""
            select a from AuditEventEntity a
            where a.tenantId = :tenantId
              and a.resourceType = :resourceType
              and a.resourceId = :resourceId
            order by a.occurredAt desc
            """)
    List<AuditEventEntity> historyOfResource(@Param("tenantId") UUID tenantId,
                                             @Param("resourceType") String resourceType,
                                             @Param("resourceId") String resourceId,
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
