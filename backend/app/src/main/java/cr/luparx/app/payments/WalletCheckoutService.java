package cr.luparx.app.payments;

import cr.luparx.app.billing.TopupPaymentService;
import cr.luparx.app.config.MailProperties;
import cr.luparx.app.config.PaymentsProperties;
import cr.luparx.billing.entity.Payment;
import cr.luparx.billing.entity.PaymentCheckout;
import cr.luparx.billing.model.GatewayErrorCode;
import cr.luparx.billing.model.PaymentMethod;
import cr.luparx.billing.model.PaymentPurpose;
import cr.luparx.billing.model.PaymentState;
import cr.luparx.billing.port.GatewayException;
import cr.luparx.billing.port.GatewayOutcome;
import cr.luparx.billing.port.PaymentGateway;
import cr.luparx.billing.port.PaymentGatewayRegistry;
import cr.luparx.billing.service.PaymentCheckoutService;
import cr.luparx.billing.service.PaymentService;
import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.UnprocessableEntityException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.money.Money;
import cr.luparx.parking.model.WalletTopupSource;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.service.TenantService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URLEncoder;
import java.time.Clock;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * The card path, start to finish (ADR 0023).
 *
 * <h2>Un solo camino y tres disparadores</h2>
 *
 * <p>{@link #resolve} is the only place a card top-up is ever credited, and three things lead to it:
 * the citizen coming back, the provider's notification, and the periodic sweep. None of them carries
 * the result — each one only says <em>which</em> payment to go and ask the provider about (ADR 0023 §3
 * and §4). That is not three implementations of the same thing; it is one implementation with three
 * ways of being woken up, which is why a lost notification costs nothing.</p>
 *
 * <h2>Por qué la acreditación pasa por TopupPaymentService y no se reescribe aquí</h2>
 *
 * <p>Crediting a wallet and capturing the payment that funded it have to happen in one transaction, and
 * that pairing already exists. It is reached with <b>the same idempotency key</b> the attempt was opened
 * with, so its internal {@code begin} finds this payment instead of starting another — which is what
 * keeps {@code payments.provider} holding the gateway's name, the value a settlement is matched on,
 * rather than the channel's. Copying those few lines into this class would have been the version that
 * drifts.</p>
 */
@Service
public class WalletCheckoutService {

    private static final Logger LOGGER = LoggerFactory.getLogger(WalletCheckoutService.class);

    /** What a card network passes through onto a statement line. Beyond it, text is silently cut. */
    private static final int STATEMENT_DESCRIPTOR_LIMIT = 22;

    private final PaymentGatewayRegistry gateways;
    private final PaymentService payments;
    private final PaymentCheckoutService checkouts;
    private final TopupPaymentService topups;
    private final TenantService tenants;
    private final PaymentsProperties properties;
    private final MailProperties mailProperties;
    /** Injected, never {@code Instant.now()}: timestamps are UTC and tests need to move time. */
    private final Clock clock;

    public WalletCheckoutService(PaymentGatewayRegistry gateways, PaymentService payments,
                                 PaymentCheckoutService checkouts, TopupPaymentService topups,
                                 TenantService tenants, PaymentsProperties properties,
                                 MailProperties mailProperties, Clock clock) {
        this.gateways = gateways;
        this.payments = payments;
        this.checkouts = checkouts;
        this.topups = topups;
        this.tenants = tenants;
        this.properties = properties;
        this.mailProperties = mailProperties;
        this.clock = clock;
    }

    /** Whether this municipality can be paid by card at all, for an interface that must say so. */
    public Optional<PaymentGateway> gatewayFor(TenantId tenantId) {
        return gateways.forTenant(tenantId);
    }

    /**
     * Opens an attempt and returns where to send the citizen.
     *
     * <p>Order matters and is the same as ADR 0019's: the payment exists <b>before</b> anybody is
     * contacted, so a charge that happens against a provider we then lose contact with still has a row
     * here. A gateway that cannot be reached leaves that row {@code PENDING}, which is the honest record
     * of an attempt that did not complete — never {@code FAILED}, because we do not know.</p>
     *
     * @param clientIdempotencyKey the caller's key, when it sent one. A stable key is derived when it
     *                             did not, because the credit step depends on there being one
     */
    @Transactional
    public Started start(TenantId tenantId, UserId userId, Money amount, String clientIdempotencyKey,
                         Locale locale, String customerEmail) {
        Tenant tenant = tenants.requireActive(tenantId);
        PaymentGateway gateway = gateways.forTenant(tenantId)
                .orElseThrow(() -> ConflictException.of(GatewayErrorCode.PAYMENT_GATEWAY_NOT_CONFIGURED,
                        "error.payment.gateway.notConfigured"));
        Money requested = validated(amount, tenant);

        // One open hand-off per citizen per municipality, settled BEFORE a second payment row exists.
        // An `Idempotency-Key` is optional on this route, so a key cannot be what prevents a double tap
        // from becoming two charges — this can. Same amount: they get the page they were already sent to.
        // Different amount: the old attempt is asked about one last time (so a citizen who did pay ends up
        // credited) and then closed, because a person who has just asked for a different figure is not
        // going back to the old one.
        Optional<PaymentCheckout> inFlight = checkouts.findOpenOf(tenantId, userId)
                .filter(open -> !open.isExpiredAt(clock.instant()));
        if (inFlight.isPresent()) {
            Payment earlier = payments.require(tenantId, inFlight.get().getPaymentId());
            if (earlier.getGrossAmountMinor() == requested.minorUnits()
                    && earlier.getStatus() == PaymentState.PENDING) {
                return new Started(inFlight.get(), earlier, false);
            }
            abandon(inFlight.get());
        }

        String idempotencyKey = clientIdempotencyKey == null || clientIdempotencyKey.isBlank()
                ? "card-topup:" + UUID.randomUUID()
                : clientIdempotencyKey.trim();

        Payment payment = payments.begin(tenantId, userId.value(), PaymentMethod.CARD, gateway.providerId(),
                null, idempotencyKey, requested, PaymentPurpose.WALLET_TOPUP, userId.value());

        // Already dealt with: the caller retried a key whose payment is finished. Answering with the
        // existing state beats opening a second checkout for a charge that already happened.
        if (payment.getStatus() != PaymentState.PENDING) {
            Optional<PaymentCheckout> existing = handoffOf(tenantId, payment.getId());
            if (existing.isPresent()) {
                return new Started(existing.get(), payment, false);
            }
            throw ConflictException.of(GatewayErrorCode.PAYMENT_CHECKOUT_CLOSED,
                    "error.payment.checkout.closed");
        }

        Optional<PaymentCheckout> reused = handoffOf(tenantId, payment.getId());
        if (reused.isPresent() && reused.get().getState().isOpen()) {
            // Same attempt, same hand-off. A citizen who double-tapped goes back to the page they were
            // already sent to instead of being charged twice.
            return new Started(reused.get(), payment, false);
        }

        String returnToken = checkouts.newReturnToken();
        PaymentGateway.CheckoutRequest request = new PaymentGateway.CheckoutRequest(
                tenantId, payment.getId(), requested, PaymentPurpose.WALLET_TOPUP,
                descriptionFor(tenant), returnUrl(returnToken), cancelUrl(), locale, idempotencyKey,
                userId.value().toString(), customerEmail);

        PaymentGateway.Handoff handoff;
        try {
            handoff = gateway.createCheckout(request);
        } catch (GatewayException failure) {
            // The distinction the flag exists for. Unreachable means we do not know, so the attempt stays
            // PENDING and the sweep asks again — marking it failed would tell a citizen their payment was
            // refused when nobody ever asked. Rejected means the provider understood us and said no, so
            // nothing was charged and the attempt is closed honestly instead of sitting in the treasurer's
            // "charged and never settled" list.
            if (failure.retryable()) {
                LOGGER.warn("Gateway {} unreachable while opening a checkout for payment {}: {}. Left "
                        + "pending.", gateway.providerId(), payment.getId(), failure.getMessage());
            } else {
                LOGGER.error("Gateway {} rejected the checkout request for payment {}: {}. Nothing was "
                        + "charged.", gateway.providerId(), payment.getId(), failure.getMessage());
                payments.fail(tenantId, payment.getId(), "CHECKOUT_REJECTED", failure.getMessage());
            }
            throw ConflictException.of(GatewayErrorCode.PAYMENT_GATEWAY_UNAVAILABLE,
                    "error.payment.gateway.unavailable");
        }

        PaymentCheckout checkout = checkouts.open(tenantId, payment.getId(), userId, gateway.providerId(),
                handoff, returnToken, properties.checkoutTtl());
        return new Started(checkout, payment, true);
    }

    /**
     * Asks the provider what happened and acts on the answer. The only path that credits.
     *
     * <p>Idempotent from end to end, because it is reached from three directions and from retries of
     * each. Nothing here reads a result from its caller.</p>
     */
    @Transactional
    public Resolution resolve(PaymentCheckout checkout) {
        TenantId tenantId = TenantId.of(checkout.getTenantId());
        PaymentGateway gateway = gateways.byProviderId(checkout.getProvider())
                .orElseThrow(() -> ConflictException.of(GatewayErrorCode.PAYMENT_GATEWAY_NOT_CONFIGURED,
                        "error.payment.gateway.notConfigured"));

        checkouts.recordPoll(checkout.getId());
        Optional<PaymentGateway.Snapshot> answer = gateway.fetchStatus(tenantId,
                checkout.getProviderReference());
        if (answer.isEmpty()) {
            // The provider does not know this reference. Information, but not a failure: concluding
            // anything from it would be concluding from an absence, about money.
            LOGGER.warn("Gateway {} does not know reference {}; leaving payment {} pending.",
                    checkout.getProvider(), checkout.getProviderReference(), checkout.getPaymentId());
            return new Resolution(GatewayOutcome.UNKNOWN, false);
        }

        PaymentGateway.Snapshot snapshot = answer.get();
        Payment payment = payments.require(tenantId, checkout.getPaymentId());

        switch (snapshot.outcome()) {
            case CAPTURED -> {
                boolean credited = credit(tenantId, checkout, payment, snapshot);
                checkouts.complete(checkout.getId(), snapshot);
                return new Resolution(GatewayOutcome.CAPTURED, credited);
            }
            case FAILED -> {
                if (payment.getStatus().canMoveTo(PaymentState.FAILED)) {
                    payments.fail(tenantId, payment.getId(), snapshot.failureCode(), snapshot.failureReason());
                }
                checkouts.complete(checkout.getId(), snapshot);
                return new Resolution(GatewayOutcome.FAILED, false);
            }
            case CANCELLED -> {
                moveTo(tenantId, payment, snapshot.outcome());
                checkouts.complete(checkout.getId(), snapshot);
                return new Resolution(GatewayOutcome.CANCELLED, false);
            }
            case AUTHORIZED -> {
                // Earmarked, not taken. The hand-off stays open because there is still something to wait
                // for, and nothing is credited: the money is not the municipality's yet.
                moveTo(tenantId, payment, snapshot.outcome());
                return new Resolution(GatewayOutcome.AUTHORIZED, false);
            }
            case REFUNDED, CHARGED_BACK -> {
                // Out of scope until the effect on a spent balance is decided (ADR 0023). Recorded on the
                // payment and loudly logged rather than silently ignored: money went back and somebody
                // has to know.
                LOGGER.error("Gateway {} reports {} for payment {}. Refunds and charge-backs are not "
                                + "handled yet; the balance was NOT adjusted.", checkout.getProvider(),
                        snapshot.outcome(), payment.getId());
                return new Resolution(snapshot.outcome(), false);
            }
            default -> {
                return new Resolution(snapshot.outcome(), false);
            }
        }
    }

    /** For the webhook, which arrives with a provider and a reference and no municipality. */
    @Transactional
    public Optional<Resolution> resolveByReference(String provider, String providerReference) {
        return checkouts.findByProviderReference(provider, providerReference).map(this::resolve);
    }

    /**
     * Stops waiting on a hand-off whose window has closed.
     *
     * <p>Asks once more first, because the most common reason for silence is a citizen who paid and lost
     * their connection — and that person must end up credited without ringing the municipality.</p>
     */
    @Transactional
    public Resolution abandon(PaymentCheckout checkout) {
        Resolution resolution;
        try {
            resolution = resolve(checkout);
        } catch (RuntimeException failure) {
            LOGGER.warn("Final check of checkout {} failed; expiring it anyway.", checkout.getId(), failure);
            resolution = new Resolution(GatewayOutcome.UNKNOWN, false);
        }
        if (resolution.outcome().isResolved()) {
            return resolution;
        }
        TenantId tenantId = TenantId.of(checkout.getTenantId());
        Payment payment = payments.require(tenantId, checkout.getPaymentId());
        if (payment.getStatus().canMoveTo(PaymentState.CANCELLED)) {
            payments.transition(tenantId, payment.getId(), PaymentState.CANCELLED);
        }
        checkouts.expire(checkout.getId());
        return new Resolution(GatewayOutcome.CANCELLED, false);
    }

    /**
     * Moves the record to wherever this outcome maps, and nowhere if it maps to nothing.
     *
     * <p>The translation lives in {@link GatewayOutcome#toPaymentState()} and is not restated here: it is
     * the conversion that decides whether money moves, and two copies of it is one copy that will be
     * wrong. An outcome that maps to no state — pending, unrecognised — correctly does nothing.</p>
     */
    private void moveTo(TenantId tenantId, Payment payment, GatewayOutcome outcome) {
        outcome.toPaymentState()
                .filter(target -> payment.getStatus().canMoveTo(target))
                .ifPresent(target -> payments.transition(tenantId, payment.getId(), target));
    }

    /**
     * Credits the balance through the one transaction that owns both halves.
     *
     * @return true when this call is what credited it, false when it had already been credited
     */
    private boolean credit(TenantId tenantId, PaymentCheckout checkout, Payment payment,
                           PaymentGateway.Snapshot snapshot) {
        if (payment.getStatus().isCaptured()) {
            return false;
        }
        // The key the attempt was opened with. It is what makes the call below find THIS payment rather
        // than begin a second one — see the class comment.
        String idempotencyKey = payment.getIdempotencyKey();
        TopupPaymentService.Result result = topups.topUp(tenantId, UserId.of(checkout.getUserId()),
                payment.getGross(), idempotencyKey, WalletTopupSource.CITIZEN,
                checkout.getProviderReference(), UserId.of(checkout.getUserId()), snapshot.fee());
        return !result.alreadyApplied();
    }

    private Optional<PaymentCheckout> handoffOf(TenantId tenantId, UUID paymentId) {
        return checkouts.findByPayment(tenantId, paymentId);
    }

    /**
     * The amount, checked against what this deployment accepts as one top-up.
     *
     * <p>The currency is the municipality's and is never taken from the request: a client that could
     * name a currency could pay ₡5.000 worth of a stronger one.</p>
     */
    private Money validated(Money amount, Tenant tenant) {
        if (amount == null || !amount.isPositive()) {
            throw UnprocessableEntityException.of(GatewayErrorCode.TOPUP_AMOUNT_NOT_ALLOWED,
                    "error.payment.topup.amountNotAllowed");
        }
        Money inTenantCurrency = Money.ofMinor(amount.minorUnits(), tenant.getCurrencyCode());
        if (inTenantCurrency.minorUnits() < properties.minTopupMinor()
                || inTenantCurrency.minorUnits() > properties.maxTopupMinor()) {
            throw UnprocessableEntityException.of(GatewayErrorCode.TOPUP_AMOUNT_NOT_ALLOWED,
                    "error.payment.topup.amountNotAllowed");
        }
        return inTenantCurrency;
    }

    /**
     * What the citizen reads on the provider's page and, later, on their card statement.
     *
     * <p>The municipality's short name first, then its display name, then the platform's: the line on a
     * bank statement is famously narrow, and the name a citizen will recognise there is the council's,
     * not ours. Truncated to 22 characters, which is what card networks pass through — a longer string
     * is not rejected, it is silently cut, and being cut by us is at least predictable.</p>
     */
    private String descriptionFor(Tenant tenant) {
        String name = firstNonBlank(tenant.getShortName(), tenant.getDisplayName(), tenant.getLegalName(),
                "LupaRX");
        return name.length() <= STATEMENT_DESCRIPTOR_LIMIT
                ? name
                : name.substring(0, STATEMENT_DESCRIPTOR_LIMIT).trim();
    }

    private static String firstNonBlank(String... candidates) {
        for (String candidate : candidates) {
            if (candidate != null && !candidate.isBlank()) {
                return candidate.trim();
            }
        }
        return "LupaRX";
    }

    private String returnUrl(String returnToken) {
        return citizenBaseUrl() + properties.returnPath() + "?token="
                + URLEncoder.encode(returnToken, StandardCharsets.UTF_8);
    }

    private String cancelUrl() {
        return citizenBaseUrl() + properties.returnPath() + "?cancelled=1";
    }

    /**
     * The citizen portal's origin, taken from the same place the email links use.
     *
     * <p>One value to be right about rather than two that can disagree — the day somebody moves the
     * portal, a second copy of its URL is a link that quietly goes nowhere.</p>
     */
    private String citizenBaseUrl() {
        String configured = mailProperties.baseUrls() == null
                ? null
                : mailProperties.baseUrls().get("citizen");
        String base = configured == null || configured.isBlank() ? "http://localhost:5183" : configured.trim();
        return base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
    }

    /**
     * A hand-off ready to be followed.
     *
     * @param opened false when an earlier identical request had already opened this one
     */
    public record Started(PaymentCheckout checkout, Payment payment, boolean opened) {
    }

    /**
     * What the provider answered, and whether this call is what credited the balance.
     *
     * @param credited true exactly once across every retry, which is what a caller needs to decide
     *                 whether to tell the citizen "credited" or "already credited"
     */
    public record Resolution(GatewayOutcome outcome, boolean credited) {
    }
}
