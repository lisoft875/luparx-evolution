package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingScheduleException;
import cr.luparx.parking.model.ExceptionRecurrence;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Exceptions to the weekly timetable of one municipality.
 *
 * <p>The pricing path reads them {@link #findForWindow by window} and never as a whole table: a stay
 * spans a few days and a "next charging band" scan looks a bounded number of days ahead, so the query
 * does not grow with how many years the municipality has been operating (CONTRACT.md §7 — no
 * unbounded scans on a normal endpoint).</p>
 *
 * <p>Since v0.31 that window query has two halves. Dated exceptions are still filtered by date. The
 * <b>recurring</b> ones cannot be: "the 15th of September, every year" has no date column to compare,
 * so they are all loaded and expanded in memory against the window. That is bounded by its own limit
 * on the write side — a municipality has a dozen holidays, not a thousand — and it is why that limit
 * is separate from the one on dated exceptions.</p>
 */
public interface ParkingScheduleExceptionRepository extends JpaRepository<ParkingScheduleException, UUID> {

    /**
     * Everything that could fall inside {@code [from, to]}: the dated exceptions that do, plus every
     * recurring rule, which is expanded by the caller.
     */
    @Query("""
            select e from ParkingScheduleException e
            where e.tenantId = :tenantId
              and (e.recurrence <> :once or (e.exceptionDate between :from and :to))
            """)
    List<ParkingScheduleException> findForWindow(@Param("tenantId") UUID tenantId,
                                                 @Param("once") ExceptionRecurrence.Kind once,
                                                 @Param("from") LocalDate from,
                                                 @Param("to") LocalDate to);

    /**
     * The whole list for the admin form: the recurring ones first, since they are the calendar a
     * municipality keeps, and the one-off dates after them.
     */
    @Query("""
            select e from ParkingScheduleException e
            where e.tenantId = :tenantId
            order by e.recurrence asc, e.month asc, e.day asc, e.easterOffsetDays asc, e.exceptionDate asc
            """)
    List<ParkingScheduleException> findAllForTenant(@Param("tenantId") UUID tenantId);

    /** How many recurring rules a municipality keeps; the pricing path loads every one of them. */
    long countByTenantIdAndRecurrenceNot(UUID tenantId, ExceptionRecurrence.Kind once);

    long deleteByTenantId(UUID tenantId);
}
