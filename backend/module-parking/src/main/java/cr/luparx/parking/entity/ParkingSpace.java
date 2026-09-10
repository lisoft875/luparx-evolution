package cr.luparx.parking.entity;

import cr.luparx.core.id.TenantId;
import cr.luparx.parking.model.ParkingSpaceStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/**
 * A numbered bay inside a zone ({@code parking_spaces}, V10_0).
 *
 * <p>{@link #getCode()} is the identifier painted on the street and typed by the citizen, so it is a
 * string with its leading zeros intact ({@code "0001"}), never a number. It is unique inside the
 * municipality; two municipalities numbering their bays from {@code 0001} is the normal case.</p>
 */
@Entity
@Table(name = "parking_spaces")
public class ParkingSpace {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "zone_id", nullable = false)
    private UUID zoneId;

    @Column(name = "code", nullable = false, length = 16)
    private String code;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private ParkingSpaceStatus status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected ParkingSpace() {
        // for JPA
    }

    public ParkingSpace(UUID id, UUID tenantId, UUID zoneId, String code, ParkingSpaceStatus status,
                        Instant createdAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.zoneId = zoneId;
        this.code = code;
        this.status = status;
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

    public UUID getZoneId() {
        return zoneId;
    }

    public String getCode() {
        return code;
    }

    public ParkingSpaceStatus getStatus() {
        return status;
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

    /** A bay is moved between zones by an operator; its code stays, because the paint stays. */
    public void reassign(UUID zoneId) {
        this.zoneId = zoneId;
    }

    /**
     * The municipality repainted this bay with another number (CONTRACT.md v0.25).
     *
     * <p>This is the same bay, not a new one: the identifier of a bay is this row, and the code is
     * what is written on it. Nothing that already happened here moves, because every stay and every
     * citation keeps the code it was issued with — {@code parking_sessions.space_code_snapshot} since
     * V25_0 and {@code citations.space_code} since V17_0. Without those two copies this method would
     * be a lie in the ledger, which is why it did not exist before them.</p>
     */
    public void rename(String code) {
        this.code = code;
    }

    public void changeStatus(ParkingSpaceStatus status) {
        this.status = status;
    }

    public void touch(Instant now) {
        this.updatedAt = now;
    }
}
