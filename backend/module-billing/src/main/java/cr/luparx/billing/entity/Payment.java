package cr.luparx.billing.entity;

import cr.luparx.billing.model.PaymentMethod;
import cr.luparx.billing.model.PaymentPurpose;
import cr.luparx.billing.model.PaymentState;
import cr.luparx.billing.model.ReconciliationStatus;
import cr.luparx.core.money.Money;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/**
 * One attempt to receive money ({@code payments}, V33_0 — CONTRACT.md v0.35).
 *
 * <h2>Un intento, no un éxito</h2>
 *
 * <p>A row exists from the moment somebody tries, and it stays if the try fails. That is deliberate
 * and it is the difference between a ledger and a receipt book: "I paid and my balance did not go
 * up" has to be answerable, and a table holding only the successful attempts turns a problem at the
 * bank into the citizen's word against the municipality's.</p>
 *
 * <h2>Tres montos, y por qué no dos</h2>
 *
 * <p>{@link #getGross()} is what the citizen paid — the number on their own statement, the only one
 * they can quote, and therefore the one that governs. {@link #getFee()} is what the provider kept.
 * {@link #getNet()} is what reached the municipality's account, and it is <b>stored rather than
 * computed</b> because providers round their own way; a net derived here that differed from the
 * deposited one by a single colón would turn every reconciliation into an investigation.</p>
 *
 * <h2>Lo que apunta hacia afuera no lleva llave foránea</h2>
 *
 * <p>{@link #getTargetId()} says what the money was applied to — today a wallet movement, tomorrow a
 * citation. It is a plain identifier with no foreign key, because a foreign key here would tie this
 * module to the modules it has to be able to outlive. This module knows an identifier it was handed;
 * it does not know what a parking session is.</p>
 */
