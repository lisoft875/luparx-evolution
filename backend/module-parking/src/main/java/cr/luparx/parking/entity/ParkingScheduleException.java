package cr.luparx.parking.entity;

import cr.luparx.core.time.HolidayObservance;
import cr.luparx.parking.model.ExceptionRecurrence;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * A dated override of the weekly timetable ({@code parking_schedule_exceptions}, V12_0): a public
 * holiday that suspends charging, or a day charged on hours of its own.
 *
 * <p>{@code exceptionDate} is a LOCAL date in the municipality's zone, not an instant: "the 15th of
 * September" is the same date whatever the offset that day happens to be.</p>
 *
 * <p>Since v0.31 the row carries a <b>rule</b> rather than only a date (V30_0): one concrete date, a
 * day of the year, or a number of days from Easter Sunday. Storing the rule and not twenty years of
 * expanded dates keeps one decision in one row — and means the day a holiday law changes, nothing has
 * to be rewritten in rows that describe what was already charged. {@link #recurrence()} turns the
 * columns back into the value object that computes dates.</p>
 */
@Entity
@Table(name = "parking_schedule_exceptions")
public class ParkingScheduleException {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    /** Only for {@link ExceptionRecurrence.Kind#ONCE}; the other two compute their date per year. */
    @Column(name = "exception_date")
    private LocalDate exceptionDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "recurrence", nullable = false, length = 8)
    private ExceptionRecurrence.Kind recurrence;

    @Column(name = "month")
    private Short month;

    @Column(name = "day")
    private Short day;

    @Column(name = "easter_offset_days")
    private Short easterOffsetDays;

    @Enumerated(EnumType.STRING)
    @Column(name = "observance", nullable = false, length = 8)
    private HolidayObservance observance;

    /**
     * Which entry of the country's holiday catalogue this was copied from, when it was.
     *
     * <p>It exists so the screen can say "you already have this one" instead of offering it twice. It
     * is a <b>provenance</b> note and never a live link: once copied, the row is the municipality's
     * to edit or delete, because the calendar a canton charges by is the canton's answer to give.</p>
     */
    @Column(name = "holiday_code", length = 48)
    private String holidayCode;

    /** False — the usual case — means a holiday: nothing is charged that day. */
    @Column(name = "charges", nullable = false)
    private boolean charges;

    /** True means that one day is charged around the clock; its own bands are then ignored. */
    @Column(name = "charges_all_day", nullable = false)
    private boolean chargesAllDay;

    /** Tenant content ("Día de la Independencia"), never a translated label. */
    @Column(name = "label", length = 120)
    private String label;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected ParkingScheduleException() {
        // for JPA
    }

    public ParkingScheduleException(UUID id, UUID tenantId, ExceptionRecurrence recurrence, boolean charges,
                                    boolean chargesAllDay, String label, String holidayCode, Instant createdAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.recurrence = recurrence.kind();
        this.exceptionDate = recurrence.date();
        this.month = recurrence.month() == null ? null : Short.valueOf(recurrence.month().shortValue());
        this.day = recurrence.day() == null ? null : Short.valueOf(recurrence.day().shortValue());
        this.easterOffsetDays = recurrence.easterOffsetDays() == null
                ? null
                : Short.valueOf(recurrence.easterOffsetDays().shortValue());
        this.observance = recurrence.observance();
        this.charges = charges;
        this.chargesAllDay = chargesAllDay;
        this.label = label;
        this.holidayCode = holidayCode;
        this.createdAt = createdAt;
    }

    /** The rule this row states, as the value object that knows how to turn it into dates. */
    public ExceptionRecurrence recurrence() {
        return new ExceptionRecurrence(
                recurrence == null ? ExceptionRecurrence.Kind.ONCE : recurrence,
                exceptionDate,
                month == null ? null : Integer.valueOf(month.intValue()),
                day == null ? null : Integer.valueOf(day.intValue()),
                easterOffsetDays == null ? null : Integer.valueOf(easterOffsetDays.intValue()),
                observance == null ? HolidayObservance.EXACT : observance);
    }

    public ExceptionRecurrence.Kind getRecurrence() {
        return recurrence == null ? ExceptionRecurrence.Kind.ONCE : recurrence;
    }

    public Short getMonth() {
        return month;
    }

    public Short getDay() {
        return day;
    }

    public Short getEasterOffsetDays() {
        return easterOffsetDays;
    }

    public HolidayObservance getObservance() {
        return observance == null ? HolidayObservance.EXACT : observance;
    }

    public String getHolidayCode() {
        return holidayCode;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public LocalDate getExceptionDate() {
        return exceptionDate;
    }

    public boolean isCharges() {
        return charges;
    }

    public boolean isChargesAllDay() {
        return chargesAllDay;
    }

    public String getLabel() {
        return label;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
