package cr.luparx.app.web;

import cr.luparx.app.payments.WalletCheckoutService;
import cr.luparx.billing.entity.GatewayNotification;
import cr.luparx.billing.entity.PaymentCheckout;
import cr.luparx.billing.port.GatewayException;
import cr.luparx.billing.port.PaymentGateway;
import cr.luparx.billing.port.PaymentGatewayRegistry;
import cr.luparx.billing.service.PaymentCheckoutService;
import cr.luparx.core.id.TenantId;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Where a payment provider tells us something (ADR 0023 §3).
 *
 * <h2>La única ruta no autenticada que puede terminar moviendo plata</h2>
 *
 * <p>Which is why it does as little as possible. It stores what arrived, verifies who sent it, and then
 * — whatever the body claimed — <b>asks the provider</b> what actually happened. Nothing in the request
 * decides anything: the amount in the payload is not read, the outcome in the payload is not believed,
 * and the municipality is not taken from it but found by looking the reference up.</p>
 *
 * <p>That is not excess caution. One of the providers surveyed authenticates its webhooks with a shared
 * secret in a header — no signature over the body, no timestamp, no event id. Crediting a balance from
 * such a payload would hand money to anybody who can replay a POST.</p>
 *
 * <h2>Qué responde y por qué</h2>
 *
 * <p>204 for anything accepted, <b>including a duplicate</b>, because a provider that retries must be
 * able to stop. 400 only when the sender could not be authenticated or the body could not be read — the
 * two cases where retrying the same thing cannot help. A notification that was stored but could not be
 * acted on still answers 204: the periodic sweep covers that payment anyway, and telling a provider to
 * retry forever over a fault of ours is how a webhook endpoint becomes a denial of service against
 * itself.</p>
 *
 * <p><b>Pendiente:</b> rate limiting at the edge. This route is reachable by anyone who knows the URL,
 * and while a flood cannot move money, it can fill a table. It belongs in front of the application (the
 * reverse proxy), and the note in {@code docs/} records it.</p>
 */
@RestController
@RequestMapping("/api/v1/webhooks/payments")
@Tag(name = "Webhooks · Payments", description = "Provider notifications. Authenticated by signature, never by token.")
public class PaymentGatewayWebhookController {

    private static final Logger LOGGER = LoggerFactory.getLogger(PaymentGatewayWebhookController.class);

    private final PaymentGatewayRegistry gateways;
    private final PaymentCheckoutService checkouts;
    private final WalletCheckoutService checkoutService;

    public PaymentGatewayWebhookController(PaymentGatewayRegistry gateways, PaymentCheckoutService checkouts,
                                           WalletCheckoutService checkoutService) {
        this.gateways = gateways;
        this.checkouts = checkouts;
        this.checkoutService = checkoutService;
    }

    @PostMapping(value = "/{provider}", consumes = "*/*")
    @Operation(summary = "Receive a provider notification (authenticated by signature)")
    public ResponseEntity<Void> receive(@PathVariable String provider,
                                        @RequestBody(required = false) byte[] body,
                                        HttpServletRequest request) {
        Optional<PaymentGateway> gateway = gateways.byProviderId(provider);
        if (gateway.isEmpty()) {
            // Not a secret: the provider itself was given this URL. A 404 here is a misconfiguration
            // signal for whoever is integrating, which is exactly who needs to see it.
            LOGGER.warn("Notification for unknown payment provider {}.", provider);
            return ResponseEntity.notFound().build();
        }

        PaymentGateway.RawNotification raw = new PaymentGateway.RawNotification(
                request.getRequestURI(), headersOf(request), body == null ? new byte[0] : body);

        PaymentGateway.Notification parsed = null;
        boolean verified = false;
        String rejection = null;
        try {
            parsed = gateway.get().parseNotification(raw);
            verified = true;
        } catch (GatewayException refused) {
            rejection = refused.getMessage();
            LOGGER.warn("Refused a notification from {}: {}", provider, rejection);
        }

        // Stored before anything is decided, and stored even when it did not verify: a forgery attempt
        // that leaves no trace is one nobody notices.
        Optional<GatewayNotification> stored = checkouts.record(gateway.get().providerId(), raw, parsed,
                verified);
        if (stored.isEmpty()) {
            // Already seen. Nothing happens, which is what makes a provider's retries free.
            return ResponseEntity.noContent().build();
        }
        if (!verified) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }

        try {
            Optional<PaymentCheckout> checkout = checkouts.findByProviderReference(
                    gateway.get().providerId(), parsed.providerReference());
            if (checkout.isEmpty()) {
                // A reference we never opened. Recorded as a finding rather than dropped: it is either a
                // provider talking to the wrong deployment or somebody probing, and both are worth seeing.
                checkouts.markFailed(stored.get().getId(), "no checkout for that reference");
                LOGGER.warn("Notification from {} references unknown checkout {}.", provider,
                        parsed.providerReference());
                return ResponseEntity.noContent().build();
            }
            WalletCheckoutService.Resolution resolution = checkoutService.resolve(checkout.get());
            checkouts.markProcessed(stored.get().getId(), TenantId.of(checkout.get().getTenantId()),
                    checkout.get().getPaymentId());
            LOGGER.info("Notification from {} for payment {} resolved as {} (credited={}).", provider,
                    checkout.get().getPaymentId(), resolution.outcome(), resolution.credited());
        } catch (RuntimeException failure) {
            // Left unprocessed on purpose: the sweep of open hand-offs will ask the provider again, so a
            // notification we fumbled is not the money's only chance.
            checkouts.markFailed(stored.get().getId(), failure.getMessage());
            LOGGER.error("Could not act on a notification from {}; the periodic sweep will retry.", provider,
                    failure);
        }
        return ResponseEntity.noContent().build();
    }

    private static Map<String, List<String>> headersOf(HttpServletRequest request) {
        Map<String, List<String>> headers = new HashMap<>();
        Enumeration<String> names = request.getHeaderNames();
        while (names != null && names.hasMoreElements()) {
            String name = names.nextElement();
            List<String> values = new ArrayList<>();
            Enumeration<String> each = request.getHeaders(name);
            while (each != null && each.hasMoreElements()) {
                values.add(each.nextElement());
            }
            headers.put(name, Collections.unmodifiableList(values));
        }
        return headers;
    }
}
