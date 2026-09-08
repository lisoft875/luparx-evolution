package cr.luparx.parking.entity;

import cr.luparx.core.id.TenantId;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/**
 * The header of a municipality's charging timetable ({@code parking_schedules}, V12_0 —
 * CONTRACT.md v0.3, "Horario de cobro"). One row per tenant, the tenant being the primary key.
 *
 * <p>The bands live in {@link ParkingScheduleSlot} and the dated exceptions in
 * {@link ParkingScheduleException}: this row carries only what is true of the whole timetable, which
 * today is the all-day switch. Loading them separately rather than as a JPA collection keeps the
 * write path explicit — replacing a timetable deletes and re-inserts its bands, and a cascading
 * collection would make the order of that dance implicit.</p>
 */
@Entity
@Table(name = "parking_schedules")
public class ParkingSchedule {

    @Id
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    /**
     * When true the municipality charges around the clock and every band is ignored. A switch and
     * not a shortcut for "a band from 00:00 to 24:00": turning it off gives the old bands back.
     */
    @Column(name = "charges_all_day", nullable = false)
    private boolean chargesAllDay;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected ParkingSchedule() {
        // for JPA
    }

    public ParkingSchedule(UUID tenantId, boolean chargesAllDay, Instant createdAt) {
        this.tenantId = tenantId;
        this.chargesAllDay = chargesAllDay;
        this.createdAt = createdAt;
        this.updatedAt = createdAt;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public TenantId tenant() {
        return TenantId.of(tenantId);
    }

    public boolean isChargesAllDay() {
        return chargesAllDay;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public long getVersion() {
        return version;
    }

    public void replace(boolean chargesAllDay, Instant now) {
        this.chargesAllDay = chargesAllDay;
        this.updatedAt = now;
    }
}
