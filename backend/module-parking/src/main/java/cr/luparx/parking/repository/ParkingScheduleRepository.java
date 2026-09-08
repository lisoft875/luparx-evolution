package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingSchedule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/** The timetable header, keyed by tenant. */
public interface ParkingScheduleRepository extends JpaRepository<ParkingSchedule, UUID> {
}
