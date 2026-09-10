package cr.luparx.parking.entity;

import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.money.Money;
import cr.luparx.parking.model.ParkingSessionStatus;
import cr.luparx.parking.model.VehicleType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * A paid stay of one vehicle on one bay ({@code parking_sessions}, V11_0).
 *
 * <p>The invariants of the domain are enforced by partial unique indexes over
 * {@code status = 'ACTIVE'}, not by this class: one running session per bay, one per registered
 * vehicle, and — since V21_0 — one per typed plate within a municipality. That is what makes them
 * hold with several backend instances running.</p>
 *
 * <p>Since v0.11 the stay does not need a vehicle of the citizen's at all: {@link #getVehicleId()}
 * is null when they typed a plate to park somebody else's car, which is why
 * {@link #getPlateSnapshot()} and {@link #getVehicleType()} are copies on the row rather than a
 * join. For a borrowed car this row is the only place those two facts exist.</p>
 *
 * <p>{@link #getPlateSnapshot()} is a copy of the plate as it was when the session started. It is
 * deliberately not a join: the inspector verifies against what was painted on the car at that
 * moment, and a citizen correcting a typo afterwards must not rewrite history.</p>
 *
 * <p>{@link #getSpaceCodeSnapshot()} is the same idea for the bay (V25_0): since v0.25 a
 * municipality can correct the code painted on a bay, and the receipt of a stay already paid has to
 * keep naming the bay the citizen actually parked in. Null only on rows written before V25_0.</p>
 */
@Entity
@Table(name = "parking_sessions")
public class ParkingSession {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** Null when the stay was opened with a plate typed on the spot — someone else's car (V21_0). */
    @Column(name = "vehicle_id")
    private UUID vehicleId;

    @Column(name = "plate_snapshot", nullable = false, length = 16)
    private String plateSnapshot;

    @Enumerated(EnumType.STRING)
    @Column(name = "vehicle_type", nullable = false, length = 32)
    private VehicleType vehicleType;

    @Column(name = "zone_id", nullable = false)
    private UUID zoneId;

    @Column(name = "space_id", nullable = false)
    private UUID spaceId;

    /** Nullable while V25_0 is in its expand phase: rows written by an older instance have none. */
    @Column(name = "space_code_snapshot", length = 16)
    private String spaceCodeSnapshot;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "ended_at")
    private Instant endedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private ParkingSessionStatus status;

    /** Total money charged: the start plus every extension. Never negative — money is not refunded. */
    @Column(name = "amount_minor", nullable = false)
    private long amountMinor;

    @Column(name = "currency_code", nullable = false, length = 3)
    private String currencyCode;

    @Column(name = "credit_minutes_applied", nullable = false)
    private int creditMinutesApplied;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected ParkingSession() {
        // for JPA
    }

    public ParkingSession(UUID id, UUID tenantId, UUID userId, UUID vehicleId, String plateSnapshot,
                          VehicleType vehicleType, UUID zoneId,
                          UUID spaceId, String spaceCodeSnapshot, Instant startedAt, Instant expiresAt,
                          Money amount, int creditMinutesApplied) {
        this.id = id;
        this.tenantId = tenantId;
        this.userId = userId;
        this.vehicleId = vehicleId;
        this.plateSnapshot = plateSnapshot;
        this.vehicleType = vehicleType;
        this.zoneId = zoneId;
        this.spaceId = spaceId;
        this.spaceCodeSnapshot = spaceCodeSnapshot;
        this.startedAt = startedAt;
        this.expiresAt = expiresAt;
        this.status = ParkingSessionStatus.ACTIVE;
        this.amountMinor = amount.minorUnits();
        this.currencyCode = amount.currencyCode();
        this.creditMinutesApplied = creditMinutesApplied;
        this.createdAt = startedAt;
        this.updatedAt = startedAt;
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

    public UUID getUserId() {
        return userId;
    }

    public UserId user() {
        return UserId.of(userId);
    }

    /** Null for a stay opened with a plate typed on the spot: someone else's car, not a vehicle of ours. */
    public UUID getVehicleId() {
        return vehicleId;
    }

    /** True when this stay is on a plate the citizen typed rather than on a vehicle they registered. */
    public boolean isGuestVehicle() {
        return vehicleId == null;
    }

    public String getPlateSnapshot() {
        return plateSnapshot;
    }

    /** The kind of vehicle as it was when the stay started — a copy, like the plate, never a join. */
    public VehicleType getVehicleType() {
        return vehicleType;
    }

    public UUID getZoneId() {
        return zoneId;
    }

    public UUID getSpaceId() {
        return spaceId;
    }

    /**
     * The bay code as it was when the stay started — a copy, like the plate, never a join.
     *
     * <p>Null on rows written before V25_0; the reader falls back to the live code for those, which
     * is exactly what it used to show for every row.</p>
     */
    public String getSpaceCodeSnapshot() {
        return spaceCodeSnapshot;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getEndedAt() {
        return endedAt;
    }

    public ParkingSessionStatus getStatus() {
        return status;
    }

    public long getAmountMinor() {
        return amountMinor;
    }

    public String getCurrencyCode() {
        return currencyCode;
    }

    public Money getAmount() {
        return Money.ofMinor(amountMinor, currencyCode);
    }

    public int getCreditMinutesApplied() {
        return creditMinutesApplied;
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

    /** Minutes booked so far: the initial stay plus every extension already applied. */
    public int bookedMinutes() {
        return (int) Duration.between(startedAt, expiresAt).toMinutes();
    }

    /**
     * Minutes still to run at {@code now}, never negative. This is what comes back as credit when a
     * citizen finishes early.
     */
    public int remainingMinutesAt(Instant now) {
        if (!now.isBefore(expiresAt)) {
            return 0;
        }
        return (int) Duration.between(now, expiresAt).toMinutes();
    }

    /** True once the clock has run out past the municipality's tolerance. */
    public boolean isExpiredAt(Instant now, int graceMinutes) {
        return now.isAfter(expiresAt.plusSeconds((long) graceMinutes * 60L));
    }

    /**
     * Applies an extension: more time on the clock and more money on the total. The status is
     * unchanged on purpose — extending a session that is not running is refused by the service, not
     * silently turned into a restart.
     */
    public void extend(int minutes, Money charged, int creditMinutes, Instant now) {
        this.expiresAt = this.expiresAt.plusSeconds((long) minutes * 60L);
        this.amountMinor = Math.addExact(this.amountMinor, charged.minorUnits());
        this.creditMinutesApplied = Math.addExact(this.creditMinutesApplied, creditMinutes);
        this.updatedAt = now;
    }

    /** Closed by the citizen. The bay is released the moment the status stops being ACTIVE. */
    public void finish(Instant now) {
        this.status = ParkingSessionStatus.FINISHED;
        this.endedAt = now;
        this.updatedAt = now;
    }

    /**
     * Closed by the clock. {@code ended_at} is left null: nobody ended this session, it simply ran
     * out, and pretending it was closed at the moment somebody happened to look would be a lie in
     * the ledger.
     */
    public void expire(Instant now) {
        this.status = ParkingSessionStatus.EXPIRED;
        this.updatedAt = now;
    }
}
