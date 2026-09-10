package cr.luparx.enforcement.entity;

import cr.luparx.core.id.TenantId;
import cr.luparx.core.money.Money;
import cr.luparx.enforcement.model.CitationStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * A citation ({@code citations}, V17_0): an administrative act somebody may challenge months later.
 *
 * <h2>What the row has to survive</h2>
 *
 * <p>Everything here exists because a citation is read again long after the officer went home: the
 * plate as it was read and as it normalises, where the car was — bay, zone, coordinates and a written
 * address — what kind of infraction it was and how much it cost <em>at that moment</em>, when it
 * happened and when it was emitted, who emitted it, and what has happened to it since.</p>
 *
 * <h2>Snapshots, not joins</h2>
 *
 * <p>The infraction code, its name and the amount are copied onto the citation. The catalogue they
 * came from is configuration and will be edited; a fine raised next year must not change what
 * somebody was fined last year, and a citation that renders its amount through a join is a citation
 * whose amount changes behind the citizen's back.</p>
 *
 * <h2>Two clocks</h2>
 *
 * <p>{@link #getOccurredAt()} is what the officer's device declared and is never overwritten.
 * {@link #getIssuedAt()} is when the server accepted it. They differ whenever the device was offline,
 * and the difference is kept ({@link #getDeviceClockSkewSeconds()}) instead of being smoothed away:
 * "issued four hours after the infraction" is exactly the kind of fact a defence is built on, and
 * the platform has no business hiding it.</p>
 *
 * <h2>Append-only after issue</h2>
 *
 * <p>There is no setter that edits an issued citation. It moves through {@link CitationStatus} and
 * every move writes a {@code CitationEvent}; annulment is a status with a reason, never a delete.</p>
 */
@Entity
@Table(name = "citations")
public class Citation {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    /**
     * Human-readable consecutive, {@code PREFIX-YEAR-NNNNNN}. Null while the citation is a draft:
     * a capture that is abandoned must not burn a number out of the municipality's series.
     */
    @Column(name = "number", length = 40)
    private String number;

    @Column(name = "series_year")
    private Integer seriesYear;

    @Column(name = "sequence_number")
    private Long sequenceNumber;

    /** The plate as the officer read it, kept verbatim for the paperwork. */
    @Column(name = "plate", nullable = false, length = 32)
    private String plate;

    /** The same plate in the platform's comparison form (upper case, no separators). */
    @Column(name = "plate_normalized", nullable = false, length = 16)
    private String plateNormalized;

    /**
     * The registered vehicle, when the plate resolved to exactly one on the platform. A reference,
     * never a copy of the owner's data — and null whenever two citizens registered the same plate,
     * because linking the wrong person is worse than linking nobody.
     */
    @Column(name = "vehicle_id")
    private UUID vehicleId;

    @Column(name = "zone_id")
    private UUID zoneId;

    @Column(name = "space_id")
    private UUID spaceId;

    /** Bay code as painted, kept even when {@link #spaceId} is null (a car outside any numbered bay). */
    @Column(name = "space_code", length = 32)
    private String spaceCode;

    @Column(name = "latitude", precision = 9, scale = 6)
    private BigDecimal latitude;

    @Column(name = "longitude", precision = 9, scale = 6)
    private BigDecimal longitude;

    /** Radius in metres the device reported for its fix. A citation with a 500 m fix is not evidence. */
    @Column(name = "location_accuracy_m", precision = 7, scale = 1)
    private BigDecimal locationAccuracyM;

    @Column(name = "address_text", length = 300)
    private String addressText;

    @Column(name = "infraction_type_id", nullable = false)
    private UUID infractionTypeId;

    @Column(name = "infraction_code", nullable = false, length = 32)
    private String infractionCode;

    @Column(name = "infraction_name", nullable = false, length = 160)
    private String infractionName;

    @Column(name = "fine_amount_minor", nullable = false)
    private long fineAmountMinor;

    @Column(name = "currency_code", nullable = false, length = 3)
    private String currencyCode;

    /** Reduced amount while inside the early-payment window; equal to the fine when there is none. */
    @Column(name = "discount_amount_minor")
    private Long discountAmountMinor;

    @Column(name = "discount_until")
    private Instant discountUntil;

    @Column(name = "due_at")
    private Instant dueAt;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "issued_at")
    private Instant issuedAt;

    @Column(name = "device_clock_skew_seconds")
    private Long deviceClockSkewSeconds;

    @Column(name = "inspector_user_id", nullable = false)
    private UUID inspectorUserId;

    /**
     * The officer's name as it was when the act was raised (V22_0 — CONTRACT.md v0.15).
     *
     * <p>A copy for the same reason as the plate and the infraction's own name beside it: a citation
     * is an administrative act, and what matters years later when somebody challenges it is who
     * signed it <em>then</em>. An officer can marry and change their surname; the 2026 citation has
     * to keep saying who raised it in 2026.</p>
     */
    @Column(name = "inspector_name_snapshot", length = 200)
    private String inspectorNameSnapshot;

    /**
     * Identifier generated on the officer's device. Unique per municipality, which is what makes a
     * resend after a lost connection resolve to the same citation even when the client is a new
     * install with a new {@code Idempotency-Key}.
     */
    @Column(name = "device_citation_id", length = 64)
    private String deviceCitationId;

    /** The parking session the lookup found at the moment of the act, if any. Evidence of the check. */
    @Column(name = "parking_session_id")
    private UUID parkingSessionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private CitationStatus status;

    @Column(name = "status_reason", length = 500)
    private String statusReason;

    /**
     * The plate lookup this citation came out of, when it came out of one (V28_0).
     *
     * <p>The link lives here and not on the check because the check is append-only: the citation is
     * written afterwards — sometimes hours afterwards, out of the offline queue — and a column on
     * that table to be filled in later would turn a record of what somebody did into a record that
     * can be changed.</p>
     *
     * <p>Nullable, always. A citation can be written without a prior lookup (the officer saw the car
     * yesterday, the app had no signal), and requiring the link would turn a traceability field into
     * something that stops the work.</p>
     */
    @Column(name = "enforcement_check_id")
    private UUID enforcementCheckId;

    @Column(name = "notes", length = 2000)
    private String notes;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected Citation() {
        // for JPA
    }

    public Citation(UUID id, UUID tenantId, String plate, String plateNormalized, UUID vehicleId, UUID zoneId,
                    UUID spaceId, String spaceCode, BigDecimal latitude, BigDecimal longitude,
                    BigDecimal locationAccuracyM, String addressText, InfractionType type, Instant occurredAt,
                    UUID inspectorUserId, String inspectorNameSnapshot, String deviceCitationId,
                    UUID parkingSessionId, UUID enforcementCheckId, String notes,
                    CitationStatus initialStatus, Instant now) {
        this.id = id;
        this.tenantId = tenantId;
        this.plate = plate;
        this.plateNormalized = plateNormalized;
        this.vehicleId = vehicleId;
        this.zoneId = zoneId;
        this.spaceId = spaceId;
        this.spaceCode = spaceCode;
        this.latitude = latitude;
        this.longitude = longitude;
        this.locationAccuracyM = locationAccuracyM;
        this.addressText = addressText;
        this.infractionTypeId = type.getId();
        this.infractionCode = type.getCode();
        this.infractionName = type.getName();
        this.fineAmountMinor = type.getFineAmountMinor();
        this.currencyCode = type.getCurrencyCode();
        this.occurredAt = occurredAt;
        this.inspectorUserId = inspectorUserId;
        this.inspectorNameSnapshot = inspectorNameSnapshot;
        this.deviceCitationId = deviceCitationId;
        this.parkingSessionId = parkingSessionId;
        this.enforcementCheckId = enforcementCheckId;
        this.notes = notes;
        this.status = initialStatus;
        this.createdAt = now;
        this.updatedAt = now;
        this.deviceClockSkewSeconds = Math.abs(now.getEpochSecond() - occurredAt.getEpochSecond());
    }

    /**
     * Turns a draft into an administrative act: it takes its number, its emission time and the two
     * deadlines the infraction type declares. Called once; the service refuses a second attempt
     * through the status machine, not here.
     */
    public void issue(String number, int seriesYear, long sequenceNumber, Instant issuedAt, Instant dueAt,
                      Money discounted, Instant discountUntil) {
        this.number = number;
        this.seriesYear = seriesYear;
        this.sequenceNumber = sequenceNumber;
        this.issuedAt = issuedAt;
        this.dueAt = dueAt;
        this.discountAmountMinor = discounted == null ? null : discounted.minorUnits();
        this.discountUntil = discountUntil;
        this.status = CitationStatus.ISSUED;
        this.updatedAt = issuedAt;
        this.deviceClockSkewSeconds = Math.abs(issuedAt.getEpochSecond() - occurredAt.getEpochSecond());
    }

    /**
     * Moves the citation to another state. The transition itself is validated by the service against
     * {@link CitationStatus#canMoveTo(CitationStatus)}: the entity does not throw domain errors, it
     * records the outcome.
     */
    public void moveTo(CitationStatus target, String reason, Instant now) {
        this.status = target;
        this.statusReason = reason;
        this.updatedAt = now;
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

    public String getNumber() {
        return number;
    }

    public Integer getSeriesYear() {
        return seriesYear;
    }

    public Long getSequenceNumber() {
        return sequenceNumber;
    }

    public String getPlate() {
        return plate;
    }

    public String getPlateNormalized() {
        return plateNormalized;
    }

    public UUID getVehicleId() {
        return vehicleId;
    }

    public UUID getZoneId() {
        return zoneId;
    }

    public UUID getSpaceId() {
        return spaceId;
    }

    public String getSpaceCode() {
        return spaceCode;
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

    public String getAddressText() {
        return addressText;
    }

    public UUID getInfractionTypeId() {
        return infractionTypeId;
    }

    public String getInfractionCode() {
        return infractionCode;
    }

    public String getInfractionName() {
        return infractionName;
    }

    public long getFineAmountMinor() {
        return fineAmountMinor;
    }

    public String getCurrencyCode() {
        return currencyCode;
    }

    public Money getFine() {
        return Money.ofMinor(fineAmountMinor, currencyCode);
    }

    public Long getDiscountAmountMinor() {
        return discountAmountMinor;
    }

    public Money getDiscountedFine() {
        return discountAmountMinor == null ? null : Money.ofMinor(discountAmountMinor, currencyCode);
    }

    public Instant getDiscountUntil() {
        return discountUntil;
    }

    public Instant getDueAt() {
        return dueAt;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public Instant getIssuedAt() {
        return issuedAt;
    }

    public Long getDeviceClockSkewSeconds() {
        return deviceClockSkewSeconds;
    }

    public UUID getInspectorUserId() {
        return inspectorUserId;
    }

    /** Null only on citations raised before V22_0 that no name could be recovered for. */
    public String getInspectorNameSnapshot() {
        return inspectorNameSnapshot;
    }

    public String getDeviceCitationId() {
        return deviceCitationId;
    }

    public UUID getParkingSessionId() {
        return parkingSessionId;
    }

    public CitationStatus getStatus() {
        return status;
    }

    public String getStatusReason() {
        return statusReason;
    }

    /** The lookup this citation came from, or null when it was written without one. */
    public UUID getEnforcementCheckId() {
        return enforcementCheckId;
    }

    public String getNotes() {
        return notes;
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

    /** What is owed right now: the reduced amount while the early window is open, the fine after it. */
    public Money amountPayableAt(Instant now) {
        if (discountAmountMinor != null && discountUntil != null && now.isBefore(discountUntil)) {
            return Money.ofMinor(discountAmountMinor, currencyCode);
        }
        return getFine();
    }

    /** True when the payment window has closed and nobody has paid. */
    public boolean isOverdueAt(Instant now) {
        return status == CitationStatus.ISSUED && dueAt != null && now.isAfter(dueAt);
    }
}
