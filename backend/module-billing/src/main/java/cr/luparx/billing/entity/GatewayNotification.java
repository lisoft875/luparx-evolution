package cr.luparx.billing.entity;

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
 * One thing a provider sent us, kept as it arrived
 * ({@code payment_gateway_notifications}, V37_0 — ADR 0023).
 *
 * <h2>Se guarda antes de interpretarla, y aunque no venga firmada</h2>
 *
 * <p>Two reasons, both about evidence. When a provider argues about what it sent, the exact body it
 * sent is here. And when somebody forges a notification, the attempt is here — a forgery that leaves
 * no trace is a forgery nobody notices.</p>
 *
 * <p>{@link #isSignatureVerified()} false means <b>stored and not processed</b>, and the database
 * enforces that pairing: it is a security invariant, and an invariant that only the application
 * states is an invariant one code path can forget.</p>
 *
 * <h2>claimed_outcome no acredita nada</h2>
 *
 * <p>{@link #getClaimedOutcome()} is what the provider says. It is kept so that what a provider
 * announced can later be compared against what it answered when asked — and that answer, not this
 * field, is what moves money (ADR 0023 §3).</p>
 */
@Entity
@Table(name = "payment_gateway_notifications")
public class GatewayNotification {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "provider", nullable = false, length = 64)
    private String provider;

    /** Null is common: not every provider gives its events an id. Hence the body hash. */
    @Column(name = "provider_event_id", length = 200)
    private String providerEventId;

    @Column(name = "provider_reference", length = 120)
    private String providerReference;

    /** SHA-256 of the raw body: last-resort idempotency, and the proof that what is stored is what came. */
    @Column(name = "body_sha256", nullable = false, length = 64)
    private String bodySha256;

    @Column(name = "payload", nullable = false, columnDefinition = "text")
    private String payload;

    @Column(name = "signature_verified", nullable = false)
    private boolean signatureVerified;

    @Enumerated(EnumType.STRING)
    @Column(name = "claimed_outcome", length = 24)
    private GatewayOutcome claimedOutcome;

    /** Resolved after authenticating and looking the payment up — never read out of the body. */
    @Column(name = "tenant_id")
    private UUID tenantId;

    @Column(name = "payment_id")
    private UUID paymentId;

    @Column(name = "received_at", nullable = false)
    private Instant receivedAt;

    @Column(name = "processed_at")
    private Instant processedAt;

    @Column(name = "processing_error", length = 500)
    private String processingError;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected GatewayNotification() {
        // for JPA
    }

    public GatewayNotification(UUID id, String provider, String providerEventId, String providerReference,
                               String bodySha256, String payload, boolean signatureVerified,
                               GatewayOutcome claimedOutcome, Instant now) {
        this.id = id;
        this.provider = provider;
        this.providerEventId = providerEventId;
        this.providerReference = providerReference;
        this.bodySha256 = bodySha256;
        this.payload = payload;
        this.signatureVerified = signatureVerified;
        this.claimedOutcome = claimedOutcome;
        this.receivedAt = now;
        this.createdAt = now;
    }

    /** Acted upon: the provider was asked and the payment moved, or was already where it should be. */
    public void markProcessed(UUID tenantId, UUID paymentId, Instant now) {
        this.tenantId = tenantId;
        this.paymentId = paymentId;
        this.processedAt = now;
        this.processingError = null;
    }

    /**
     * Could not be acted upon.
     *
     * <p>Left unprocessed on purpose, so the periodic sweep of open checkouts still covers the payment:
     * a notification we failed to handle must not be the only chance the money had.</p>
     */
    public void markFailed(String error) {
        this.processingError = error == null || error.length() <= 500
                ? error
                : error.substring(0, 500);
    }

    public UUID getId() {
        return id;
    }

    public String getProvider() {
        return provider;
    }

    public String getProviderEventId() {
        return providerEventId;
    }

    public String getProviderReference() {
        return providerReference;
    }

    public String getBodySha256() {
        return bodySha256;
    }

    public String getPayload() {
        return payload;
    }

    public boolean isSignatureVerified() {
        return signatureVerified;
    }

    public GatewayOutcome getClaimedOutcome() {
        return claimedOutcome;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public UUID getPaymentId() {
        return paymentId;
    }

    public Instant getReceivedAt() {
        return receivedAt;
    }

    public Instant getProcessedAt() {
        return processedAt;
    }

    public String getProcessingError() {
        return processingError;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
