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

    Optional<Citation> findByTenantIdAndId(UUID tenantId, UUID id);

    Optional<Citation> findByTenantIdAndNumber(UUID tenantId, String number);

    /**
     * The device's own identifier for a capture. This is what makes an offline resend idempotent
     * even when the retry carries a brand-new {@code Idempotency-Key} — a reinstalled app, a queue
     * flushed by a different process — because the identity of the act comes from the device, not
     * from the transport.
     */
    Optional<Citation> findByTenantIdAndDeviceCitationId(UUID tenantId, String deviceCitationId);

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
     * The citizen's fines: only citations linked to a vehicle they registered, never a match on the
     * plate alone. Plates are unique per citizen and not globally, so "every citation for a plate I
     * typed into my garage" would show one person another person's fines — a leak that anybody could
     * trigger by registering a plate they do not own (CONTRACT.md v0.6, "Multas del ciudadano").
     * Drafts are excluded: what is not yet an administrative act is not yet anybody's debt.
     */
    @Query("""
            select c from Citation c
            where c.tenantId = :tenantId
              and c.vehicleId in :vehicleIds
              and c.status <> cr.luparx.enforcement.model.CitationStatus.DRAFT
              and (:status is null or c.status = :status)
            order by c.issuedAt desc
            """)
    Page<Citation> findForVehicles(@Param("tenantId") UUID tenantId,
                                   @Param("vehicleIds") Collection<UUID> vehicleIds,
                                   @Param("status") CitationStatus status,
                                   Pageable pageable);

    /** One fine of one citizen, narrowed by their own vehicles for the same reason as the listing. */
    @Query("""
            select c from Citation c
            where c.tenantId = :tenantId
              and c.id = :id
              and c.vehicleId in :vehicleIds
              and c.status <> cr.luparx.enforcement.model.CitationStatus.DRAFT
            """)
    Optional<Citation> findForVehicle(@Param("tenantId") UUID tenantId,
                                      @Param("id") UUID id,
                                      @Param("vehicleIds") Collection<UUID> vehicleIds);

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
}
