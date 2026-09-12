package cr.luparx.billing.entity;

import cr.luparx.billing.model.CheckoutState;
import cr.luparx.billing.port.CardNetwork;
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
 * The stretch of time in which the citizen is not here ({@code payment_checkouts}, V37_0 — ADR 0023).
 *
 * <h2>Qué recuerda y qué no</h2>
 *
 * <p>Between opening an attempt and hearing what happened, the citizen is on somebody else's domain.
 * What has to be remembered about that: where they went, under which reference, until when it is good
 * for, and with which token they come back.</p>
 *
 * <p><b>Not</b> whether the payment succeeded. That lives in {@code payments} and nowhere else —
 * {@link #getState()} is the life of the hand-off, not of the money. Two rows with an opinion about
 * one charge is how a treasurer ends up with two figures and no way to choose.</p>
 *
 * <h2>Los últimos cuatro dígitos, y nada más</h2>
 *
 * <p>{@link #getCardLast4()} and {@link #getNetwork()} are here because they are what a citizen
 * recognises on their own statement when they ring to ask. Four digits and a scheme name may be
 * stored; the card number may not, and the checkout flow is built so that it never arrives (ADR
 * 0023 §1).</p>
 */
@Entity
@Table(name = "payment_checkouts")
public class PaymentCheckout {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "payment_id", nullable = false)
    private UUID paymentId;

    /** Unlike a payment's, never null: a checkout exists because a known person is paying now. */
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "provider", nullable = false, length = 64)
    private String provider;

    /** Mandatory here: without it there is nothing to ask the provider about, and asking is what credits. */
    @Column(name = "provider_reference", nullable = false, length = 120)
    private String providerReference;

    // `text` in the schema: a provider's checkout URL carries signed parameters and can be long. Declared
    // so that a future `ddl-auto: validate` agrees with the migration instead of expecting a varchar(255).
    @Column(name = "redirect_url", nullable = false, columnDefinition = "text")
    private String redirectUrl;

    @Enumerated(EnumType.STRING)
    @Column(name = "state", nullable = false, length = 24)
    private CheckoutState state;

    /** SHA-256 of the return token. Never the token: a database leak must not hand out usable links. */
    @Column(name = "return_token_hash", nullable = false, length = 64)
    private String returnTokenHash;

    @Column(name = "return_token_used_at")
    private Instant returnTokenUsedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "card_network", length = 24)
    private CardNetwork network;

    @Column(name = "card_last4", length = 4)
    private String cardLast4;

    @Column(name = "authorization_code", length = 32)
    private String authorizationCode;

    @Column(name = "poll_attempts", nullable = false)
    private int pollAttempts;

    @Column(name = "last_polled_at")
    private Instant lastPolledAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected PaymentCheckout() {
        // for JPA
    }

    public PaymentCheckout(UUID id, UUID tenantId, UUID paymentId, UUID userId, String provider,
                           String providerReference, String redirectUrl, String returnTokenHash,
                           Instant expiresAt, Instant now) {
        this.id = id;
        this.tenantId = tenantId;
        this.paymentId = paymentId;
        this.userId = userId;
        this.provider = provider;
        this.providerReference = providerReference;
        this.redirectUrl = redirectUrl;
        this.returnTokenHash = returnTokenHash;
        this.state = CheckoutState.OPEN;
        this.expiresAt = expiresAt;
        this.createdAt = now;
        this.updatedAt = now;
    }

    /**
     * The provider answered. What it answered is written onto the payment, not here.
     *
     * <p>Idempotent on purpose: the return and the notification both lead here, and the whole design
     * depends on the second one being harmless (ADR 0023 §4).</p>
     */
    public void complete(CardNetwork network, String cardLast4, String authorizationCode, Instant now) {
        if (this.state != CheckoutState.OPEN) {
            return;
        }
        this.state = CheckoutState.COMPLETED;
        this.network = network;
        this.cardLast4 = cardLast4;
        this.authorizationCode = authorizationCode;
        this.resolvedAt = now;
        this.updatedAt = now;
    }

    /** We stopped waiting. The payment is cancelled separately, by the service that owns it. */
    public void expire(Instant now) {
        if (this.state != CheckoutState.OPEN) {
            return;
        }
        this.state = CheckoutState.EXPIRED;
        this.resolvedAt = now;
        this.updatedAt = now;
    }

    /**
     * Burns the return link.
     *
     * <p>Marked rather than cleared: "that link was already used" and "that link never existed" are
     * different answers for whoever is helping the citizen on the phone.</p>
     */
    public void useReturnToken(Instant now) {
        this.returnTokenUsedAt = now;
        this.updatedAt = now;
    }

    /** One more question asked of the provider. Counted so a provider that is down is not asked for ever. */
    public void recordPoll(Instant now) {
        this.pollAttempts++;
        this.lastPolledAt = now;
        this.updatedAt = now;
    }

    public boolean isExpiredAt(Instant moment) {
        return moment != null && expiresAt != null && !moment.isBefore(expiresAt);
    }

    public boolean isReturnTokenUsed() {
        return returnTokenUsedAt != null;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public UUID getPaymentId() {
        return paymentId;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getProvider() {
        return provider;
    }

    public String getProviderReference() {
        return providerReference;
    }

    public String getRedirectUrl() {
        return redirectUrl;
    }

    public CheckoutState getState() {
        return state;
    }

    public String getReturnTokenHash() {
        return returnTokenHash;
    }

    public Instant getReturnTokenUsedAt() {
        return returnTokenUsedAt;
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

    public int getPollAttempts() {
        return pollAttempts;
    }

    public Instant getLastPolledAt() {
        return lastPolledAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getResolvedAt() {
        return resolvedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
