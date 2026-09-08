package cr.luparx.parking.entity;

import cr.luparx.parking.model.TimeCreditSource;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * One movement of the minute balance ({@code parking_time_credit_entries}, V11_0).
 *
 * <p>A positive row is a <em>lot</em>: minutes granted together, with their own expiry and their own
 * {@link #getRemainingMinutes()}. A negative row records where minutes went — spent on a session, or
 * swept when their lot expired.</p>
 *
 * <p>Lots exist rather than a single pooled balance because minutes expire. Consuming
 * soonest-expiry-first is the only rule that does not quietly destroy value, and applying an expiry
 * to an undifferentiated pool would be impossible to explain to the citizen it took minutes from.</p>
 */
@Entity
@Table(name = "parking_time_credit_entries")
public class ParkingTimeCreditEntry {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "credit_id", nullable = false)
    private UUID creditId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 32)
    private TimeCreditSource source;

    /** Signed: positive grants a lot, negative records minutes leaving. */
    @Column(name = "minutes", nullable = false)
    private int minutes;

    /** Unspent minutes of a positive lot; always 0 on a negative entry. */
    @Column(name = "remaining_minutes", nullable = false)
    private int remainingMinutes;

    @Column(name = "session_id")
    private UUID sessionId;

    /** Null means these minutes never expire (policy {@code credit_expiry_days = 0}). */
    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected ParkingTimeCreditEntry() {
        // for JPA
    }

    private ParkingTimeCreditEntry(UUID id, UUID tenantId, UUID creditId, UUID userId, TimeCreditSource source,
                                   int minutes, int remainingMinutes, UUID sessionId, Instant expiresAt,
                                   Instant createdAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.creditId = creditId;
        this.userId = userId;
        this.source = source;
        this.minutes = minutes;
        this.remainingMinutes = remainingMinutes;
        this.sessionId = sessionId;
        this.expiresAt = expiresAt;
        this.createdAt = createdAt;
    }

    /** A lot of minutes granted. {@code expiresAt} null means it never expires. */
    public static ParkingTimeCreditEntry granted(UUID id, UUID tenantId, UUID creditId, UUID userId,
                                                 TimeCreditSource source, int minutes, UUID sessionId,
                                                 Instant expiresAt, Instant createdAt) {
        if (minutes <= 0) {
            throw new IllegalArgumentException("a granted lot must carry positive minutes");
        }
        return new ParkingTimeCreditEntry(id, tenantId, creditId, userId, source, minutes, minutes, sessionId,
                expiresAt, createdAt);
    }

    /** Minutes leaving the balance. {@code minutes} is given positive and stored negative. */
    public static ParkingTimeCreditEntry spent(UUID id, UUID tenantId, UUID creditId, UUID userId,
                                               TimeCreditSource source, int minutes, UUID sessionId,
                                               Instant createdAt) {
        if (minutes <= 0) {
            throw new IllegalArgumentException("spent minutes must be given as a positive amount");
        }
        return new ParkingTimeCreditEntry(id, tenantId, creditId, userId, source, -minutes, 0, sessionId, null,
                createdAt);
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public UUID getCreditId() {
        return creditId;
    }

    public UUID getUserId() {
        return userId;
    }

    public TimeCreditSource getSource() {
        return source;
    }

    public int getMinutes() {
        return minutes;
    }

    public int getRemainingMinutes() {
        return remainingMinutes;
    }

    public UUID getSessionId() {
        return sessionId;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public boolean isLive(Instant now) {
        return remainingMinutes > 0 && (expiresAt == null || expiresAt.isAfter(now));
    }

    /**
     * Takes minutes out of this lot.
     *
     * @return how many were actually taken, which is less than asked when the lot runs out first
     */
    public int consume(int minutes) {
        int taken = Math.min(remainingMinutes, minutes);
        this.remainingMinutes -= taken;
        return taken;
    }

    /** Empties an expired lot; the swept amount is recorded as its own negative entry. */
    public int drain() {
        int drained = remainingMinutes;
        this.remainingMinutes = 0;
        return drained;
    }
}
