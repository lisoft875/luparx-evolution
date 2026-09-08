package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingScheduleExceptionSlot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * Bands belonging to dated exceptions. Loaded for the exceptions already in hand, in one query, so a
 * range of days never becomes one query per day.
 */
public interface ParkingScheduleExceptionSlotRepository extends JpaRepository<ParkingScheduleExceptionSlot, UUID> {

    List<ParkingScheduleExceptionSlot> findByExceptionIdInOrderByStartMinuteAsc(Collection<UUID> exceptionIds);

    long deleteByTenantId(UUID tenantId);
}
