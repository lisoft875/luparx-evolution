package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingZoneSchedule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Zones that keep a timetable of their own. No row means the zone uses the municipality's. */
public interface ParkingZoneScheduleRepository extends JpaRepository<ParkingZoneSchedule, UUID> {

    Optional<ParkingZoneSchedule> findByTenantIdAndZoneId(UUID tenantId, UUID zoneId);

    List<ParkingZoneSchedule> findByTenantIdAndZoneIdIn(UUID tenantId, Collection<UUID> zoneIds);
}
