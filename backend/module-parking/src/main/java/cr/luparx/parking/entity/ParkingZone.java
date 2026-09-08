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
 * A parking zone of one municipality ({@code parking_zones}, V5_0 and V10_0).
 *
 * <p>The tenant and the administrative division are referenced by raw id rather than by a JPA
 * association: {@code module-parking} depends on {@code module-tenancy} for identity types only and
 * has no dependency at all on {@code module-geo}. The foreign keys live in the database, the module
 * boundary lives in the build (docs/ARCHITECTURE.md §5).</p>
 */
@Entity
@Table(name = "parking_zones")
public class ParkingZone {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    /** Operational code of the zone, unique inside the municipality and never globally. */
    @Column(name = "code", nullable = false, length = 32)
    private String code;

    @Column(name = "name", nullable = false, length = 160)
    private String name;

    /** Free text shown to citizens and inspectors; tenant content, not a translated label. */
    @Column(name = "description", length = 400)
    private String description;

    /** Administrative division the zone sits in. Null when it spans several, or none is loaded. */
    @Column(name = "division_id")
    private UUID divisionId;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected ParkingZone() {
        // for JPA
    }

    public ParkingZone(UUID id, UUID tenantId, String code, String name, String description, UUID divisionId,
                       boolean active, Instant createdAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.code = code;
        this.name = name;
        this.description = description;
        this.divisionId = divisionId;
        this.active = active;
        this.createdAt = createdAt;
        this.updatedAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public TenantId tenant() {
        return TenantId.of(tenantId);
    }

    public String getCode() {
        return code;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public UUID getDivisionId() {
        return divisionId;
    }

    public boolean isActive() {
        return active;
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

    public void describe(String name, String description, UUID divisionId) {
        this.name = name;
        this.description = description;
        this.divisionId = divisionId;
    }

    /** A zone is deactivated, never deleted: history references it. */
    public void changeActive(boolean active) {
        this.active = active;
    }

    public void touch(Instant now) {
        this.updatedAt = now;
    }
}
