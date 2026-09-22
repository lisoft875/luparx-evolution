package cr.luparx.app.payments;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import cr.luparx.app.config.PaymentsProperties;
import cr.luparx.billing.port.CardNetwork;
import cr.luparx.billing.port.GatewayException;
import cr.luparx.billing.port.GatewayOutcome;
import cr.luparx.billing.port.PaymentGateway;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.money.Money;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * A card processor that does not exist, behaving like one that does (ADR 0023 §6).
 *
 * <h2>Es un proveedor, no un atajo</h2>
 *
 * <p>It implements the same port as a real gateway and exercises the whole path: a redirect to a
 * payment page on another URL, test cards with deterministic answers, a 3-D Secure challenge, a return
 * that carries no result, and a signed notification posted back to this API. There is no
 * {@code if (dev) creditWallet()} anywhere — that shortcut would make every test green about a flow
 * nobody had actually run.</p>
 *
 * <h2>Dónde es deliberadamente fiel</h2>
 *
 * <ul>
 *   <li><b>No declara comisión al capturar.</b> Cards usually do not, and the statement corrects the net
 *       later (ADR 0019). A simulator that declared one would leave the "net is provisional" path in the
 *       reconciliation untested — the path the real thing always takes.</li>
 *   <li><b>Firma sus notificaciones y exige ventana de tiempo.</b> If the simulator sent an
 *       unauthenticated POST, the verification code would never run in development and would first run
 *       in production.</li>
 *   <li><b>Guarda su estado en la base.</b> A static map would work until there were two instances.</li>
 *   <li><b>Ignora el tenant en {@link #fetchStatus}.</b> A gateway does not know what a municipality
 *       is. Accepting the argument and not using it is the honest shape.</li>
 * </ul>
 *
 * <h2>El secreto de firma es una constante, y sólo aquí</h2>
 *
 * <p>{@link #DEV_SIGNING_SECRET} is fixed and in the source, which would be indefensible for a real
 * provider and is fine for this one: the bean is registered only when {@code luparx.payments.provider}
 * is {@code simulated}, there is no money behind it, and the alternative — a per-instance random —
 * would break the moment a second instance verified a notification signed by the first. A real
 * adapter's secret comes from the municipality's own credentials, never from here.</p>
 */
@Component
// Two locks, and the profile is the one that matters. `luparx.payments.provider` defaults to
// `simulated` so that a developer who configures nothing still gets a working flow — which means the
// property ALONE would leave a deployment that forgot to set it collecting through a gateway that
// charges nothing. The profile closes that: only `dev` and `demo` register this bean (demo is
// staging, where the fake gateway lets a tester run the whole card flow). In PRODUCTION — any other
// profile — the bean does not exist whatever the property says, and the registry then reports no
// gateway wired instead of pretending to have one. The day a real municipality collects for real,
// its profile must NOT be `demo`.
@Profile({"dev", "demo"})
@ConditionalOnProperty(name = "luparx.payments.provider", havingValue = PaymentsProperties.SIMULATED,
        matchIfMissing = true)
public class SimulatedPaymentGateway implements PaymentGateway {

    /** Written into {@code payments.provider}. Chosen once: reconciliations join on this value. */
    public static final String PROVIDER_ID = "SIMULATED";

    public static final String SIGNATURE_HEADER = "X-Luparx-Sim-Signature";
    public static final String TIMESTAMP_HEADER = "X-Luparx-Sim-Timestamp";
    public static final String EVENT_ID_HEADER = "X-Luparx-Sim-Event-Id";

    /** Development-only shared secret. See the class comment for why a constant is acceptable here. */
    static final String DEV_SIGNING_SECRET = "luparx-simulated-gateway-dev-secret";

    /** How stale a notification may be before it is refused. Replay protection, exercised on purpose. */
    static final Duration SIGNATURE_TOLERANCE = Duration.ofMinutes(5);

    private static final Logger LOGGER = LoggerFactory.getLogger(SimulatedPaymentGateway.class);
    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final SimulatedChargeRepository charges;
    private final PaymentsProperties properties;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public SimulatedPaymentGateway(SimulatedChargeRepository charges, PaymentsProperties properties,
                                   ObjectMapper objectMapper, Clock clock) {
        this.charges = charges;
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.clock = clock;
        LOGGER.warn("Payment provider SIMULATED is active (dev profile only). No card is charged and no "
                + "money moves; a real adapter is needed before taking real payments.");
    }

    @Override
    public String providerId() {
        return PROVIDER_ID;
    }

    @Override
    public Set<CardNetwork> supportedNetworks() {
        return Set.of(CardNetwork.VISA, CardNetwork.MASTERCARD);
    }

    @Override
    @Transactional
    public Handoff createCheckout(CheckoutRequest request) {
        Instant now = clock.instant();
        // Idempotency from the provider's side, which is where it belongs: a citizen who double-taps
        // reaches the same charge, exactly as a real gateway would answer.
        if (request.idempotencyKey() != null && !request.idempotencyKey().isBlank()) {
            Optional<SimulatedCharge> existing = charges.findByIdempotencyKey(request.idempotencyKey());
            if (existing.isPresent()) {
                SimulatedCharge charge = existing.get();
                return new Handoff(charge.getProviderReference(), pageUrl(charge.getProviderReference()),
                        charge.getExpiresAt(), Map.of("simulated", "true"));
            }
        }
        String reference = "SIM-" + UUID.randomUUID().toString().replace("-", "").substring(0, 20)
                .toUpperCase(java.util.Locale.ROOT);
        Instant expiresAt = now.plus(properties.checkoutTtl());
        SimulatedCharge charge = new SimulatedCharge(reference, request.tenantId().value(),
                request.paymentId(), request.idempotencyKey(), request.amount().minorUnits(),
                request.amount().currencyCode(), truncate(request.description(), 200),
                request.returnUrl(), now, expiresAt);
        charges.save(charge);
        return new Handoff(reference, pageUrl(reference), expiresAt, Map.of("simulated", "true"));
    }

    /**
     * Verifies the signature over the exact bytes received, then says which charge it is about.
     *
     * <p>No I/O here, as the port requires: this runs on the thread of an unauthenticated endpoint, and
     * a provider that could make us call out by posting to us would be an SSRF.</p>
     */
    @Override
    public Notification parseNotification(RawNotification raw) {
        String signature = raw.header(SIGNATURE_HEADER)
                .orElseThrow(() -> GatewayException.rejected(PROVIDER_ID, "missing signature header"));
        String timestamp = raw.header(TIMESTAMP_HEADER)
                .orElseThrow(() -> GatewayException.rejected(PROVIDER_ID, "missing timestamp header"));

        Instant sentAt;
        try {
            sentAt = Instant.parse(timestamp);
        } catch (RuntimeException malformed) {
            throw GatewayException.rejected(PROVIDER_ID, "unparseable timestamp header");
        }
        Duration age = Duration.between(sentAt, clock.instant()).abs();
        if (age.compareTo(SIGNATURE_TOLERANCE) > 0) {
            // A valid signature on an old body is a replay. Refused here rather than deduplicated later,
            // because the point of a window is to make a captured request stop working.
            throw GatewayException.rejected(PROVIDER_ID, "notification outside the accepted time window");
        }

        String expected = sign(timestamp + "." + raw.bodyAsText());
        // Constant time: a comparison that returns early leaks how much of a guess was right.
        if (!MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                signature.getBytes(StandardCharsets.UTF_8))) {
            throw GatewayException.rejected(PROVIDER_ID, "signature mismatch");
        }

        JsonNode body;
        try {
            body = objectMapper.readTree(raw.body());
        } catch (Exception malformed) {
            throw GatewayException.rejected(PROVIDER_ID, "unparseable notification body");
        }
        String reference = text(body, "reference");
        if (reference == null) {
            throw GatewayException.rejected(PROVIDER_ID, "notification without a reference");
        }
        GatewayOutcome claimed = outcomeOf(text(body, "outcome"));
        String eventId = raw.header(EVENT_ID_HEADER).orElse(text(body, "eventId"));
        return new Notification(eventId, reference, claimed, sentAt);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Snapshot> fetchStatus(TenantId tenantId, String providerReference) {
        return charges.findById(providerReference).map(charge -> {
            GatewayOutcome outcome = charge.getOutcome();
            // A charge nobody ever completed is not pending for ever. A real provider expires its own
            // sessions, and a simulator that did not would leave the sweep asking about it until the
            // attempt ceiling, which is a false picture of a healthy provider.
            if (!charge.isResolved() && charge.isExpiredAt(clock.instant())) {
                outcome = GatewayOutcome.CANCELLED;
            }
            return new Snapshot(
                    charge.getProviderReference(),
                    outcome,
                    Money.ofMinor(charge.getAmountMinor(), charge.getCurrencyCode()),
                    // No fee declared at capture, deliberately. See the class comment.
                    null,
                    charge.getNetwork() == null ? CardNetwork.UNKNOWN : charge.getNetwork(),
                    charge.getCardLast4(),
                    charge.getAuthorizationCode(),
                    charge.getFailureCode(),
                    charge.getFailureReason(),
                    charge.getResolvedAt() == null ? charge.getUpdatedAt() : charge.getResolvedAt());
        });
    }

    /** Where the simulated payment page for this charge lives. A real provider's is on its own domain. */
    public String pageUrl(String providerReference) {
        return properties.apiBaseUrl() + "/dev/payments/checkout/" + providerReference;
    }

    /** HMAC-SHA256 over "{timestamp}.{body}", hex. The shape most providers use. */
    public String sign(String payload) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(DEV_SIGNING_SECRET.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            return HexFormat.of().formatHex(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException impossible) {
            throw new IllegalStateException("HMAC-SHA256 is required by the Java platform", impossible);
        }
    }

    private static GatewayOutcome outcomeOf(String value) {
        if (value == null || value.isBlank()) {
            return GatewayOutcome.UNKNOWN;
        }
        for (GatewayOutcome outcome : GatewayOutcome.values()) {
            if (outcome.name().equalsIgnoreCase(value.trim())) {
                return outcome;
            }
        }
        return GatewayOutcome.UNKNOWN;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() || value.asText().isBlank() ? null : value.asText();
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }
}