@Entity
@Table(name = "payments")
public class Payment {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    /** Null for money nobody paid personally: a counter credit still being resolved, an adjustment. */
    @Column(name = "user_id")
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "method", nullable = false, length = 24)
    private PaymentMethod method;

    @Column(name = "provider", length = 64)
    private String provider;

    /** The provider's own identifier. The key both the idempotency and the reconciliation use. */
    @Column(name = "provider_reference", length = 120)
    private String providerReference;

    @Column(name = "idempotency_key", length = 200)
    private String idempotencyKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 24)
    private PaymentState status;

    /** The provider's own code, kept verbatim: translating it loses the thing a claim is made with. */
    @Column(name = "failure_code", length = 64)
    private String failureCode;

    @Column(name = "failure_reason", length = 500)
    private String failureReason;

    @Column(name = "gross_amount_minor", nullable = false)
    private long grossAmountMinor;

    @Column(name = "fee_amount_minor")
    private Long feeAmountMinor;

    @Column(name = "net_amount_minor")
    private Long netAmountMinor;

    @Column(name = "currency_code", nullable = false, length = 3)
    private String currencyCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "purpose", nullable = false, length = 24)
    private PaymentPurpose purpose;

    @Column(name = "target_type", length = 24)
    private String targetType;

    @Column(name = "target_id")
    private UUID targetId;

    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt;

    /**
     * When the provider called it good.
     *
     * <p>Kept apart from {@link #getRequestedAt()} rather than overwriting it: the distance between
     * the two is what somebody looks at when a citizen says they paid yesterday.</p>
     */
    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    /** When the money actually arrived, according to a statement. Written by the reconciliation. */
    @Column(name = "settled_at")
    private Instant settledAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "reconciliation_status", nullable = false, length = 24)
    private ReconciliationStatus reconciliationStatus;

    @Column(name = "settlement_line_id")
    private UUID settlementLineId;

    /** The cashier who keyed it, when a person did. Null for anything the citizen did themselves. */
    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected Payment() {
        // for JPA
    }

    public Payment(UUID id, UUID tenantId, UUID userId, PaymentMethod method, String provider,
                   String providerReference, String idempotencyKey, Money gross, PaymentPurpose purpose,
                   UUID createdBy, Instant now) {
        this.id = id;
        this.tenantId = tenantId;
        this.userId = userId;
        this.method = method;
        this.provider = provider;
        this.providerReference = providerReference;
        this.idempotencyKey = idempotencyKey;
        this.grossAmountMinor = gross.minorUnits();
        this.currencyCode = gross.currencyCode();
        this.purpose = purpose;
        this.status = PaymentState.PENDING;
        // A channel nobody will ever settle starts out as such, rather than sitting in the "charged
        // and never paid" list forever. That list is only useful while everything in it is a problem.
        this.reconciliationStatus = method.isSettledByProvider()
                ? ReconciliationStatus.PENDING
                : ReconciliationStatus.NOT_APPLICABLE;
        this.createdBy = createdBy;
        this.requestedAt = now;
        this.createdAt = now;
        this.updatedAt = now;
    }

    /**
     * The money was taken, and this is what it was applied to.
     *
     * <p>The target is set here and not before: something credited against a payment that had not
     * been captured would be money the platform handed out on the strength of an attempt.</p>
     */
    public void capture(String targetType, UUID targetId, Money fee, Money net, Instant confirmedAt) {
        this.status = PaymentState.CAPTURED;
        this.targetType = targetType;
        this.targetId = targetId;
        this.feeAmountMinor = fee == null ? null : Long.valueOf(fee.minorUnits());
        // Absent a declared fee the net is the gross, which is the truth for a counter and the
        // provisional truth for a card until its statement says otherwise.
        this.netAmountMinor = net != null ? Long.valueOf(net.minorUnits())
                : Long.valueOf(this.grossAmountMinor - (fee == null ? 0L : fee.minorUnits()));
        this.confirmedAt = confirmedAt;
        this.updatedAt = confirmedAt;
    }

    /** The provider refused it. The reason is kept in the provider's own words. */
    public void fail(String failureCode, String failureReason, Instant now) {
        this.status = PaymentState.FAILED;
        this.failureCode = failureCode;
        this.failureReason = failureReason;
        this.updatedAt = now;
    }

    /** Any other move of the attempt: authorised, cancelled, refunded, charged back. */
    public void moveTo(PaymentState target, Instant now) {
        this.status = target;
        this.updatedAt = now;
    }

    /**
     * What a statement said about it.
     *
     * <p>The fee and the net are overwritten from the statement when it declares them, because the
     * statement is the authority on what the municipality actually received — the capture only ever
     * held an estimate of it.</p>
     */
    public void reconcile(ReconciliationStatus status, UUID settlementLineId, Money fee, Money net,
                          Instant settledAt, Instant now) {
        this.reconciliationStatus = status;
        this.settlementLineId = settlementLineId;
        if (fee != null) {
            this.feeAmountMinor = Long.valueOf(fee.minorUnits());
        }
        if (net != null) {
            this.netAmountMinor = Long.valueOf(net.minorUnits());
        }
        this.settledAt = settledAt;
        this.updatedAt = now;
    }

    /** Captured, and no statement covering its period reported it. The finding that costs money. */
    public void markMissingInSettlement(Instant now) {
        this.reconciliationStatus = ReconciliationStatus.MISSING_IN_SETTLEMENT;
        this.updatedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public UUID getUserId() {
        return userId;
    }

    public PaymentMethod getMethod() {
        return method;
    }

    public String getProvider() {
        return provider;
    }

    public String getProviderReference() {
        return providerReference;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public PaymentState getStatus() {
        return status;
    }

    public String getFailureCode() {
        return failureCode;
    }

    public String getFailureReason() {
        return failureReason;
    }

    public Money getGross() {
        return Money.ofMinor(grossAmountMinor, currencyCode);
    }

    public Money getFee() {
        return feeAmountMinor == null ? null : Money.ofMinor(feeAmountMinor.longValue(), currencyCode);
    }

    public Money getNet() {
        return netAmountMinor == null ? null : Money.ofMinor(netAmountMinor.longValue(), currencyCode);
    }

    public long getGrossAmountMinor() {
        return grossAmountMinor;
    }

    public Long getNetAmountMinor() {
        return netAmountMinor;
    }

    public String getCurrencyCode() {
        return currencyCode;
    }

    public PaymentPurpose getPurpose() {
        return purpose;
    }

    public String getTargetType() {
        return targetType;
    }

    public UUID getTargetId() {
        return targetId;
    }

    public Instant getRequestedAt() {
        return requestedAt;
    }

    public Instant getConfirmedAt() {
        return confirmedAt;
    }

    public Instant getSettledAt() {
        return settledAt;
    }

    public ReconciliationStatus getReconciliationStatus() {
        return reconciliationStatus;
    }

    public UUID getSettlementLineId() {
        return settlementLineId;
    }

    public UUID getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
