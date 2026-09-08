package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingZone;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Zones of one municipality. Every method takes {@code tenantId} as a mandatory first parameter
 * (docs/ARCHITECTURE.md §4): there is deliberately no "list every zone" read, because a query
 * without a tenant is how cross-tenant data escapes.
 */
public interface ParkingZoneRepository extends JpaRepository<ParkingZone, UUID> {

    List<ParkingZone> findByTenantIdOrderByCodeAsc(UUID tenantId);

    List<ParkingZone> findByTenantIdAndActiveTrueOrderByCodeAsc(UUID tenantId);

    Optional<ParkingZone> findByTenantIdAndCode(UUID tenantId, String code);

    Optional<ParkingZone> findByTenantIdAndId(UUID tenantId, UUID id);

    long countByTenantId(UUID tenantId);
}
