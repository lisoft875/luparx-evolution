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
 * One charging band of one weekday, for a zone that keeps its own timetable
 * ({@code parking_zone_schedule_slots}, V30_0).
 *
 * <p>The same shape as {@link ParkingScheduleSlot} and deliberately a separate table rather than a
 * nullable {@code zone_id} on that one: the municipality's bands and a zone's bands are read by
 * different queries on different paths, and a nullable discriminator would make every existing query
 * silently wrong the moment the first zone departed.</p>
 */
@Entity
@Table(name = "parking_zone_schedule_slots")
public class ParkingZoneScheduleSlot {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "zone_id", nullable = false)
    private UUID zoneId;

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

    protected ParkingZoneScheduleSlot() {
        // for JPA
    }

    public ParkingZoneScheduleSlot(UUID id, UUID zoneId, UUID tenantId, DayOfWeek weekday, ChargingBand band,
                                   Instant createdAt) {
        this.id = id;
        this.zoneId = zoneId;
        this.tenantId = tenantId;
        this.weekday = (short) weekday.getValue();
        this.startMinute = band.startMinute();
        this.endMinute = band.endMinute();
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getZoneId() {
        return zoneId;
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
