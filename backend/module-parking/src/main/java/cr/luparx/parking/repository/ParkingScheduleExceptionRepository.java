package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingScheduleException;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Dated exceptions of one municipality.
 *
 * <p>The pricing path reads them {@link #findByTenantIdAndExceptionDateBetweenOrderByExceptionDateAsc
 * by date range} and never as a whole table: a stay spans a few days and a "next charging band" scan
 * looks a bounded number of days ahead, so neither query grows with how many years of holidays the
 * municipality has recorded (CONTRACT.md §7 — no unbounded scans on a normal endpoint).</p>
 */
public interface ParkingScheduleExceptionRepository extends JpaRepository<ParkingScheduleException, UUID> {

    List<ParkingScheduleException> findByTenantIdAndExceptionDateBetweenOrderByExceptionDateAsc(
            UUID tenantId, LocalDate from, LocalDate to);

    List<ParkingScheduleException> findByTenantIdOrderByExceptionDateAsc(UUID tenantId);

    long deleteByTenantId(UUID tenantId);
}
