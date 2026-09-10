package cr.luparx.billing.entity;

import cr.luparx.billing.model.SettlementStatus;
import cr.luparx.core.money.Money;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * A provider's statement to the municipality ({@code settlements}, V33_0 — CONTRACT.md v0.35).
 *
 * <h2>Documento de un tercero</h2>
 *
 * <p>Its totals are stored as they arrived and are never recalculated from its own lines. That is
 * the whole point: if the header disagrees with the lines, the provider sent something wrong, and
 * quietly recomputing the header would erase the only evidence of it. The reconciliation reports the
 * difference; it does not tidy it away.</p>
 *
 * <h2>El último eslabón es el depósito</h2>
 *
 * <p>{@link #getDepositReference()} is what turns "the provider says it settled" into "the
 * municipality received". Without it the chain the checklist asks for stops one step short of the
 * bank, and the treasurer is still the one holding the statement next to the account.</p>
 */
@Entity
@Table(name = "settlements")
public class Settlement {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "provider", nullable = false, length = 64)
    private String provider;

    @Column(name = "external_reference", nullable = false, length = 120)
    private String externalReference;

    @Column(name = "period_start", nullable = false)
    private Instant periodStart;

    @Column(name = "period_end", nullable = false)
    private Instant periodEnd;

    @Column(name = "declared_gross_minor", nullable = false)
    private long declaredGrossMinor;

    @Column(name = "declared_fee_minor", nullable = false)
    private long declaredFeeMinor;

    @Column(name = "declared_net_minor", nullable = false)
    private long declaredNetMinor;

    @Column(name = "currency_code", nullable = false, length = 3)
    private String currencyCode;

    @Column(name = "deposit_expected_on")
    private LocalDate depositExpectedOn;

    @Column(name = "deposit_reference", length = 120)
    private String depositReference;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 24)
    private SettlementStatus status;

    @Column(name = "imported_at", nullable = false)
    private Instant importedAt;

    @Column(name = "imported_by")
    private UUID importedBy;

    @Column(name = "reconciled_at")
    private Instant reconciledAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected Settlement() {
        // for JPA
    }

    public Settlement(UUID id, UUID tenantId, String provider, String externalReference, Instant periodStart,
                      Instant periodEnd, Money declaredGross, Money declaredFee, Money declaredNet,
                      LocalDate depositExpectedOn, String depositReference, UUID importedBy, Instant now) {
        this.id = id;
        this.tenantId = tenantId;
        this.provider = provider;
        this.externalReference = externalReference;
        this.periodStart = periodStart;
        this.periodEnd = periodEnd;
        this.declaredGrossMinor = declaredGross.minorUnits();
        this.declaredFeeMinor = declaredFee.minorUnits();
        this.declaredNetMinor = declaredNet.minorUnits();
        this.currencyCode = declaredGross.currencyCode();
        this.depositExpectedOn = depositExpectedOn;
        this.depositReference = depositReference;
        this.status = SettlementStatus.IMPORTED;
        this.importedAt = now;
        this.importedBy = importedBy;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void markReconciled(Instant now) {
        this.status = SettlementStatus.RECONCILED;
        this.reconciledAt = now;
        this.updatedAt = now;
    }

    /** The municipality is claiming against it; it must stop counting as settled income meanwhile. */
    public void dispute(Instant now) {
        this.status = SettlementStatus.DISPUTED;
        this.updatedAt = now;
    }

    /** The bank reference, recorded when the deposit actually lands. */
    public void recordDeposit(String depositReference, Instant now) {
        this.depositReference = depositReference;
        this.updatedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public String getProvider() {
        return provider;
    }

    public String getExternalReference() {
        return externalReference;
    }

    public Instant getPeriodStart() {
        return periodStart;
    }

    public Instant getPeriodEnd() {
        return periodEnd;
    }

    public Money getDeclaredGross() {
        return Money.ofMinor(declaredGrossMinor, currencyCode);
    }

    public Money getDeclaredFee() {
        return Money.ofMinor(declaredFeeMinor, currencyCode);
    }

    public Money getDeclaredNet() {
        return Money.ofMinor(declaredNetMinor, currencyCode);
    }

    public String getCurrencyCode() {
        return currencyCode;
    }

    public LocalDate getDepositExpectedOn() {
        return depositExpectedOn;
    }

    public String getDepositReference() {
        return depositReference;
    }

    public SettlementStatus getStatus() {
        return status;
    }

    public Instant getImportedAt() {
        return importedAt;
    }

    public UUID getImportedBy() {
        return importedBy;
    }

    public Instant getReconciledAt() {
        return reconciledAt;
    }
}
