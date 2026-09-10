package cr.luparx.enforcement.repository;

import cr.luparx.enforcement.entity.ExemptionPlate;
import cr.luparx.enforcement.model.ExemptionStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The plates each permit covers.
 *
 * <p>This is what the officer's lookup reads: since v0.30 the truth about "is this plate exempt" lives
 * here and not on the parent's deprecated {@code plate} column.</p>
 */
public interface ExemptionPlateRepository extends JpaRepository<ExemptionPlate, ExemptionPlate.Id> {

    /**
     * The granted permit covering this plate in this municipality, if any.
     *
     * <p>At most one exists — {@code uq_exemption_plates_approved} says so in the database — and
     * whether it exempts <em>now</em> is decided by the caller against the parent's window.</p>
     */
    Optional<ExemptionPlate> findByTenantIdAndId_PlateAndStatus(UUID tenantId, String plate, ExemptionStatus status);

    List<ExemptionPlate> findById_ExemptionIdOrderByAddedAtAsc(UUID exemptionId);

    /** Every plate of a page of permits, so a list screen does not ask once per row. */
    List<ExemptionPlate> findById_ExemptionIdInOrderByAddedAtAsc(Collection<UUID> exemptionIds);

    Optional<ExemptionPlate> findByTenantIdAndId_ExemptionIdAndId_Plate(UUID tenantId, UUID exemptionId, String plate);

    long countById_ExemptionId(UUID exemptionId);
}
