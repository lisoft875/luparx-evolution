package cr.luparx.parking.entity;

import cr.luparx.parking.model.ChargingBand;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * One band of a dated exception ({@code parking_schedule_exception_slots}, V12_0). An exception that
 * charges but declares no band of its own falls back to the weekday bands, which is what "we open as
 * usual" means.
 */
@Entity
@Table(name = "parking_schedule_exception_slots")
public class ParkingScheduleExceptionSlot {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "exception_id", nullable = false)
    private UUID exceptionId;

    @Column(name = "start_minute", nullable = false)
    private int startMinute;

    @Column(name = "end_minute", nullable = false)
    private int endMinute;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected ParkingScheduleExceptionSlot() {
        // for JPA
    }

    public ParkingScheduleExceptionSlot(UUID id, UUID tenantId, UUID exceptionId, ChargingBand band,
                                        Instant createdAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.exceptionId = exceptionId;
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

    public UUID getExceptionId() {
        return exceptionId;
    }

    public ChargingBand band() {
        return new ChargingBand(startMinute, endMinute);
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
