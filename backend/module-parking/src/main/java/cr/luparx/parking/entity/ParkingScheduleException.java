package cr.luparx.parking.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
 */
@Entity
@Table(name = "parking_schedule_exceptions")
public class ParkingScheduleException {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "exception_date", nullable = false)
    private LocalDate exceptionDate;

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

    public ParkingScheduleException(UUID id, UUID tenantId, LocalDate exceptionDate, boolean charges,
                                    boolean chargesAllDay, String label, Instant createdAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.exceptionDate = exceptionDate;
        this.charges = charges;
        this.chargesAllDay = chargesAllDay;
        this.label = label;
        this.createdAt = createdAt;
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
