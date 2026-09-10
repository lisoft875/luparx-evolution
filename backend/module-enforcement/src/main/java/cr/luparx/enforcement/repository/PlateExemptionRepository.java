package cr.luparx.enforcement.repository;

import cr.luparx.enforcement.entity.PlateExemption;
import cr.luparx.enforcement.model.ExemptionStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

/** Exemptions of one municipality. Every method is narrowed by tenant, without exception. */
public interface PlateExemptionRepository extends JpaRepository<PlateExemption, UUID> {

    /**
     * The live exemption for this plate, if any. At most one exists — a partial unique index says so
     * — and whether it exempts <em>now</em> is decided by the caller against its window.
     */
    Optional<PlateExemption> findByTenantIdAndPlateAndStatus(UUID tenantId, String plate, ExemptionStatus status);

    Optional<PlateExemption> findByIdAndTenantId(UUID id, UUID tenantId);

    /**
     * The register, newest first, optionally narrowed by state and by a plate fragment.
     *
     * <p>The plate search here <em>is</em> a partial match, unlike the person lookup of v0.26, and the
     * difference is not an inconsistency: this reads a list the municipality itself wrote, about
     * vehicles it exempted, and an officer at the desk types the three characters they remember.
     * Nothing here reaches outside the municipality.</p>
     */
    @Query("""
            select e from PlateExemption e
            where e.tenantId = :tenantId
              and (:status is null or e.status = :status)
              and (:plate is null or e.plate like :plate)
            order by e.grantedAt desc
            """)
    Page<PlateExemption> search(@Param("tenantId") UUID tenantId,
                                @Param("status") ExemptionStatus status,
                                @Param("plate") String plate,
                                Pageable pageable);
}
