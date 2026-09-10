package cr.luparx.enforcement.repository;

import cr.luparx.enforcement.entity.PlateExemption;
import cr.luparx.enforcement.model.ExemptionStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.Optional;
import java.util.UUID;

/** Permits of one municipality. Every method is narrowed by tenant, without exception. */
public interface PlateExemptionRepository extends JpaRepository<PlateExemption, UUID> {

    Optional<PlateExemption> findByIdAndTenantId(UUID id, UUID tenantId);

    /**
     * The granted permit whose <b>deprecated</b> single-plate column matches.
     *
     * <p>Only the officer's lookup uses this, and only as a second attempt after {@code
     * exemption_plates} finds nothing. It exists because of the expansion phase itself (ADR 0010): an
     * instance older than V29_0 running alongside this one grants a permit by writing the parent
     * alone, and a lookup that read only the new child table would miss it — which means a fine
     * issued against a vehicle the municipality had already decided not to fine.</p>
     *
     * @deprecated since v0.30 — deleted in the contraction, together with the column it reads.
     */
    @Deprecated(since = "0.30")
    Optional<PlateExemption> findByTenantIdAndPlateAndStatusIn(UUID tenantId, String plate,
                                                              Collection<ExemptionStatus> statuses);

    /**
     * The register, newest first, optionally narrowed by state, category and a plate fragment.
     *
     * <p>The plate search here <em>is</em> a partial match, unlike the person lookup of v0.26, and the
     * difference is not an inconsistency: this reads a list the municipality itself wrote, about
     * vehicles it exempted, and an officer at the desk types the three characters they remember.
     * Nothing here reaches outside the municipality.</p>
     *
     * <p>Since v0.30 the fragment is matched against {@code exemption_plates} and not against the
     * parent's deprecated column, because a permit covers several plates and searching only the first
     * of them would hide the very row somebody is looking for. {@code exists} rather than a join, so a
     * permit whose two plates both match is still one row.</p>
     *
     * <p>Ordered by when it was <b>requested</b>: the queue an operator works through is the order the
     * requests arrived in, and a permit approved today may have been asked for last month.</p>
     */
    @Query("""
            select e from PlateExemption e
            where e.tenantId = :tenantId
              and (:status is null or e.status = :status)
              and (:typeId is null or e.exemptionTypeId = :typeId)
              and (:plate is null or exists (
                    select 1 from ExemptionPlate p
                    where p.id.exemptionId = e.id and p.id.plate like :plate))
            order by coalesce(e.requestedAt, e.grantedAt) desc
            """)
    Page<PlateExemption> search(@Param("tenantId") UUID tenantId,
                                @Param("status") ExemptionStatus status,
                                @Param("typeId") UUID typeId,
                                @Param("plate") String plate,
                                Pageable pageable);

    /** How many permits point at a category, so retiring one can say what it would leave behind. */
    long countByTenantIdAndExemptionTypeId(UUID tenantId, UUID exemptionTypeId);
}
