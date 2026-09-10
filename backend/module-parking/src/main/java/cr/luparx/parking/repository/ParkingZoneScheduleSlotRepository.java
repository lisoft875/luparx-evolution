package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingZoneScheduleSlot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/** The bands of a zone that keeps its own timetable. */
public interface ParkingZoneScheduleSlotRepository extends JpaRepository<ParkingZoneScheduleSlot, UUID> {

    List<ParkingZoneScheduleSlot> findByZoneIdOrderByWeekdayAscStartMinuteAsc(UUID zoneId);

    void deleteByZoneId(UUID zoneId);
}
