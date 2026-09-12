package cr.luparx.app.web;

import cr.luparx.app.payments.SimulatedCharge;
import cr.luparx.app.payments.SimulatedChargeRepository;
import cr.luparx.app.payments.SimulatedPaymentGateway;
import cr.luparx.app.payments.SimulatedTestCard;
import cr.luparx.app.config.PaymentsProperties;
import cr.luparx.billing.port.GatewayOutcome;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * The simulated provider's payment page — <b>development only</b> (ADR 0023 §6).
 *
 * <h2>Es la página de un proveedor, no una pantalla de LupaRX</h2>
 *
 * <p>It stands where a gateway's hosted page stands: the citizen arrives here from a redirect, types a
 * test card, and is sent back to the citizen portal with <b>no result in the URL</b>. Then, as a real
 * provider would, it posts a signed notification to this API's webhook. Every step of the production
 * path is therefore exercised in development — the signature check, the replay window, the "ask the
 * provider" rule, the return that carries nothing.</p>
 *
 * <h2>Por qué es seguro</h2>
 *
 * <p>The bean exists only under the {@code dev} profile: in any other profile the class is not registered
 * and the route answers 404 — not 403, which would at least confirm that a page which approves payments
 * is somewhere in the build. Stronger than a flag inside the handler, because there is no code path.</p>
 *
 * <p>The page deliberately carries no bank's or card scheme's branding and says <b>SIMULACIÓN</b> at the
 * top. It is a development fixture, and a development fixture that looked like a real payment page would
 * be a phishing template with our own deployment's URL on it.</p>
 */
@RestController
@RequestMapping("/dev/payments/checkout")
@Profile("dev")
// Also conditional on the provider, not only on the profile: a developer testing a real sandbox in the
// dev profile has no simulated gateway bean, and a page that demanded one would stop the context from
// starting over a fixture.
@ConditionalOnProperty(name = "luparx.payments.provider", havingValue = PaymentsProperties.SIMULATED,
        matchIfMissing = true)
@Hidden
public class DevSimulatedCheckoutController {

    private static final Logger LOGGER = LoggerFactory.getLogger(DevSimulatedCheckoutController.class);

    private final SimulatedChargeRepository charges;
    private final SimulatedPaymentGateway gateway;
    private final Clock clock;
    private final RestClient restClient = RestClient.create();

    public DevSimulatedCheckoutController(SimulatedChargeRepository charges, SimulatedPaymentGateway gateway,
                                          Clock clock) {
        this.charges = charges;
        this.gateway = gateway;
        this.clock = clock;
        LOGGER.warn("Development profile: the simulated payment page is served at /dev/payments/checkout/**. "
                + "It approves payments without charging anything and does not exist in other profiles.");
    }

    @GetMapping(value = "/{reference}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> page(@PathVariable String reference) {
        Optional<SimulatedCharge> found = charges.findById(reference);
        if (found.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .contentType(MediaType.TEXT_HTML)
                    .body(shell("Cobro no encontrado", "<p>Esa referencia no existe en el simulador.</p>"));
        }
        SimulatedCharge charge = found.get();
        if (charge.isResolved()) {
            return ResponseEntity.ok(shell("Cobro ya resuelto",
                    "<p>Este cobro ya terminó con el resultado <code>" + escape(charge.getOutcome().name())
                            + "</code>.</p><p><a href=\"" + escape(charge.getReturnUrl())
                            + "\">Volver a la aplicación</a></p>"));
        }
        if (charge.isChallengePending()) {
            return ResponseEntity.ok(challengePage(charge));
        }
        return ResponseEntity.ok(formPage(charge));
    }

    /**
     * The card was submitted.
     *
     * <p>The outcome comes from the card number, as every real sandbox does it. A 303 sends the citizen
     * back to the portal with nothing but their token — which is the whole point of the exercise.</p>
     */
    @PostMapping("/{reference}")
    @Transactional
    public ResponseEntity<String> pay(@PathVariable String reference,
                                      @RequestParam(value = "card", required = false) String card,
                                      HttpServletRequest request) {
        Optional<SimulatedCharge> found = charges.findById(reference);
        if (found.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .contentType(MediaType.TEXT_HTML)
                    .body(shell("Cobro no encontrado", "<p>Esa referencia no existe en el simulador.</p>"));
        }
        SimulatedCharge charge = found.get();
        if (charge.isResolved()) {
            return redirect(charge.getReturnUrl());
        }

        SimulatedTestCard testCard = SimulatedTestCard.of(card);
        Instant now = clock.instant();

        if (testCard.requiresChallenge() && !charge.isChallengePending()) {
            charge.challenge(testCard.network(), testCard.last4(), now);
            charges.save(charge);
            return ResponseEntity.ok(challengePage(charge));
        }

        apply(charge, testCard, now);
        charges.save(charge);
        notifyBackend(charge, request);
        return redirect(charge.getReturnUrl());
    }

