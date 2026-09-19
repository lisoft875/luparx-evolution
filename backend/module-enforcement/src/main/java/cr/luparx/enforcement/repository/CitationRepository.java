package cr.luparx.enforcement.repository;

import cr.luparx.enforcement.entity.Citation;
import cr.luparx.enforcement.model.CitationStatus;
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
 * Citations of one municipality.
 *
 * <p>Every method starts with {@code tenantId} and there is no query that omits it — not even for the
 * platform back office, which would have to add one explicitly and name it for what it is. An
 * inspector of Cartago must not be able to reach a citation of San José by guessing an identifier,
 * and the surest way to guarantee that is for the query that could do it not to exist.</p>
 *
 * <p>Every listing is paginated. Citations are the collection in this platform that grows without
 * bound — one municipality writes thousands a month — so an unpaginated read here would be a table
 * scan that gets slower exactly as the product succeeds (CONTRACT.md §4).</p>
 */
public interface CitationRepository extends JpaRepository<Citation, UUID> {

    /**
     * Which of these lookups ended in a citation (v0.29).
     *
     * <p>One query for a whole page of the activity screen, rather than a join on the log itself: the
     * fiscalisation log is the platform's largest table and the vast majority of its rows never
     * produce a citation, so the join would carry the cost of the exception on every row of the rule.</p>
     */
    @Query("select c.enforcementCheckId from Citation c "
            + "where c.tenantId = :tenantId and c.enforcementCheckId in :checkIds")
    List<UUID> findCheckIdsWithCitation(@Param("tenantId") UUID tenantId,
                                        @Param("checkIds") Collection<UUID> checkIds);

    Optional<Citation> findByTenantIdAndId(UUID tenantId, UUID id);

    Optional<Citation> findByTenantIdAndNumber(UUID tenantId, String number);

    /**
     * The device's own identifier for a capture. This is what makes an offline resend idempotent
     * even when the retry carries a brand-new {@code Idempotency-Key} — a reinstalled app, a queue
     * flushed by a different process — because the identity of the act comes from the device, not
     * from the transport.
     */
    Optional<Citation> findByTenantIdAndDeviceCitationId(UUID tenantId, String deviceCitationId);

    /**
     * A mirrored citation by its identity in the system it came from (CONTRACT.md v0.34).
     *
     * <p>The idempotency of the ingest. The other system's identifier is what makes an act the same
     * act, so a retry after a timeout, a nightly re-send of the whole open ledger, or two instances
     * receiving the same push all resolve here — and the unique index behind it is what settles the
     * race the lookup alone cannot.</p>
     */
    Optional<Citation> findByTenantIdAndSourceSystemAndExternalId(UUID tenantId, String sourceSystem,
                                                                  String externalId);

    /**
     * Mirrored citations whose causal came in with a code the catalogue did not know, for one system.
     *
     * <p>What the mapping backfill walks. Bounded by a page, because a municipality that switches on
     * the mirror for the first time imports its whole open ledger and mapping one code could touch
     * thousands of rows — a backfill that took them all in one transaction would be the first thing
     * to time out on the day the feature is demonstrated.</p>
     */
    @Query("""
            select c from Citation c
            where c.tenantId = :tenantId and c.sourceSystem = :sourceSystem
              and c.infractionCode = :externalCode and c.infractionTypeId is null
            """)
    Page<Citation> findUnmappedByCode(@Param("tenantId") UUID tenantId,
                                      @Param("sourceSystem") String sourceSystem,
                                      @Param("externalCode") String externalCode,
                                      Pageable pageable);

    /**
     * The distinct causals that arrived from one system and are not mapped yet, with how many
     * citations each one carries.
     *
     * <p>The screen an administrator opens to do the mapping. Ordered by volume, because the code
     * that appears on four hundred citations is the one worth mapping first and a list ordered
     * alphabetically buries it.</p>
     */
    @Query("""
            select c.sourceSystem, c.infractionCode, min(c.infractionName), count(c)
            from Citation c
            where c.tenantId = :tenantId and c.source = cr.luparx.enforcement.model.CitationSource.EXTERNAL
              and c.infractionTypeId is null
            group by c.sourceSystem, c.infractionCode
            order by count(c) desc
            """)
    List<Object[]> findUnmappedCausals(@Param("tenantId") UUID tenantId, Pageable pageable);

    /** The officer's own work, newest first: what their app opens on. */
    Page<Citation> findByTenantIdAndInspectorUserIdOrderByOccurredAtDesc(UUID tenantId, UUID inspectorUserId,
                                                                        Pageable pageable);

    /**
     * The administration's filtered search. Null means "no filter" for every criterion, which keeps
     * one query where a Specification tree would otherwise breed five that drift apart. The plate is
     * matched on its normalised form so that {@code sjp-123} and {@code SJP123} are the same search.
     *
     * <p>The two dates are the exception: they are <b>always bound</b>, because PostgreSQL cannot
     * infer the type of a parameter that appears only in {@code ? is null} and refuses the statement
     * outright ({@code could not determine data type}). The service passes an open lower and upper
     * bound when the caller gave none, which is the same query with a range that excludes nothing —
     * and is honest about what "no filter" means over a column that is indexed by time.</p>
     */
    @Query("""
            select c from Citation c
            where c.tenantId = :tenantId
              and (:status is null or c.status = :status)
              and (:zoneId is null or c.zoneId = :zoneId)
              and (:inspectorUserId is null or c.inspectorUserId = :inspectorUserId)
              and (:plateNormalized is null or c.plateNormalized = :plateNormalized)
              and c.occurredAt >= :from
              and c.occurredAt < :to
            order by c.occurredAt desc
            """)
    Page<Citation> search(@Param("tenantId") UUID tenantId,
                          @Param("status") CitationStatus status,
                          @Param("zoneId") UUID zoneId,
                          @Param("inspectorUserId") UUID inspectorUserId,
                          @Param("plateNormalized") String plateNormalized,
                          @Param("from") Instant from,
                          @Param("to") Instant to,
                          Pageable pageable);

