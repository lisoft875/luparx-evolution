package cr.luparx.parking.entity;

import cr.luparx.core.money.Money;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * One extension of a running session ({@code parking_session_extensions}, V11_0).
 *
 * <p>The session keeps the totals; this table is where the individual charges can be read back when
 * a citizen asks what exactly they paid for. Rows are append-only: an extension already granted is
 * never edited.</p>
 *
 * <p>{@link #getIdempotencyKey()} records which request created the row. It is kept for the audit
 * trail only — replay protection itself is the {@code IdempotencyFilter}'s job (ADR 0012), and this
 * column must not be turned into a second, parallel mechanism.</p>
 */
@Entity
@Table(name = "parking_session_extensions")
public class ParkingSessionExtension {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "session_id", nullable = false)
    private UUID sessionId;

    @Column(name = "minutes", nullable = false)
    private int minutes;

    @Column(name = "amount_minor", nullable = false)
    private long amountMinor;

    @Column(name = "currency_code", nullable = false, length = 3)
    private String currencyCode;

    @Column(name = "credit_minutes_applied", nullable = false)
    private int creditMinutesApplied;

    @Column(name = "extended_at", nullable = false)
    private Instant extendedAt;

    @Column(name = "idempotency_key", length = 200)
    private String idempotencyKey;

    protected ParkingSessionExtension() {
        // for JPA
    }

    public ParkingSessionExtension(UUID id, UUID tenantId, UUID sessionId, int minutes, Money amount,
                                   int creditMinutesApplied, Instant extendedAt, String idempotencyKey) {
        this.id = id;
        this.tenantId = tenantId;
        this.sessionId = sessionId;
        this.minutes = minutes;
        this.amountMinor = amount.minorUnits();
        this.currencyCode = amount.currencyCode();
        this.creditMinutesApplied = creditMinutesApplied;
        this.extendedAt = extendedAt;
        this.idempotencyKey = idempotencyKey;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public UUID getSessionId() {
        return sessionId;
    }

    public int getMinutes() {
        return minutes;
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

    public Instant getExtendedAt() {
        return extendedAt;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }
}
