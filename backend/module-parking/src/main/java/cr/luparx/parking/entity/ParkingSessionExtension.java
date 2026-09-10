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

    /**
     * The wallet movement that paid for <b>this</b> extension (V31_0 — CONTRACT.md v0.32).
     *
     * <p>On the extension and not on the session, because the session has one column and an extended
     * stay has several charges. Null when this extension cost nothing.</p>
     */
    @Column(name = "payment_transaction_id")
    private UUID paymentTransactionId;

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

    public UUID getPaymentTransactionId() {
        return paymentTransactionId;
    }

    /** Set once, after the money actually moved. An extension never becomes paid afterwards. */
    public void markPaid(UUID transactionId) {
        this.paymentTransactionId = transactionId;
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