    /** The 3-D Secure step, cleared or abandoned. */
    @PostMapping("/{reference}/challenge")
    @Transactional
    public ResponseEntity<String> challenge(@PathVariable String reference,
                                            @RequestParam(value = "approve", required = false) String approve,
                                            HttpServletRequest request) {
        Optional<SimulatedCharge> found = charges.findById(reference);
        if (found.isEmpty() || found.get().isResolved()) {
            return found.map(charge -> redirect(charge.getReturnUrl()))
                    .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                            .contentType(MediaType.TEXT_HTML)
                            .body(shell("Cobro no encontrado", "<p>Esa referencia no existe.</p>")));
        }
        SimulatedCharge charge = found.get();
        Instant now = clock.instant();
        if ("1".equals(approve)) {
            charge.approve(charge.getNetwork(), charge.getCardLast4(), authorizationCode(), now);
        } else {
            charge.decline(charge.getNetwork(), charge.getCardLast4(), "AUTHENTICATION_FAILED",
                    "No se completó la autenticación del banco emisor.", now);
        }
        charges.save(charge);
        notifyBackend(charge, request);
        return redirect(charge.getReturnUrl());
    }

    /** The citizen walked away from the provider's page. */
    @PostMapping("/{reference}/cancel")
    @Transactional
    public ResponseEntity<String> cancel(@PathVariable String reference, HttpServletRequest request) {
        Optional<SimulatedCharge> found = charges.findById(reference);
        if (found.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .contentType(MediaType.TEXT_HTML)
                    .body(shell("Cobro no encontrado", "<p>Esa referencia no existe.</p>"));
        }
        SimulatedCharge charge = found.get();
        if (!charge.isResolved()) {
            charge.cancel(clock.instant());
            charges.save(charge);
            notifyBackend(charge, request);
        }
        return redirect(charge.getReturnUrl());
    }

    private static void apply(SimulatedCharge charge, SimulatedTestCard card, Instant now) {
        if (card.outcome() == GatewayOutcome.CAPTURED) {
            charge.approve(card.network(), card.last4(), authorizationCode(), now);
        } else {
            charge.decline(card.network(), card.last4(), card.failureCode(), card.failureReason(), now);
        }
    }

    /**
     * Posts a signed notification back to this API, the way a provider would.
     *
     * <p>Synchronous here and asynchronous in reality, which is a fidelity gap worth naming. It does not
     * change what is being tested: the receiving side still verifies a signature, still refuses a stale
     * body, still ignores what the payload claims and asks this simulator for the truth. A failure to
     * deliver is logged and swallowed — a provider whose webhook call fails does not undo the charge, and
     * the periodic sweep is what covers it.</p>
     */
    private void notifyBackend(SimulatedCharge charge, HttpServletRequest request) {
        String timestamp = clock.instant().toString();
        String eventId = "SIMEVT-" + UUID.randomUUID();
        String body = "{\"eventId\":\"" + eventId + "\",\"reference\":\"" + charge.getProviderReference()
                + "\",\"outcome\":\"" + charge.getOutcome().name() + "\"}";
        String signature = gateway.sign(timestamp + "." + body);
        String url = baseUrlOf(request) + "/api/v1/webhooks/payments/" + SimulatedPaymentGateway.PROVIDER_ID;
        try {
            restClient.post()
                    .uri(URI.create(url))
                    .contentType(MediaType.APPLICATION_JSON)
                    .header(SimulatedPaymentGateway.SIGNATURE_HEADER, signature)
                    .header(SimulatedPaymentGateway.TIMESTAMP_HEADER, timestamp)
                    .header(SimulatedPaymentGateway.EVENT_ID_HEADER, eventId)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
            LOGGER.info("Simulated gateway notified {} about {} ({}).", url, charge.getProviderReference(),
                    charge.getOutcome());
        } catch (RuntimeException failure) {
            LOGGER.warn("Simulated gateway could not deliver its notification to {}; the periodic sweep "
                    + "covers it.", url, failure);
        }
    }

    private static String baseUrlOf(HttpServletRequest request) {
        String scheme = request.getScheme();
        int port = request.getServerPort();
        boolean defaultPort = ("http".equals(scheme) && port == 80) || ("https".equals(scheme) && port == 443);
        return scheme + "://" + request.getServerName() + (defaultPort ? "" : ":" + port);
    }

    private static String authorizationCode() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase(java.util.Locale.ROOT);
    }

    private static ResponseEntity<String> redirect(String location) {
        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.LOCATION, location);
        return new ResponseEntity<>(headers, HttpStatus.SEE_OTHER);
    }

    private String formPage(SimulatedCharge charge) {
        StringBuilder options = new StringBuilder();
        for (SimulatedTestCard card : SimulatedTestCard.values()) {
            options.append("<option value=\"").append(card.number()).append("\">")
                    .append(escape(describe(card))).append("</option>");
        }
        String content = """
                <p class="amount">%s %s</p>
                <p class="merchant">%s</p>
                <form method="post" action="/dev/payments/checkout/%s">
                  <label for="card">Tarjeta de prueba</label>
                  <select id="card" name="card">%s</select>
                  <button type="submit" class="primary">Pagar</button>
                </form>
                <form method="post" action="/dev/payments/checkout/%s/cancel">
                  <button type="submit" class="secondary">Cancelar y volver</button>
                </form>
                <p class="ref">Referencia del proveedor: <code>%s</code></p>
                """.formatted(
                escape(charge.getCurrencyCode()), formatAmount(charge.getAmountMinor()),
                escape(charge.getDescription() == null ? "" : charge.getDescription()),
                escape(charge.getProviderReference()), options,
                escape(charge.getProviderReference()), escape(charge.getProviderReference()));
        return shell("Pago simulado", content);
    }

    private String challengePage(SimulatedCharge charge) {
        String content = """
                <p class="amount">%s %s</p>
                <p>El emisor de la tarjeta pide autenticación adicional (3-D Secure simulado).</p>
                <form method="post" action="/dev/payments/checkout/%s/challenge">
                  <input type="hidden" name="approve" value="1">
                  <button type="submit" class="primary">Completar la autenticación</button>
                </form>
                <form method="post" action="/dev/payments/checkout/%s/challenge">
                  <input type="hidden" name="approve" value="0">
                  <button type="submit" class="secondary">Fallar la autenticación</button>
                </form>
                """.formatted(escape(charge.getCurrencyCode()), formatAmount(charge.getAmountMinor()),
                escape(charge.getProviderReference()), escape(charge.getProviderReference()));
        return shell("Autenticación simulada", content);
    }

    /**
     * The page frame.
     *
     * <p>No card scheme's mark, no bank's name, no colours borrowed from anybody: this is a development
     * fixture and it says so in the largest type on the page. A convincing imitation of a payment page,
     * served from a real deployment's hostname, would be a phishing template.</p>
     */
    private static String shell(String title, String content) {
        return """
                <!doctype html>
                <html lang="es"><head><meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>%s — SIMULACIÓN</title>
                <style>
                  body { font-family: system-ui, sans-serif; margin: 0; background: #f4f4f5; color: #18181b; }
                  main { max-width: 26rem; margin: 2rem auto; padding: 1.5rem; background: #fff;
                         border: 1px solid #d4d4d8; border-radius: .75rem; }
                  .banner { background: #fde68a; border: 2px dashed #b45309; color: #7c2d12;
                            padding: .75rem 1rem; border-radius: .5rem; font-weight: 700;
                            letter-spacing: .05em; text-align: center; }
                  h1 { font-size: 1.125rem; margin: 1.25rem 0 .25rem; }
                  .amount { font-size: 2rem; font-weight: 700; margin: .5rem 0 0; }
                  .merchant { color: #52525b; margin: .25rem 0 1.25rem; }
                  label { display: block; font-size: .875rem; margin-bottom: .25rem; color: #3f3f46; }
                  select { width: 100%%; padding: .625rem; border: 1px solid #a1a1aa; border-radius: .375rem;
                           margin-bottom: 1rem; font-size: 1rem; background: #fff; }
                  button { width: 100%%; padding: .75rem; border-radius: .375rem; font-size: 1rem;
                           cursor: pointer; border: 1px solid transparent; }
                  .primary { background: #1d4ed8; color: #fff; font-weight: 600; }
                  .secondary { background: #fff; color: #3f3f46; border-color: #a1a1aa; margin-top: .5rem; }
                  .ref { font-size: .75rem; color: #71717a; margin-top: 1.5rem; word-break: break-all; }
                  code { background: #f4f4f5; padding: .1rem .3rem; border-radius: .25rem; }
                </style></head>
                <body><main>
                <div class="banner">SIMULACIÓN — NO SE COBRA NINGUNA TARJETA</div>
                <h1>%s</h1>
                %s
                <p class="ref">Pasarela simulada de LupaRX. Existe sólo en el perfil de desarrollo.</p>
                </main></body></html>
                """.formatted(escape(title), escape(title), content);
    }

    private static String describe(SimulatedTestCard card) {
        String expectation = switch (card) {
            case VISA_APPROVED -> "aprobada (Visa)";
            case MASTERCARD_APPROVED -> "aprobada (Mastercard)";
            case DECLINED -> "rechazada por el emisor";
            case INSUFFICIENT_FUNDS -> "fondos insuficientes";
            case THREE_DS_CHALLENGE -> "pide autenticación y luego aprueba";
            case EXPIRED_CARD -> "tarjeta vencida";
        };
        return grouped(card.number()) + " — " + expectation;
    }

    private static String grouped(String number) {
        StringBuilder out = new StringBuilder();
        for (int index = 0; index < number.length(); index++) {
            if (index > 0 && index % 4 == 0) {
                out.append(' ');
            }
            out.append(number.charAt(index));
        }
        return out.toString();
    }

    /** Two decimals, which is what every currency this deployment has met uses. Display only. */
    private static String formatAmount(long minor) {
        return String.format(java.util.Locale.ROOT, "%d.%02d", minor / 100L, Math.abs(minor % 100L));
    }

    private static String escape(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&#39;");
    }
}
