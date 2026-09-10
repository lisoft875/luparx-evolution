package cr.luparx.parking.entity;

import cr.luparx.core.id.TenantId;
import cr.luparx.parking.model.MinuteIncrements;
import cr.luparx.parking.model.ParkingPolicyDefaults;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/**
 * The parking rules of one municipality ({@code parking_policies}, V11_0) — one row per tenant, the
 * tenant being the primary key.
 *
 * <p>Every rule of the citizen flow is a column here and none of them has a constant counterpart in
 * Java. The offered increments, the caps, whether time may be extended or finished early and what
 * happens to the minutes left over are decisions of the municipality; a second municipality with
 * different rules is a row, not a branch in the code (CONTRACT.md v0.2).</p>
 *
 * <p>The two increment lists are persisted as their canonical comma-separated form and are only ever
 * read through {@link MinuteIncrements}, so the parsing rule exists in exactly one place.</p>
 */
@Entity
@Table(name = "parking_policies")
public class ParkingPolicy {

    @Id
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "session_increments_minutes", nullable = false, length = 200)
    private String sessionIncrementsMinutes;

    @Column(name = "session_min_minutes", nullable = false)
    private int sessionMinMinutes;

    @Column(name = "session_max_minutes", nullable = false)
    private int sessionMaxMinutes;

    @Column(name = "extension_enabled", nullable = false)
    private boolean extensionEnabled;

    @Column(name = "extension_increments_minutes", nullable = false, length = 200)
    private String extensionIncrementsMinutes;

    @Column(name = "extension_max_total_minutes", nullable = false)
    private int extensionMaxTotalMinutes;

    @Column(name = "early_finish_enabled", nullable = false)
    private boolean earlyFinishEnabled;

    @Column(name = "credit_on_early_finish_enabled", nullable = false)
    private boolean creditOnEarlyFinishEnabled;

    @Column(name = "credit_min_remaining_minutes", nullable = false)
    private int creditMinRemainingMinutes;

    /** 0 means the credit never expires. */
    @Column(name = "credit_expiry_days", nullable = false)
    private int creditExpiryDays;

    @Column(name = "grace_minutes", nullable = false)
    private int graceMinutes;

    /**
     * Minutes of courtesy at the start of a stay (V30_0): a stay no longer than this is not charged.
     *
     * <p>Zero — the default, and what every municipality had before v0.31 — means no courtesy. A zone
     * may depart from it; see {@code ParkingZonePolicy}.</p>
     */
    @Column(name = "free_minutes", nullable = false)
    private int freeMinutes;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected ParkingPolicy() {
        // for JPA
    }

    public ParkingPolicy(UUID tenantId, MinuteIncrements sessionIncrements, int sessionMinMinutes,
                         int sessionMaxMinutes, boolean extensionEnabled, MinuteIncrements extensionIncrements,
                         int extensionMaxTotalMinutes, boolean earlyFinishEnabled,
                         boolean creditOnEarlyFinishEnabled, int creditMinRemainingMinutes, int creditExpiryDays,
                         int graceMinutes, int freeMinutes, Instant createdAt) {
        this.tenantId = tenantId;
        this.sessionIncrementsMinutes = sessionIncrements.toCsv();
        this.sessionMinMinutes = sessionMinMinutes;
        this.sessionMaxMinutes = sessionMaxMinutes;
        this.extensionEnabled = extensionEnabled;
        this.extensionIncrementsMinutes = extensionIncrements == null
                ? MinuteIncrements.empty().toCsv()
                : extensionIncrements.toCsv();
        this.extensionMaxTotalMinutes = extensionMaxTotalMinutes;
        this.earlyFinishEnabled = earlyFinishEnabled;
        this.creditOnEarlyFinishEnabled = creditOnEarlyFinishEnabled;
        this.creditMinRemainingMinutes = creditMinRemainingMinutes;
        this.creditExpiryDays = creditExpiryDays;
        this.graceMinutes = graceMinutes;
        this.freeMinutes = freeMinutes;
        this.createdAt = createdAt;
        this.updatedAt = createdAt;
    }

    /** The row a municipality starts with, built from the deployment's configured defaults. */
    public static ParkingPolicy fromDefaults(TenantId tenantId, ParkingPolicyDefaults defaults, Instant now) {
        return new ParkingPolicy(
                tenantId.value(),
                defaults.sessionIncrementsMinutes(),
                defaults.sessionMinMinutes(),
                defaults.sessionMaxMinutes(),
                defaults.extensionEnabled(),
                defaults.extensionIncrementsMinutes(),
                defaults.extensionMaxTotalMinutes(),
                defaults.earlyFinishEnabled(),
                defaults.creditOnEarlyFinishEnabled(),
                defaults.creditMinRemainingMinutes(),
                defaults.creditExpiryDays(),
                defaults.graceMinutes(),
                defaults.freeMinutes(),
                now);
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public TenantId tenant() {
        return TenantId.of(tenantId);
    }

    public MinuteIncrements sessionIncrements() {
        return MinuteIncrements.parse(sessionIncrementsMinutes);
    }

    public MinuteIncrements extensionIncrements() {
        return MinuteIncrements.parse(extensionIncrementsMinutes);
    }

    public String getSessionIncrementsMinutes() {
        return sessionIncrementsMinutes;
    }

    public String getExtensionIncrementsMinutes() {
        return extensionIncrementsMinutes;
    }

    public int getSessionMinMinutes() {
        return sessionMinMinutes;
    }

    public int getSessionMaxMinutes() {
        return sessionMaxMinutes;
    }

    public boolean isExtensionEnabled() {
        return extensionEnabled;
    }

    public int getExtensionMaxTotalMinutes() {
        return extensionMaxTotalMinutes;
    }

    public boolean isEarlyFinishEnabled() {
        return earlyFinishEnabled;
    }

    public boolean isCreditOnEarlyFinishEnabled() {
        return creditOnEarlyFinishEnabled;
    }

    public int getCreditMinRemainingMinutes() {
        return creditMinRemainingMinutes;
    }

    public int getCreditExpiryDays() {
        return creditExpiryDays;
    }

    public int getGraceMinutes() {
        return graceMinutes;
    }

    public int getFreeMinutes() {
        return freeMinutes;
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

    /** Whole-row replacement; the municipality edits its policy as one form, not field by field. */
    public void replace(MinuteIncrements sessionIncrements, int sessionMinMinutes, int sessionMaxMinutes,
                        boolean extensionEnabled, MinuteIncrements extensionIncrements,
                        int extensionMaxTotalMinutes, boolean earlyFinishEnabled,
                        boolean creditOnEarlyFinishEnabled, int creditMinRemainingMinutes, int creditExpiryDays,
                        int graceMinutes, int freeMinutes, Instant now) {
        this.sessionIncrementsMinutes = sessionIncrements.toCsv();
        this.sessionMinMinutes = sessionMinMinutes;
        this.sessionMaxMinutes = sessionMaxMinutes;
        this.extensionEnabled = extensionEnabled;
        this.extensionIncrementsMinutes = extensionIncrements == null
                ? MinuteIncrements.empty().toCsv()
                : extensionIncrements.toCsv();
        this.extensionMaxTotalMinutes = extensionMaxTotalMinutes;
        this.earlyFinishEnabled = earlyFinishEnabled;
        this.creditOnEarlyFinishEnabled = creditOnEarlyFinishEnabled;
        this.creditMinRemainingMinutes = creditMinRemainingMinutes;
        this.creditExpiryDays = creditExpiryDays;
        this.graceMinutes = graceMinutes;
        this.freeMinutes = freeMinutes;
        this.updatedAt = now;
    }
}
