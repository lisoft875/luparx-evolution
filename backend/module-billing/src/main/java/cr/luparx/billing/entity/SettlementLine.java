package cr.luparx.billing.entity;

import cr.luparx.billing.model.LineMatchStatus;
import cr.luparx.core.money.Money;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * One line of a provider's statement ({@code settlement_lines}, V33_0 — CONTRACT.md v0.35).
 *
 * <p>Stored exactly as it arrived, including the ones that match nothing. A line the platform cannot
 * explain is the finding, not a row to drop on import: "the provider settled something we have no
 * record of" is a question about whose money that is, and it can only be asked if the line is
 * kept.</p>
 */
@Entity
@Table(name = "settlement_lines")
public class SettlementLine {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "settlement_id", nullable = false)
    private UUID settlementId;

    /** The payment's identifier <em>according to the provider</em>. What the matching joins on. */
    @Column(name = "provider_reference", nullable = false, length = 120)
    private String providerReference;

    @Column(name = "gross_amount_minor", nullable = false)
    private long grossAmountMinor;

    @Column(name = "fee_amount_minor", nullable = false)
    private long feeAmountMinor;

    @Column(name = "net_amount_minor", nullable = false)
    private long netAmountMinor;

    @Column(name = "currency_code", nullable = false, length = 3)
    private String currencyCode;

    @Column(name = "occurred_at")
    private Instant occurredAt;

    @Column(name = "payment_id")
    private UUID paymentId;

    @Enumerated(EnumType.STRING)
    @Column(name = "match_status", nullable = false, length = 24)
    private LineMatchStatus matchStatus;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected SettlementLine() {
        // for JPA
    }

    public SettlementLine(UUID id, UUID tenantId, UUID settlementId, String providerReference, Money gross,
                          Money fee, Money net, Instant occurredAt, UUID paymentId, LineMatchStatus matchStatus,
                          Instant now) {
        this.id = id;
        this.tenantId = tenantId;
        this.settlementId = settlementId;
        this.providerReference = providerReference;
        this.grossAmountMinor = gross.minorUnits();
        this.feeAmountMinor = fee.minorUnits();
        this.netAmountMinor = net.minorUnits();
        this.currencyCode = gross.currencyCode();
        this.occurredAt = occurredAt;
        this.paymentId = paymentId;
        this.matchStatus = matchStatus;
        this.createdAt = now;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public UUID getSettlementId() {
        return settlementId;
    }

    public String getProviderReference() {
        return providerReference;
    }

    public Money getGross() {
        return Money.ofMinor(grossAmountMinor, currencyCode);
    }

    public Money getFee() {
        return Money.ofMinor(feeAmountMinor, currencyCode);
    }

    public Money getNet() {
        return Money.ofMinor(netAmountMinor, currencyCode);
    }

    public long getGrossAmountMinor() {
        return grossAmountMinor;
    }

    public long getFeeAmountMinor() {
        return feeAmountMinor;
    }

    public long getNetAmountMinor() {
        return netAmountMinor;
    }

    public String getCurrencyCode() {
        return currencyCode;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public UUID getPaymentId() {
        return paymentId;
    }

    public LineMatchStatus getMatchStatus() {
        return matchStatus;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
