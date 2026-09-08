package cr.luparx.parking.entity;

import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.money.Money;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/**
 * Prepaid balance of one citizen in one municipality ({@code wallet_accounts}, V11_0).
 *
 * <p>Keyed by {@code (tenant_id, user_id)} because finance is per tenant by contract (CONTRACT.md
 * v0.2, rule 6): there is no global balance, and money loaded for one municipality is not spendable
 * in another. The currency is the municipality's own, stored next to the amount so a platform
 * serving several countries never has to guess it (ADR 0009).</p>
 *
 * <p>The balance is the authoritative figure and is written in the same transaction as the movement
 * that changed it. {@code wallet_transactions} is the ledger that explains it, not a source to be
 * summed on every read.</p>
 */
@Entity
@Table(name = "wallet_accounts")
public class WalletAccount {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "balance_minor", nullable = false)
    private long balanceMinor;

    @Column(name = "currency_code", nullable = false, length = 3)
    private String currencyCode;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected WalletAccount() {
        // for JPA
    }

    public WalletAccount(UUID id, UUID tenantId, UUID userId, Money openingBalance, Instant createdAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.userId = userId;
        this.balanceMinor = openingBalance.minorUnits();
        this.currencyCode = openingBalance.currencyCode();
        this.createdAt = createdAt;
        this.updatedAt = createdAt;
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

    public long getBalanceMinor() {
        return balanceMinor;
    }

    public String getCurrencyCode() {
        return currencyCode;
    }

    public Money getBalance() {
        return Money.ofMinor(balanceMinor, currencyCode);
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

    public boolean canAfford(Money amount) {
        return balanceMinor >= amount.minorUnits();
    }

    /**
     * Applies a signed movement. The caller has already decided whether the balance suffices; this
     * method still refuses to go negative, because a prepaid balance that can be overdrawn is a
     * credit product with rules nobody wrote.
     */
    public void apply(Money delta, Instant now) {
        long updated = Math.addExact(balanceMinor, delta.minorUnits());
        if (updated < 0L) {
            throw new IllegalStateException("wallet balance would go negative");
        }
        this.balanceMinor = updated;
        this.updatedAt = now;
    }
}
