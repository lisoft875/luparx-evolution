package cr.luparx.parking.entity;

import cr.luparx.core.money.Money;
import cr.luparx.parking.model.WalletTopupSource;
import cr.luparx.parking.model.WalletTransactionType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * One movement of the wallet ({@code wallet_transactions}, V11_0).
 *
 * <p>Append-only: a row is never updated or deleted, and a mistake is corrected by an
 * {@link WalletTransactionType#ADJUSTMENT} that says so. The amount is <em>signed</em> — negative is
 * money leaving the wallet — and V11_0 has a CHECK tying each type to its sign, so a charge cannot
 * be written as a credit by a bug in a caller.</p>
 */
@Entity
@Table(name = "wallet_transactions")
public class WalletTransaction {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "account_id", nullable = false)
    private UUID accountId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 32)
    private WalletTransactionType type;

    @Column(name = "amount_minor", nullable = false)
    private long amountMinor;

    @Column(name = "currency_code", nullable = false, length = 3)
    private String currencyCode;

    /** Balance right after this movement; what makes a statement readable without replaying it. */
    @Column(name = "balance_after_minor", nullable = false)
    private long balanceAfterMinor;

    @Column(name = "session_id")
    private UUID sessionId;

    @Column(name = "idempotency_key", length = 200)
    private String idempotencyKey;

    /**
     * Which channel produced this movement (V18_0). Nullable because every row written before that
     * migration predates the distinction, and inventing a channel for them would be a lie in a
     * ledger.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "source", length = 32)
    private WalletTopupSource source;

    /**
     * The counter's or the partner's own reference for the payment. Unique per municipality and
     * source, so a resend from another process credits once; it is what a reconciliation joins on.
     */
    @Column(name = "external_reference", length = 120)
    private String externalReference;

    /** The operator who keyed it, when a person did. Null for anything the citizen did themselves. */
    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected WalletTransaction() {
        // for JPA
    }

    public WalletTransaction(UUID id, UUID tenantId, UUID accountId, UUID userId, WalletTransactionType type,
                             Money amount, long balanceAfterMinor, UUID sessionId, String idempotencyKey,
                             Instant createdAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.accountId = accountId;
        this.userId = userId;
        this.type = type;
        this.amountMinor = amount.minorUnits();
        this.currencyCode = amount.currencyCode();
        this.balanceAfterMinor = balanceAfterMinor;
        this.sessionId = sessionId;
        this.idempotencyKey = idempotencyKey;
        this.createdAt = createdAt;
    }

    /**
     * A movement that knows where it came from. The older constructor stays for the flows that have
     * only one possible channel (a session charge is always the citizen spending their own balance).
     */
    public WalletTransaction(UUID id, UUID tenantId, UUID accountId, UUID userId, WalletTransactionType type,
                             Money amount, long balanceAfterMinor, UUID sessionId, String idempotencyKey,
                             WalletTopupSource source, String externalReference, UUID createdBy, Instant createdAt) {
        this(id, tenantId, accountId, userId, type, amount, balanceAfterMinor, sessionId, idempotencyKey, createdAt);
        this.source = source;
        this.externalReference = externalReference;
        this.createdBy = createdBy;
    }

    public WalletTopupSource getSource() {
        return source;
    }

    public String getExternalReference() {
        return externalReference;
    }

    public UUID getCreatedBy() {
        return createdBy;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public UUID getAccountId() {
        return accountId;
    }

    public UUID getUserId() {
        return userId;
    }

    public WalletTransactionType getType() {
        return type;
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

    public long getBalanceAfterMinor() {
        return balanceAfterMinor;
    }

    public Money getBalanceAfter() {
        return Money.ofMinor(balanceAfterMinor, currencyCode);
    }

    public UUID getSessionId() {
        return sessionId;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
