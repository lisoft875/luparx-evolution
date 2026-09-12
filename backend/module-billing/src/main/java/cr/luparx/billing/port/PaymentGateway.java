package cr.luparx.billing.port;

import cr.luparx.billing.model.PaymentPurpose;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.money.Money;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * The one door to a card processor (ADR 0023).
 *
 * <h2>Cuatro operaciones y ninguna más</h2>
 *
 * <p>The port was drawn against three providers rather than one — Tilopay's signed hosted page,
 * ONVO Pay's payment intents, BAC Credomatic's redirect — because a port shaped like one gateway's
 * vocabulary is a port that gets rebuilt for the second one. Both market shapes reduce to the same
 * four moves, and everything provider-specific stays inside the implementation.</p>
 *
 * <h2>El PAN no pasa por aquí</h2>
 *
 * <p>There is no card number in any type on this interface, and there must never be one. The citizen
 * types their card on the provider's own page ({@link #createCheckout}), which keeps LupaRX at PCI
 * DSS SAQ A. A future method taking a card number is not a feature, it is a finding.</p>
 *
 * <h2>La notificación avisa, el proveedor confirma</h2>
 *
 * <p>{@link Notification} deliberately carries no amount and no money at all: it says only <em>which
 * payment to go and ask about</em>. That is enforced by the type because one of the providers
 * surveyed authenticates its webhooks with a shared secret in a header, with no body signature and
 * no event id — believing such a payload would mean crediting a wallet to whoever can replay a POST.
 * The authority on what happened is always {@link #fetchStatus}.</p>
 *
 * <p><b>Refunds and charge-backs are not here yet</b> and that is deliberate: {@code PaymentState}
 * models them, but their effect on a balance that has already been spent is an open business
 * decision. When it is made, they arrive as methods on this interface.</p>
 */
public interface PaymentGateway {

    /**
     * Stable identifier of the provider, upper case, no spaces.
     *
     * <p>Written into {@code payments.provider} and into the webhook path, so it is part of the
     * platform's external surface: it is chosen once and never renamed, because the value is in rows
     * that a reconciliation joins on years later.</p>
     */
    String providerId();

    /** The card schemes this provider accepts, for the interface that has to say so before charging. */
    Set<CardNetwork> supportedNetworks();

    /**
     * Opens a hosted checkout and hands back where to send the citizen.
     *
     * <p>Must be idempotent on {@link CheckoutRequest#idempotencyKey()}: a citizen who double-taps
     * gets one checkout, not two charges. Implementations that cannot get idempotency from the
     * provider must achieve it themselves before calling it.</p>
     *
     * @throws GatewayException unavailable when the provider could not be reached — the caller must
     *                          not conclude anything about the money from that
     */
    Handoff createCheckout(CheckoutRequest request);

    /**
     * Authenticates an incoming notification and says which payment it is about.
     *
     * <p>Implementations verify whatever the provider gives them to verify — an HMAC over the body, a
     * shared secret, a timestamp window — and {@link GatewayException#rejected} anything that does not
     * check out. They must not perform I/O: this runs on the request thread of an unauthenticated
     * endpoint, and a provider that can make us call out by posting to it is an SSRF.</p>
     */
    Notification parseNotification(RawNotification raw);

    /**
     * Asks the provider what actually happened. The authority for every credit.
     *
     * <p>An empty result means the provider does not know this reference — which is itself
     * information, and not the same as a failure. A provider that is down throws instead.</p>
     */
    Optional<Snapshot> fetchStatus(TenantId tenantId, String providerReference);

    /**
     * What we ask a provider to collect.
     *
     * @param paymentId    our own attempt, already recorded before anybody was contacted. Travels so
     *                     the provider's statement can be traced back without depending on its own id
     * @param description  what the citizen will read on the provider's page and on their statement.
     *                     Localised by the caller; providers do not translate
     * @param returnUrl    where the citizen comes back to. <b>Carries no result</b> — see ADR 0023 §4
     * @param locale       the citizen's language, so the provider's page is not in ours
     * @param customerEmail the only personal datum that leaves the platform, and only because
     *                      providers send the receipt. Nothing else about the person is sent
     */
    record CheckoutRequest(TenantId tenantId,
                           UUID paymentId,
                           Money amount,
                           PaymentPurpose purpose,
                           String description,
                           String returnUrl,
                           String cancelUrl,
                           Locale locale,
                           String idempotencyKey,
                           String customerReference,
                           String customerEmail) {
    }

    /**
     * Where to send the citizen, and under which reference the provider filed it.
     *
     * @param providerReference the provider's identity for this attempt. The key of both the
     *                          idempotency and the later reconciliation, so it is stored immediately
     * @param redirectUrl       absolute URL on the provider's domain
     * @param expiresAt         when the provider will stop honouring it, when it says. Null if not
     * @param metadata          small provider-specific values worth keeping for support, never secrets
     */
    record Handoff(String providerReference, String redirectUrl, Instant expiresAt,
                   Map<String, String> metadata) {

        public Handoff {
            metadata = metadata == null ? Map.of() : Map.copyOf(metadata);
        }
    }

    /**
     * An unauthenticated HTTP request that claims to come from a provider.
     *
     * <p>The body is kept as bytes, not as a parsed object: a signature is computed over the exact
     * bytes received, and re-serialising JSON to verify it is how signature checks quietly stop
     * checking anything.</p>
     */
    record RawNotification(String path, Map<String, List<String>> headers, byte[] body) {

        public RawNotification {
            headers = headers == null ? Map.of() : Map.copyOf(headers);
            body = body == null ? new byte[0] : body.clone();
        }

        @Override
        public byte[] body() {
            return body.clone();
        }

        public String bodyAsText() {
            return new String(body, java.nio.charset.StandardCharsets.UTF_8);
        }

        /** Case-insensitive, because HTTP header names are and proxies rewrite their casing. */
        public Optional<String> header(String name) {
            if (name == null) {
                return Optional.empty();
            }
            for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
                if (entry.getKey() != null && entry.getKey().equalsIgnoreCase(name)
                        && entry.getValue() != null && !entry.getValue().isEmpty()) {
                    return Optional.ofNullable(entry.getValue().get(0));
                }
            }
            return Optional.empty();
        }
    }

    /**
     * A verified notification: which payment changed, and nothing about money.
     *
     * <p>The absence of an amount here is the design, not an omission. See the class comment.</p>
     *
     * @param providerEventId the provider's id for the event, when it has one. Null is common, and the
     *                        caller then de-duplicates on a hash of the body
     * @param outcome         what the provider claims. A hint used to decide whether to ask, never to
     *                        decide whether to credit
     */
    record Notification(String providerEventId, String providerReference, GatewayOutcome outcome,
                        Instant occurredAt) {
    }

    /**
     * What the provider says about one attempt, asked directly. The authority.
     *
     * @param fee               what the provider kept, when it declares it at this point. Cards often
     *                          do not, and the statement corrects it later (ADR 0019)
     * @param cardLast4         the last four digits, which is what a citizen recognises on their own
     *                          statement. Storing these four is permitted; storing more is not
     * @param authorizationCode the issuer's approval code, the thing a bank asks for in a dispute
     * @param failureCode       the provider's own code, kept verbatim: translating it loses the datum
     *                          a claim is made with
     */
    record Snapshot(String providerReference,
                    GatewayOutcome outcome,
                    Money gross,
                    Money fee,
                    CardNetwork network,
                    String cardLast4,
                    String authorizationCode,
                    String failureCode,
                    String failureReason,
                    Instant occurredAt) {
    }
}
