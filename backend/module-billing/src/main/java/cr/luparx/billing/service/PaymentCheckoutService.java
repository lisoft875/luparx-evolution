package cr.luparx.billing.service;

import cr.luparx.billing.entity.GatewayNotification;
import cr.luparx.billing.entity.PaymentCheckout;
import cr.luparx.billing.model.CheckoutState;
import cr.luparx.billing.model.GatewayErrorCode;
import cr.luparx.billing.port.GatewayOutcome;
import cr.luparx.billing.port.PaymentGateway;
import cr.luparx.billing.repository.GatewayNotificationRepository;
import cr.luparx.billing.repository.PaymentCheckoutRepository;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Keeps the record of hand-offs to a provider, and of everything a provider sent (ADR 0023).
 *
 * <h2>Qué hace y qué deliberadamente no</h2>
 *
 * <p>It talks to no gateway and credits no balance. It owns two tables and the rules about them:
 * one hand-off per attempt, a return link that works once, a notification stored before it is
 * trusted, and a duplicate notification that changes nothing. The orchestration — open the payment,
 * ask the provider, credit the wallet — lives in the application module, which is the only place that
 * is allowed to know both that money arrived and that wallets exist (ADR 0019, decision 1).</p>
 *
 * <h2>El token de retorno se entrega una vez</h2>
 *
 * <p>{@link #newReturnToken()} hands the caller a plain token, {@link #open} stores only its SHA-256,
 * and nothing can ever read it back. It is generated <em>before</em> the gateway is called because the
 * return URL is an input to the checkout, which is also why the caller holds it for the one moment it
 * exists.</p>
 */
@Service
public class PaymentCheckoutService {

    private static final SecureRandom RANDOM = new SecureRandom();
    /** 256 bits, like every other opaque token on the platform (SECURITY.md §11). */
    private static final int TOKEN_BYTES = 32;

    private final PaymentCheckoutRepository checkouts;
    private final GatewayNotificationRepository notifications;
    private final Clock clock;

    public PaymentCheckoutService(PaymentCheckoutRepository checkouts,
                                  GatewayNotificationRepository notifications, Clock clock) {
        this.checkouts = checkouts;
        this.notifications = notifications;
        this.clock = clock;
    }

    /** A fresh return token. High entropy, URL-safe, never stored in the clear. */
    public String newReturnToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /**
     * Records the hand-off the provider just granted.
     *
     * @param returnToken the plain token already embedded in the return URL the provider was given.
     *                    Only its hash is stored
     * @param ttl         how long this hand-off is good for. A window, not a guess: after it, the
     *                    sweep stops waiting and the attempt is resolved one way or the other
     */
    @Transactional
    public PaymentCheckout open(TenantId tenantId, UUID paymentId, UserId userId, String provider,
                               PaymentGateway.Handoff handoff, String returnToken, Duration ttl) {
        Instant now = clock.instant();
        // The provider's own expiry governs when it declares one: honouring a longer window than the
        // provider will is how a citizen is sent back to a page that no longer exists.
        Instant expiresAt = handoff.expiresAt() != null && handoff.expiresAt().isAfter(now)
                && handoff.expiresAt().isBefore(now.plus(ttl))
                ? handoff.expiresAt()
                : now.plus(ttl);
        PaymentCheckout checkout = new PaymentCheckout(Uuid7.generate(), tenantId.value(), paymentId,
                userId.value(), provider, handoff.providerReference(), handoff.redirectUrl(),
                sha256Hex(returnToken), expiresAt, now);
        try {
            return checkouts.save(checkout);
        } catch (DataIntegrityViolationException race) {
            // Another instance opened the hand-off for this same attempt. The unique index on
            // payment_id settled it, and reading the row back is what the retry would have received —
            // which is the whole point: two tabs must not become two charges.
            return checkouts.findByTenantIdAndPaymentId(tenantId.value(), paymentId).orElseThrow(() -> race);
        }
    }

    @Transactional(readOnly = true)
    public PaymentCheckout require(TenantId tenantId, UUID checkoutId) {
        return checkouts.findByTenantIdAndId(tenantId.value(), checkoutId)
                .orElseThrow(() -> NotFoundException.of(GatewayErrorCode.PAYMENT_CHECKOUT_NOT_FOUND,
                        "error.payment.checkout.notFound"));
    }

    /**
     * The checkout a returning citizen's link points at.
     *
     * <p>Returns empty for a token that matches nothing <b>and</b> for one that has been used, so the
     * two are indistinguishable from outside. Telling them apart would make the endpoint an oracle for
     * "did this payment happen", which is the shape of every BOLA finding (SECURITY.md §4). The caller
     * must still check that the checkout belongs to the authenticated citizen: this token is defence in
     * depth, not the authorisation.</p>
     */
    @Transactional(readOnly = true)
    public Optional<PaymentCheckout> findByReturnToken(String returnToken) {
        if (returnToken == null || returnToken.isBlank()) {
            return Optional.empty();
        }
        return checkouts.findByReturnTokenHash(sha256Hex(returnToken))
                .filter(checkout -> !checkout.isReturnTokenUsed());
    }

    /** The hand-off of one attempt, if it has one. Tenant-scoped, like everything a portal reaches. */
    @Transactional(readOnly = true)
    public Optional<PaymentCheckout> findByPayment(TenantId tenantId, UUID paymentId) {
        return checkouts.findByTenantIdAndPaymentId(tenantId.value(), paymentId);
    }

    /** Found by the provider's reference, with no tenant — for the webhook. See the repository's note. */
    @Transactional(readOnly = true)
    public Optional<PaymentCheckout> findByProviderReference(String provider, String providerReference) {
        if (provider == null || providerReference == null || providerReference.isBlank()) {
            return Optional.empty();
        }
        return checkouts.findByProviderAndProviderReference(provider, providerReference);
    }

    /** The hand-off this citizen already has open here, if any. See the repository's note. */
    @Transactional(readOnly = true)
    public Optional<PaymentCheckout> findOpenOf(TenantId tenantId, UserId userId) {
        return checkouts.findOpenOf(tenantId.value(), userId.value(), CheckoutState.OPEN,
                PageRequest.of(0, 1)).stream().findFirst();
    }

    /**
     * The provider answered, and this is what it said about the card.
     *
     * <p>Idempotent: the citizen's return and the provider's notification both arrive here, and the
     * second one has to be harmless.</p>
     */
    @Transactional
    public PaymentCheckout complete(UUID checkoutId, PaymentGateway.Snapshot snapshot) {
        PaymentCheckout checkout = checkouts.findById(checkoutId)
                .orElseThrow(() -> NotFoundException.of(GatewayErrorCode.PAYMENT_CHECKOUT_NOT_FOUND,
                        "error.payment.checkout.notFound"));
        checkout.complete(snapshot == null ? null : snapshot.network(),
                snapshot == null ? null : snapshot.cardLast4(),
                snapshot == null ? null : snapshot.authorizationCode(),
                clock.instant());
        return checkouts.save(checkout);
    }

    @Transactional
    public PaymentCheckout expire(UUID checkoutId) {
        PaymentCheckout checkout = checkouts.findById(checkoutId)
                .orElseThrow(() -> NotFoundException.of(GatewayErrorCode.PAYMENT_CHECKOUT_NOT_FOUND,
                        "error.payment.checkout.notFound"));
        checkout.expire(clock.instant());
        return checkouts.save(checkout);
    }

    @Transactional
    public void markReturnTokenUsed(UUID checkoutId) {
        checkouts.findById(checkoutId).ifPresent(checkout -> {
            checkout.useReturnToken(clock.instant());
            checkouts.save(checkout);
        });
    }

    @Transactional
    public void recordPoll(UUID checkoutId) {
        checkouts.findById(checkoutId).ifPresent(checkout -> {
            checkout.recordPoll(clock.instant());
            checkouts.save(checkout);
        });
    }

    @Transactional(readOnly = true)
    public List<PaymentCheckout> pollable(int maxAttempts, Duration minimumInterval, int limit) {
        return checkouts.findPollable(CheckoutState.OPEN, maxAttempts,
                clock.instant().minus(minimumInterval), PageRequest.of(0, Math.max(1, Math.min(limit, 500))));
    }

    @Transactional(readOnly = true)
    public List<PaymentCheckout> expired(int limit) {
        return checkouts.findExpired(CheckoutState.OPEN, clock.instant(),
                PageRequest.of(0, Math.max(1, Math.min(limit, 500))));
    }

    /**
     * Stores an incoming notification before anything is done with it.
     *
     * <p>Written whether or not the signature checked out, because a forgery attempt that leaves no
     * trace is one nobody notices. An empty result means <b>already seen</b>: the caller must then do
     * nothing at all, which is what makes a provider's retries free.</p>
     *
     * @param verified whether this adapter could authenticate the sender. False means it is stored and
     *                 not acted upon — a pairing the database also enforces
     */
    @Transactional
    public Optional<GatewayNotification> record(String provider, PaymentGateway.RawNotification raw,
                                                PaymentGateway.Notification parsed, boolean verified) {
        String bodyHash = sha256Hex(raw.bodyAsText());
        String eventId = parsed == null ? null : parsed.providerEventId();
        if (eventId != null && notifications.findByProviderAndProviderEventId(provider, eventId).isPresent()) {
            return Optional.empty();
        }
        if (notifications.findByProviderAndBodySha256(provider, bodyHash).isPresent()) {
            return Optional.empty();
        }
        GatewayOutcome claimed = parsed == null ? null : parsed.outcome();
        GatewayNotification notification = new GatewayNotification(Uuid7.generate(), provider, eventId,
                parsed == null ? null : parsed.providerReference(), bodyHash, raw.bodyAsText(), verified,
                claimed, clock.instant());
        try {
            return Optional.of(notifications.save(notification));
        } catch (DataIntegrityViolationException race) {
            // Two instances received the same retry at the same moment. The unique index decided; the
            // loser does nothing, which is exactly the behaviour a duplicate should produce.
            return Optional.empty();
        }
    }

    @Transactional
    public void markProcessed(UUID notificationId, TenantId tenantId, UUID paymentId) {
        notifications.findById(notificationId).ifPresent(notification -> {
            notification.markProcessed(tenantId == null ? null : tenantId.value(), paymentId, clock.instant());
            notifications.save(notification);
        });
    }

    @Transactional
    public void markFailed(UUID notificationId, String error) {
        notifications.findById(notificationId).ifPresent(notification -> {
            notification.markFailed(error);
            notifications.save(notification);
        });
    }

    /**
     * SHA-256, hex.
     *
     * <p>Not a password hash and correctly so: the inputs are 256-bit random tokens and body bytes, so
     * there is nothing to brute-force, and the lookup has to be one indexed equality comparison.</p>
     */
    private static String sha256Hex(String value) {
        if (value == null) {
            return null;
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is required by the Java platform", impossible);
        }
    }
}
