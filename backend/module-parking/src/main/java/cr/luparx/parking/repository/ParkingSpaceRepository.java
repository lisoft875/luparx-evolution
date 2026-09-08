package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingSpace;
import cr.luparx.parking.model.ParkingSpaceStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * Bays of one municipality. A municipality has thousands of them, so every read here is either
 * narrowed to a single code or paginated — never an unbounded scan (CONTRACT.md §7).
 *
 * <p>{@link #findByTenantIdAndCode} is the lookup the citizen flow uses: the person types the code
 * painted on the bay, not an internal identifier.</p>
 */
public interface ParkingSpaceRepository extends JpaRepository<ParkingSpace, UUID> {

    Optional<ParkingSpace> findByTenantIdAndCode(UUID tenantId, String code);

    Optional<ParkingSpace> findByTenantIdAndId(UUID tenantId, UUID id);

    Page<ParkingSpace> findByTenantIdAndZoneIdOrderByCodeAsc(UUID tenantId, UUID zoneId, Pageable pageable);

    Page<ParkingSpace> findByTenantIdOrderByCodeAsc(UUID tenantId, Pageable pageable);

    long countByTenantId(UUID tenantId);

    long countByTenantIdAndZoneId(UUID tenantId, UUID zoneId);

    long countByTenantIdAndStatus(UUID tenantId, ParkingSpaceStatus status);
}
