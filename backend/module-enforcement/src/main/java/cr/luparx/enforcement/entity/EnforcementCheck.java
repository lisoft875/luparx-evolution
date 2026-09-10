package cr.luparx.enforcement.entity;

import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.enforcement.model.LocationState;
import cr.luparx.enforcement.model.PlateVerdict;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * One plate lookup made by an officer ({@code enforcement_checks}, V28_0).
 *
 * <p><b>Append-only.</b> There is no setter on this class and no update path in the application: a
 * record of what somebody did, which can be changed afterwards, is not a record. The link to the
 * citation that came out of a lookup lives on the citation for exactly this reason — the citation is
 * written later, sometimes hours later from the offline queue, and a column here to fill in
 * afterwards would turn this table into one that gets modified.</p>
 *
 * <p>The single deletion path is the retention purge, which is an explicit, audited job
 * (ADR 0013) and never a manual statement against production.</p>
 */
@Entity
@Table(name = "enforcement_checks")
public class EnforcementCheck {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "inspector_user_id", nullable = false)
    private UUID inspectorUserId;

    @Column(name = "plate_raw", nullable = false, length = 32)
    private String plateRaw;

    @Column(name = "plate", nullable = false, length = 16)
    private String plate;

    @Column(name = "zone_id")
    private UUID zoneId;

    @Column(name = "space_code", length = 32)
    private String spaceCode;

    /** Exactly one of this and {@link #refusalCode} is set — the database enforces it. */
    @Enumerated(EnumType.STRING)
    @Column(name = "verdict", length = 16)
    private PlateVerdict verdict;

    /** Set when the server refused to answer. A refusal is a result too, and it is worth keeping. */
    @Column(name = "refusal_code", length = 64)
    private String refusalCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "location_state", nullable = false, length = 16)
    private LocationState locationState;

    @Column(name = "latitude", precision = 9, scale = 6)
    private BigDecimal latitude;

    @Column(name = "longitude", precision = 9, scale = 6)
    private BigDecimal longitude;

    @Column(name = "location_accuracy_m", precision = 7, scale = 1)
    private BigDecimal locationAccuracyM;

    @Column(name = "user_agent", length = 400)
    private String userAgent;

    @Column(name = "ip_hash", length = 64)
    private String ipHash;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    protected EnforcementCheck() {
        // for JPA
    }

    public EnforcementCheck(UUID id, UUID tenantId, UUID inspectorUserId, String plateRaw, String plate,
                            UUID zoneId, String spaceCode, PlateVerdict verdict, String refusalCode,
                            LocationState locationState, BigDecimal latitude, BigDecimal longitude,
                            BigDecimal locationAccuracyM, String userAgent, String ipHash,
                            Instant occurredAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.inspectorUserId = inspectorUserId;
        this.plateRaw = plateRaw;
        this.plate = plate;
        this.zoneId = zoneId;
        this.spaceCode = spaceCode;
        this.verdict = verdict;
        this.refusalCode = refusalCode;
        this.locationState = locationState == null ? LocationState.NOT_GRANTED : locationState;
        // Coordinates only travel with a fix. Enforced here as well as in the database so that a
        // caller which sends a stale position alongside a failed fix cannot record it as one.
        boolean fix = this.locationState == LocationState.FIX;
        this.latitude = fix ? latitude : null;
        this.longitude = fix ? longitude : null;
        this.locationAccuracyM = fix ? locationAccuracyM : null;
        this.userAgent = userAgent;
        this.ipHash = ipHash;
        this.occurredAt = occurredAt;
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

    public UUID getInspectorUserId() {
        return inspectorUserId;
    }

    public UserId inspector() {
        return UserId.of(inspectorUserId);
    }

    public String getPlateRaw() {
        return plateRaw;
    }

    public String getPlate() {
        return plate;
    }

    public UUID getZoneId() {
        return zoneId;
    }

    public String getSpaceCode() {
        return spaceCode;
    }

    public PlateVerdict getVerdict() {
        return verdict;
    }

    public String getRefusalCode() {
        return refusalCode;
    }

    public LocationState getLocationState() {
        return locationState;
    }

    public BigDecimal getLatitude() {
        return latitude;
    }

    public BigDecimal getLongitude() {
        return longitude;
    }

    public BigDecimal getLocationAccuracyM() {
        return locationAccuracyM;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public String getIpHash() {
        return ipHash;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }
}
