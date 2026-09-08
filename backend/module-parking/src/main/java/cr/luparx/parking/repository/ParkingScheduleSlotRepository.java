package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingScheduleSlot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * Charging bands of one municipality. Bounded by construction — at most a handful per weekday — and
 * always read for one tenant at a time (docs/ARCHITECTURE.md §4).
 */
public interface ParkingScheduleSlotRepository extends JpaRepository<ParkingScheduleSlot, UUID> {

    List<ParkingScheduleSlot> findByTenantIdOrderByWeekdayAscStartMinuteAsc(UUID tenantId);

    long deleteByTenantId(UUID tenantId);
}
