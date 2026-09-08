package cr.luparx.parking.entity;

import cr.luparx.parking.model.ChargingBand;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.DayOfWeek;
import java.time.Instant;
import java.util.UUID;

/**
 * One charging band of one weekday ({@code parking_schedule_slots}, V12_0).
 *
 * <p>{@code weekday} is the ISO-8601 number ({@code 1} Monday … {@code 7} Sunday), the same one
 * {@link DayOfWeek#getValue()} uses, so the column and the enum never need a translation table. A
 * weekday with no row is a day this municipality does not charge — by default, Sunday.</p>
 *
 * <p>The band is stored as local minutes from midnight; see {@link ChargingBand} for why that is not
 * a pair of {@code time} columns.</p>
 */
@Entity
@Table(name = "parking_schedule_slots")
public class ParkingScheduleSlot {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "weekday", nullable = false)
    private short weekday;

    @Column(name = "start_minute", nullable = false)
    private int startMinute;

    @Column(name = "end_minute", nullable = false)
    private int endMinute;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected ParkingScheduleSlot() {
        // for JPA
    }

    public ParkingScheduleSlot(UUID id, UUID tenantId, DayOfWeek weekday, ChargingBand band, Instant createdAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.weekday = (short) weekday.getValue();
        this.startMinute = band.startMinute();
        this.endMinute = band.endMinute();
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public DayOfWeek weekday() {
        return DayOfWeek.of(weekday);
    }

    public ChargingBand band() {
        return new ChargingBand(startMinute, endMinute);
    }

    public int getStartMinute() {
        return startMinute;
    }

    public int getEndMinute() {
        return endMinute;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
