package cr.luparx.parking.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/**
 * A zone's own charging timetable ({@code parking_zone_schedules}, V30_0 — CONTRACT.md v0.31).
 *
 * <p>Here the inheritance is <b>by table</b> and not by column, unlike {@link ParkingZonePolicy},
 * because a timetable is not inherited by halves: either the zone has its own bands or it uses the
 * municipality's. The existence of this row is what says which.</p>
 *
 * <p>A header with {@code chargesAllDay = false} and <b>no bands at all</b> is a zone that never
 * charges — a free zone, which is legitimate configuration and could not be expressed before. It is
 * told apart from "inherits" precisely because the row exists.</p>
 *
 * <p>Dated exceptions are <b>not</b> here and stay the municipality's: a public holiday is a holiday
 * across the whole canton. A zone may charge on hours of its own every day of the week, but the 15th
 * of September is not charged anywhere, and giving each zone its own holidays would multiply per zone
 * exactly the work this version exists to remove.</p>
 */
@Entity
@Table(name = "parking_zone_schedules")
public class ParkingZoneSchedule {

    @Id
    @Column(name = "zone_id", nullable = false)
    private UUID zoneId;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "charges_all_day", nullable = false)
    private boolean chargesAllDay;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected ParkingZoneSchedule() {
        // for JPA
    }

    public ParkingZoneSchedule(UUID zoneId, UUID tenantId, boolean chargesAllDay, Instant now) {
        this.zoneId = zoneId;
        this.tenantId = tenantId;
        this.chargesAllDay = chargesAllDay;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public UUID getZoneId() {
        return zoneId;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public boolean isChargesAllDay() {
        return chargesAllDay;
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
