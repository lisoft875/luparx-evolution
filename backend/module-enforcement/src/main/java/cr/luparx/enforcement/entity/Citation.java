package cr.luparx.enforcement.entity;

import cr.luparx.core.id.TenantId;
import cr.luparx.core.money.Money;
import cr.luparx.enforcement.model.CitationSource;
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

    /**
     * When it was paid, if it was (V39_0).
     *
     * <p>Null on a citation nobody has paid, and <b>also</b> on one mirrored from another system that
     * arrived already paid without a date (v0.34). That is why no constraint demands it whenever the
     * status is {@code PAID}: such a rule would refuse a citation that another municipality's system
     * legitimately says is settled.</p>
     */
    @Column(name = "paid_at")
    private Instant paidAt;

    /**
     * The wallet movement that paid it, when it was paid from the app (V39_0).
     *
     * <p>A plain identifier with <b>no foreign key</b>, for the same reason as
     * {@code payments.target_id}: {@code wallet_transactions} belongs to the parking context and this
     * module does not depend on it (ADR 0014). Null for a citation paid at the counter, or in the
     * municipality's other system.</p>
     */
    @Column(name = "paid_wallet_transaction_id")
    private UUID paidWalletTransactionId;

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
     * Where the act was born (V32_0 — CONTRACT.md v0.34).
     *
     * <p>Not a label: it decides what may be done to the row. An {@link CitationSource#EXTERNAL}
     * citation is a mirror of an act that lives in another system — readable here, never settled
     * here. Every guard in the service asks this before it asks anything else.</p>
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 16)
    private CitationSource source;

    /** Which other system, when there is one. Free text: a municipality may have two. */
    @Column(name = "source_system", length = 64)
    private String sourceSystem;

    /**
     * The citation's identifier <em>in that system</em>. The idempotency key of the ingest: the same
     * value twice updates this row and never writes a second one.
     */
    @Column(name = "external_id", length = 128)
    private String externalId;

    /**
     * The other system's own word for the state ("EN COBRO JUDICIAL").
     *
     * <p>Kept beside the mapped {@link #status} rather than instead of it. The mapping loses nuance,
     * and the citizen who telephones is going to quote the other system's word — the office has to
     * be able to find it.</p>
     */
    @Column(name = "external_status", length = 64)
    private String externalStatus;

    /** Who raised it over there: a document number, a staff code, a name. Whatever they send. */
    @Column(name = "inspector_external_ref", length = 128)
    private String inspectorExternalRef;

    @Column(name = "imported_at")
    private Instant importedAt;

    /**
     * The last ingest that confirmed this citation.
     *
     * <p>Answers "how long since the other system last spoke", which is the first question anybody
     * asks when a mirrored state looks stale — and the difference between "it is still unpaid" and
     * "we stopped hearing about it in March".</p>
     */
    @Column(name = "last_seen_at")
    private Instant lastSeenAt;

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
        this.source = CitationSource.LUPARX;
        this.createdAt = now;
        this.updatedAt = now;
        this.deviceClockSkewSeconds = Math.abs(now.getEpochSecond() - occurredAt.getEpochSecond());
    }

    /**
     * A citation that was raised in another system, mirrored here (CONTRACT.md v0.34).
     *
     * <p>A separate constructor and not a flag on the other one, because the two build different
     * things. Ours starts as a draft on a device and becomes an act when the platform issues it and
     * gives it a number; this one <b>arrives already issued</b>, with somebody else's number,
     * somebody else's causal and somebody else's officer. There is no path from here to
     * {@link CitationStatus#DRAFT}, and no number is taken from the municipality's series — burning a
     * consecutive on an act we did not raise would put a gap in our own book.</p>
     *
     * <p>The causal is carried in the snapshot columns the row already had. That is the whole reason
     * an unknown causal costs nothing: the code, the name and the amount were always copied onto the
     * citation, so a code that exists in no catalogue of ours is still completely recorded. The link
     * to {@code infraction_types} stays null until somebody maps it, and the mapping is for the
     * reports, never for the record.</p>
     */
    public Citation(UUID id, UUID tenantId, String sourceSystem, String externalId, String number,
                    String plate, String plateNormalized, UUID vehicleId, UUID zoneId, UUID spaceId,
                    String spaceCode, BigDecimal latitude, BigDecimal longitude, String addressText,
                    UUID infractionTypeId, String infractionCode, String infractionName,
                    long fineAmountMinor, String currencyCode, Instant occurredAt, Instant issuedAt,
                    Instant dueAt, String inspectorExternalRef, String inspectorNameSnapshot,
                    CitationStatus status, String externalStatus, String notes, Instant now) {
        this.id = id;
        this.tenantId = tenantId;
        this.source = CitationSource.EXTERNAL;
        this.sourceSystem = sourceSystem;
        this.externalId = externalId;
        this.number = number;
        this.plate = plate;
        this.plateNormalized = plateNormalized;
        this.vehicleId = vehicleId;
        this.zoneId = zoneId;
        this.spaceId = spaceId;
        this.spaceCode = spaceCode;
        this.latitude = latitude;
        this.longitude = longitude;
        this.addressText = addressText;
        this.infractionTypeId = infractionTypeId;
        this.infractionCode = infractionCode;
        this.infractionName = infractionName;
        this.fineAmountMinor = fineAmountMinor;
        this.currencyCode = currencyCode;
        this.occurredAt = occurredAt;
        this.issuedAt = issuedAt;
        this.dueAt = dueAt;
        this.inspectorExternalRef = inspectorExternalRef;
        this.inspectorNameSnapshot = inspectorNameSnapshot;
        this.status = status;
        this.externalStatus = externalStatus;
        this.notes = notes;
        this.importedAt = now;
        this.lastSeenAt = now;
        this.createdAt = now;
        this.updatedAt = now;
        // Deliberately not computed for a mirror. The skew is the distance between what an officer's
        // device declared and when OUR server accepted it; for an act raised elsewhere both instants
        // come from the same other system, and a number derived from them would look like a
        // measurement while measuring nothing.
    }

    /**
     * A later ingest of the same external citation.
     *
     * <p>Only the things the other system may legitimately have changed: the state, its own word for
     * it, the deadline and the amount. The act itself — plate, causal, place, moment, officer — is
     * <b>not</b> rewritten. An ingest that could change what somebody was fined for would make the
     * mirror a channel for editing history from outside, and the whole point of mirroring is that
     * this platform is not the one deciding.</p>
     *
     * <p>A change that arrives anyway is a discrepancy for a person to look at, not something to
     * apply quietly; the service reports it and leaves the row as it stands.</p>
     */
    public void refreshFromSource(CitationStatus status, String externalStatus, Instant dueAt,
                                  Long fineAmountMinor, Instant now) {
        this.status = status;
        this.externalStatus = externalStatus;
        if (dueAt != null) {
            this.dueAt = dueAt;
        }
        if (fineAmountMinor != null) {
            this.fineAmountMinor = fineAmountMinor.longValue();
        }
        this.lastSeenAt = now;
        this.updatedAt = now;
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
     * Attaches the catalogue causal to a mirrored citation once somebody mapped its foreign code
     * (CONTRACT.md v0.34).
     *
     * <p>The link and nothing else. The code, the name and the amount stay exactly as they arrived —
     * they are the record of what the other system fined this person for, and a mapping is how the
     * municipality's reports add these up, never a correction of the act.</p>
     */
    public void linkInfractionType(UUID infractionTypeId, Instant now) {
        this.infractionTypeId = infractionTypeId;
        this.updatedAt = now;
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

    /**
     * Records that this citation was settled from the citizen's wallet (v0.41).
     *
     * <p>Called <b>after</b> the transition to {@code PAID} and never instead of it: the status is
     * what the municipality's reports read, and this is the receipt that says which movement carried
     * the money. The schema refuses a movement on anything that is not paid
     * ({@code ck_citations_paid_movement}), so the two cannot drift apart.</p>
     */
    public void markPaidFromWallet(UUID walletTransactionId, Instant now) {
        this.paidAt = now;
        this.paidWalletTransactionId = walletTransactionId;
        this.updatedAt = now;
    }

    public Instant getPaidAt() {
        return paidAt;
    }

    public UUID getPaidWalletTransactionId() {
        return paidWalletTransactionId;
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

    public CitationSource getSource() {
        return source == null ? CitationSource.LUPARX : source;
    }

    public String getSourceSystem() {
        return sourceSystem;
    }

    public String getExternalId() {
        return externalId;
    }

    public String getExternalStatus() {
        return externalStatus;
    }

    public String getInspectorExternalRef() {
        return inspectorExternalRef;
    }

    public Instant getImportedAt() {
        return importedAt;
    }

    public Instant getLastSeenAt() {
        return lastSeenAt;
    }

    /** True when this row only reflects an act that lives in another system. */
    public boolean isMirror() {
        return getSource().isMirror();
    }
}
