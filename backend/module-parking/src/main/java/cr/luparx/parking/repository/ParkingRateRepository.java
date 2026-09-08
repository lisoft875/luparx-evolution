package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingRate;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/** Tariffs of one municipality, always read through its tenant (docs/ARCHITECTURE.md §4). */
public interface ParkingRateRepository extends JpaRepository<ParkingRate, UUID> {

    List<ParkingRate> findByTenantIdAndZoneIdOrderByValidFromDesc(UUID tenantId, UUID zoneId);

    long countByTenantId(UUID tenantId);

    long countByTenantIdAndZoneId(UUID tenantId, UUID zoneId);
}
