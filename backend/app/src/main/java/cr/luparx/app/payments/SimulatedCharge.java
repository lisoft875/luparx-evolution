package cr.luparx.app.payments;

import cr.luparx.billing.port.CardNetwork;
import cr.luparx.billing.port.GatewayOutcome;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * What the simulated provider knows about one charge
 * ({@code sim_gateway_charges}, V37_0 — ADR 0023 §6).
 *
 * <h2>En la base y no en memoria</h2>
 *
 * <p>A simulator holding its state in a static map is a simulator that lies the moment a second
 * instance exists — and multi-instance correctness is precisely the class of defect a simulator is
 * there to surface. So this is a row, it survives a restart, and two backends behind a load balancer
 * see the same charge.</p>
 *
 * <h2>Sin llaves foráneas, a propósito</h2>
 *
 * <p>{@link #getPaymentId()} and {@link #getTenantId()} are plain identifiers. A real provider has no
 * referential integrity against our tables, and a simulator that did would hide the bugs that only
 * appear when it does not — an orphaned reference, a charge for a payment that was rolled back.</p>
 */
@Entity
@Table(name = "sim_gateway_charges")
public class SimulatedCharge {

    /** For a provider, its own reference <em>is</em> the identity of a charge. */
    @Id
    @Column(name = "provider_reference", nullable = false, length = 120)
    private String providerReference;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "payment_id", nullable = false)
    private UUID paymentId;

    @Column(name = "idempotency_key", length = 200)
    private String idempotencyKey;

    @Column(name = "amount_minor", nullable = false)
    private long amountMinor;

    @Column(name = "currency_code", nullable = false, length = 3)
    private String currencyCode;

    @Column(name = "description", length = 200)
    private String description;

    @Column(name = "return_url", nullable = false, columnDefinition = "text")
    private String returnUrl;

    @Enumerated(EnumType.STRING)
    @Column(name = "outcome", nullable = false, length = 24)
    private GatewayOutcome outcome;

    @Enumerated(EnumType.STRING)
    @Column(name = "card_network", length = 24)
    private CardNetwork network;

    @Column(name = "card_last4", length = 4)
    private String cardLast4;

    @Column(name = "authorization_code", length = 32)
    private String authorizationCode;

    @Column(name = "failure_code", length = 64)
    private String failureCode;

    @Column(name = "failure_reason", length = 500)
    private String failureReason;

    @Column(name = "challenge_pending", nullable = false)
    private boolean challengePending;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    protected SimulatedCharge() {
        // for JPA
    }

    public SimulatedCharge(String providerReference, UUID tenantId, UUID paymentId, String idempotencyKey,
                           long amountMinor, String currencyCode, String description, String returnUrl,
                           Instant now, Instant expiresAt) {
        this.providerReference = providerReference;
        this.tenantId = tenantId;
        this.paymentId = paymentId;
        this.idempotencyKey = idempotencyKey;
        this.amountMinor = amountMinor;
        this.currencyCode = currencyCode;
        this.description = description;
        this.returnUrl = returnUrl;
        this.outcome = GatewayOutcome.PENDING;
        this.challengePending = false;
        this.createdAt = now;
        this.updatedAt = now;
        this.expiresAt = expiresAt;
    }

    /** The card was accepted at the simulated page and a challenge is still to be cleared. */
    public void challenge(CardNetwork network, String cardLast4, Instant now) {
        this.network = network;
        this.cardLast4 = cardLast4;
        this.challengePending = true;
        this.outcome = GatewayOutcome.PENDING;
        this.updatedAt = now;
    }

    public void approve(CardNetwork network, String cardLast4, String authorizationCode, Instant now) {
        this.network = network;
        this.cardLast4 = cardLast4;
        this.authorizationCode = authorizationCode;
        this.challengePending = false;
        this.outcome = GatewayOutcome.CAPTURED;
        this.failureCode = null;
        this.failureReason = null;
        this.resolvedAt = now;
        this.updatedAt = now;
    }

    public void decline(CardNetwork network, String cardLast4, String failureCode, String failureReason,
                        Instant now) {
        this.network = network;
        this.cardLast4 = cardLast4;
        this.challengePending = false;
        this.outcome = GatewayOutcome.FAILED;
        this.failureCode = failureCode;
        this.failureReason = failureReason;
        this.resolvedAt = now;
        this.updatedAt = now;
    }

    /** The citizen closed the page, or the window ran out. */
    public void cancel(Instant now) {
        this.challengePending = false;
        this.outcome = GatewayOutcome.CANCELLED;
        this.resolvedAt = now;
        this.updatedAt = now;
    }

    public boolean isResolved() {
        return outcome != null && outcome.isResolved();
    }

    public boolean isExpiredAt(Instant moment) {
        return moment != null && expiresAt != null && !moment.isBefore(expiresAt);
    }

    public String getProviderReference() {
        return providerReference;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public UUID getPaymentId() {
        return paymentId;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public long getAmountMinor() {
        return amountMinor;
    }

    public String getCurrencyCode() {
        return currencyCode;
    }

    public String getDescription() {
        return description;
    }

    public String getReturnUrl() {
        return returnUrl;
    }

    public GatewayOutcome getOutcome() {
        return outcome;
    }

    public CardNetwork getNetwork() {
        return network;
    }

    public String getCardLast4() {
        return cardLast4;
    }

    public String getAuthorizationCode() {
        return authorizationCode;
    }

    public String getFailureCode() {
        return failureCode;
    }

    public String getFailureReason() {
        return failureReason;
    }

    public boolean isChallengePending() {
        return challengePending;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Instant getResolvedAt() {
        return resolvedAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }
}
