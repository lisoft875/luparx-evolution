package cr.luparx.parking.entity;

import cr.luparx.parking.model.MinuteIncrements;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/**
 * Where one zone departs from its municipality's parking rules ({@code parking_zone_policies}, V30_0
 * — CONTRACT.md v0.31).
 *
 * <p><b>Every column is an exception, never a copy.</b> Null means "whatever the municipality says",
 * so raising the municipality's maximum stay still moves every zone that did not deliberately depart
 * from it. Copying the municipality's values into each zone as it is created would freeze each one at
 * whatever was true the day it was created, and nobody discovers that until they audit.</p>
 *
 * <p>What is deliberately <b>not</b> here is as considered as what is. Whether time may be extended,
 * whether a stay may be finished early, whether unused minutes come back as credit and how long the
 * officer's tolerance is remain the municipality's. Those are what the product promises the citizen,
 * not levers for managing a zone; a municipality where one zone gives minutes back and the next one
 * does not — with no way for the citizen to know before parking — is a broken promise, not
 * configuration.</p>
 */
@Entity
@Table(name = "parking_zone_policies")
public class ParkingZonePolicy {

    @Id
    @Column(name = "zone_id", nullable = false)
    private UUID zoneId;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "session_increments_minutes", length = 200)
    private String sessionIncrementsMinutes;

    @Column(name = "session_min_minutes")
    private Integer sessionMinMinutes;

    /** The lever that manages rotation: two hours downtown, twenty-four beside the hospital. */
    @Column(name = "session_max_minutes")
    private Integer sessionMaxMinutes;

    @Column(name = "extension_increments_minutes", length = 200)
    private String extensionIncrementsMinutes;

    @Column(name = "extension_max_total_minutes")
    private Integer extensionMaxTotalMinutes;

    /** Minutes of courtesy at the start of a stay; 0 is a real answer here, null is "inherit". */
    @Column(name = "free_minutes")
    private Integer freeMinutes;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected ParkingZonePolicy() {
        // for JPA
    }

    public ParkingZonePolicy(UUID zoneId, UUID tenantId, Instant now) {
        this.zoneId = zoneId;
        this.tenantId = tenantId;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public UUID getZoneId() {
        return zoneId;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public MinuteIncrements sessionIncrements() {
        return sessionIncrementsMinutes == null ? null : MinuteIncrements.parse(sessionIncrementsMinutes);
    }

    public MinuteIncrements extensionIncrements() {
        return extensionIncrementsMinutes == null ? null : MinuteIncrements.parse(extensionIncrementsMinutes);
    }

    public String getSessionIncrementsMinutes() {
        return sessionIncrementsMinutes;
    }

    public String getExtensionIncrementsMinutes() {
        return extensionIncrementsMinutes;
    }

    public Integer getSessionMinMinutes() {
        return sessionMinMinutes;
    }

    public Integer getSessionMaxMinutes() {
        return sessionMaxMinutes;
    }

    public Integer getExtensionMaxTotalMinutes() {
        return extensionMaxTotalMinutes;
    }

    public Integer getFreeMinutes() {
        return freeMinutes;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public long getVersion() {
        return version;
    }

    /** True when the zone departs in nothing — the row exists but says the same as the municipality. */
    public boolean isEmpty() {
        return sessionIncrementsMinutes == null && sessionMinMinutes == null && sessionMaxMinutes == null
                && extensionIncrementsMinutes == null && extensionMaxTotalMinutes == null && freeMinutes == null;
    }

    /**
     * Replaces the whole set of departures, as one form.
     *
     * <p>Nulls arrive meaning "stop departing on this one", which is why this takes every field: a
     * partial update would leave "absent" ambiguous between "unchanged" and "back to inheriting", and
     * those are opposite instructions.</p>
     */
    public void replace(MinuteIncrements sessionIncrements, Integer sessionMinMinutes, Integer sessionMaxMinutes,
                        MinuteIncrements extensionIncrements, Integer extensionMaxTotalMinutes,
                        Integer freeMinutes, Instant now) {
        this.sessionIncrementsMinutes = sessionIncrements == null ? null : sessionIncrements.toCsv();
        this.sessionMinMinutes = sessionMinMinutes;
        this.sessionMaxMinutes = sessionMaxMinutes;
        this.extensionIncrementsMinutes = extensionIncrements == null ? null : extensionIncrements.toCsv();
        this.extensionMaxTotalMinutes = extensionMaxTotalMinutes;
        this.freeMinutes = freeMinutes;
        this.updatedAt = now;
    }
}