    /**
     * Las multas del ciudadano: las vinculadas a un vehículo suyo <b>o</b> las que llevan una placa
     * que tiene en ficha.
     *
     * <p>Hasta el 2026-09-19 era sólo lo primero, con este argumento: las placas son únicas por
     * ciudadano y no globalmente, así que «toda boleta con una placa que escribí en mi garaje»
     * dejaría ver las multas de otro a quien registre una placa ajena. El riesgo es real y sigue
     * ahí; lo que cambió es entender que el caso normal <em>también</em> es real: un carro familiar
     * que padre e hijo tienen cada uno en su aplicación para pagar sus propios estacionamientos.
     * Negarles la boleta a los dos —que es lo que pasaba— no protegía a nadie: la boleta existe, el
     * plazo de descuento corre, y ninguno se enteraba.</p>
     *
     * <p>La fuga se ataja en <b>qué se muestra</b> y no en <b>si se muestra</b>: una boleta que
     * llegó por placa y no por vínculo se entrega sin fotografías, sin dirección y sin coordenadas
     * (ver {@code EnforcementMapper.toFines} y {@code CitizenFinesController.detailOf}). Quien
     * registre una placa ajena verá que existe una boleta y su monto —lo mismo que ve cualquiera
     * que mire el parabrisas— pero no dónde estaba el carro ni las fotos de quien lo conducía.</p>
     *
     * <p>Pagar y apelar siguen siendo del ACTO y no de la persona: el estado de la boleta es uno
     * solo, así que el segundo pago choca con {@code CITATION_NOT_PAYABLE} y la segunda apelación
     * con {@code APPEAL_ALREADY_FILED}. Si uno paga, queda pagada para los dos.</p>
     *
     * <p>Los borradores se excluyen: lo que todavía no es acto administrativo no es deuda de nadie.</p>
     */
    @Query("""
            select c from Citation c
            where c.tenantId = :tenantId
              and (c.vehicleId in :vehicleIds or c.plateNormalized in :plates)
              and c.status <> cr.luparx.enforcement.model.CitationStatus.DRAFT
              and (:status is null or c.status = :status)
            order by c.issuedAt desc
            """)
    Page<Citation> findForVehicles(@Param("tenantId") UUID tenantId,
                                   @Param("vehicleIds") Collection<UUID> vehicleIds,
                                   @Param("plates") Collection<String> plates,
                                   @Param("status") CitationStatus status,
                                   Pageable pageable);

    /** Una multa del ciudadano, con el mismo criterio que el listado: vínculo o placa en ficha. */
    @Query("""
            select c from Citation c
            where c.tenantId = :tenantId
              and c.id = :id
              and (c.vehicleId in :vehicleIds or c.plateNormalized in :plates)
              and c.status <> cr.luparx.enforcement.model.CitationStatus.DRAFT
            """)
    Optional<Citation> findForVehicle(@Param("tenantId") UUID tenantId,
                                      @Param("id") UUID id,
                                      @Param("vehicleIds") Collection<UUID> vehicleIds,
                                      @Param("plates") Collection<String> plates);

    /** Overdue citations, for the job that moves them to EXPIRED in bulk. Bounded by the page. */
    @Query("""
            select c from Citation c
            where c.tenantId = :tenantId
              and c.status = cr.luparx.enforcement.model.CitationStatus.ISSUED
              and c.dueAt is not null and c.dueAt < :now
            order by c.dueAt asc
            """)
    List<Citation> findOverdue(@Param("tenantId") UUID tenantId, @Param("now") Instant now, Pageable pageable);

    long countByTenantId(UUID tenantId);

    long countByTenantIdAndStatus(UUID tenantId, CitationStatus status);

    /**
     * Citations of a period grouped by state, with what they are worth (CONTRACT.md v0.36).
     *
     * <p>By {@code occurredAt} and not {@code issuedAt}: a citation raised on the street on Monday
     * and emitted out of the offline queue on Tuesday belongs to Monday, which is the day the
     * municipality is asking about when it asks what happened on Monday.</p>
     */
    @Query("""
            select c.status, count(c), coalesce(sum(c.fineAmountMinor), 0)
            from Citation c
            where c.tenantId = :tenantId and c.occurredAt >= :from and c.occurredAt < :to
            group by c.status
            """)
    List<Object[]> countByStatusIn(@Param("tenantId") UUID tenantId,
                                   @Param("from") Instant from,
                                   @Param("to") Instant to);

    /** How many citations each officer raised in a period. Null actor: mirrored from another system. */
    @Query("""
            select c.inspectorUserId, count(c)
            from Citation c
            where c.tenantId = :tenantId and c.occurredAt >= :from and c.occurredAt < :to
              and c.inspectorUserId is not null
            group by c.inspectorUserId
            """)
    List<Object[]> countByInspector(@Param("tenantId") UUID tenantId,
                                    @Param("from") Instant from,
                                    @Param("to") Instant to);
}
