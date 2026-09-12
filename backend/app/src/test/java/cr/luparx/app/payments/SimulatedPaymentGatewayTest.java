package cr.luparx.app.payments;

import com.fasterxml.jackson.databind.ObjectMapper;
import cr.luparx.app.config.PaymentsProperties;
import cr.luparx.billing.model.PaymentPurpose;
import cr.luparx.billing.port.CardNetwork;
import cr.luparx.billing.port.GatewayException;
import cr.luparx.billing.port.GatewayOutcome;
import cr.luparx.billing.port.PaymentGateway;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.money.Money;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * The simulator is the reference implementation of the port, so what is pinned down here is what any
 * adapter owes its callers (ADR 0023).
 *
 * <p>The signature tests are the ones that matter most. They are the only place in the codebase where the
 * verification path runs at all until a real provider is wired, and the whole safety argument of the
 * webhook endpoint rests on it refusing three things: a missing signature, a wrong one, and a valid one
 * that is too old to still be honest.</p>
 */
class SimulatedPaymentGatewayTest {

    private static final Instant NOW = Instant.parse("2026-09-11T15:00:00Z");
    private static final TenantId TENANT = TenantId.of(UUID.randomUUID());

    /**
     * The provider's own store, kept as a map behind a mock.
     *
     * <p>Stateful on purpose rather than stubbed per call: what these tests are about is the gateway's
     * behaviour across a sequence — open, decide, ask — and stubbed returns would let a wrong sequence
     * pass while being wrong about the state it left behind.</p>
     */
    private Map<String, SimulatedCharge> stored;
    private SimulatedChargeRepository charges;
    private SimulatedPaymentGateway gateway;

    @BeforeEach
    void setUp() {
        stored = new ConcurrentHashMap<>();
        charges = Mockito.mock(SimulatedChargeRepository.class);
        when(charges.save(any(SimulatedCharge.class))).thenAnswer(call -> {
            SimulatedCharge charge = call.getArgument(0);
            stored.put(charge.getProviderReference(), charge);
            return charge;
        });
        when(charges.findById(anyString()))
                .thenAnswer(call -> Optional.ofNullable(stored.get(call.<String>getArgument(0))));
        when(charges.findByIdempotencyKey(anyString())).thenAnswer(call -> {
            String key = call.getArgument(0);
            return stored.values().stream()
                    .filter(charge -> key != null && key.equals(charge.getIdempotencyKey()))
                    .findFirst();
        });
        gateway = new SimulatedPaymentGateway(charges, properties(), new ObjectMapper(),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void announcesOnlyTheSchemesItAccepts() {
        assertThat(gateway.providerId()).isEqualTo("SIMULATED");
        assertThat(gateway.supportedNetworks()).containsExactlyInAnyOrder(CardNetwork.VISA,
                CardNetwork.MASTERCARD);
    }

    @Test
    void returnsTheSameHandoffForARepeatedIdempotencyKey() {
        PaymentGateway.Handoff first = gateway.createCheckout(request("same-key"));
        PaymentGateway.Handoff second = gateway.createCheckout(request("same-key"));

        // A citizen who double-taps must reach one charge. This is the provider-side half of that
        // guarantee; the payment table holds the other half.
        assertThat(second.providerReference()).isEqualTo(first.providerReference());
        assertThat(stored).hasSize(1);
    }

    @Test
    void opensSeparateChargesForSeparateAttempts() {
        PaymentGateway.Handoff first = gateway.createCheckout(request("key-1"));
        PaymentGateway.Handoff second = gateway.createCheckout(request("key-2"));

        assertThat(second.providerReference()).isNotEqualTo(first.providerReference());
        assertThat(stored).hasSize(2);
    }

    @Test
    void doesNotKnowAReferenceItNeverIssued() {
        // Empty is information — the provider has no such charge — and it must not read as a failure.
        assertThat(gateway.fetchStatus(TENANT, "SIM-NEVER-EXISTED")).isEmpty();
    }

    @Test
    void reportsWhatWasDecidedAtThePaymentPage() {
        PaymentGateway.Handoff handoff = gateway.createCheckout(request("key"));
        SimulatedCharge charge = stored.get(handoff.providerReference());
        SimulatedTestCard card = SimulatedTestCard.VISA_APPROVED;
        charge.approve(card.network(), card.last4(), "AUTH42", NOW);

        PaymentGateway.Snapshot snapshot = gateway.fetchStatus(TENANT, handoff.providerReference())
                .orElseThrow();

        assertThat(snapshot.outcome()).isEqualTo(GatewayOutcome.CAPTURED);
        assertThat(snapshot.network()).isEqualTo(CardNetwork.VISA);
        assertThat(snapshot.cardLast4()).isEqualTo("1111");
        assertThat(snapshot.authorizationCode()).isEqualTo("AUTH42");
        assertThat(snapshot.gross()).isEqualTo(Money.ofMinor(500_000L, "CRC"));
        // No fee declared at capture, exactly as a card provider behaves: the statement corrects the net
        // later (ADR 0019). A simulator that declared one would leave that path untested.
        assertThat(snapshot.fee()).isNull();
    }

    @Test
    void treatsAnAbandonedChargeAsCancelledOnceItsWindowHasPassed() {
        PaymentGateway.Handoff handoff = gateway.createCheckout(request("key"));
        SimulatedPaymentGateway later = new SimulatedPaymentGateway(charges, properties(), new ObjectMapper(),
                Clock.fixed(NOW.plus(Duration.ofHours(2)), ZoneOffset.UTC));

        PaymentGateway.Snapshot snapshot = later.fetchStatus(TENANT, handoff.providerReference())
                .orElseThrow();

        assertThat(snapshot.outcome()).isEqualTo(GatewayOutcome.CANCELLED);
    }

    @Test
    void acceptsAProperlySignedNotificationAndSaysNothingAboutMoney() {
        String body = "{\"eventId\":\"EVT-1\",\"reference\":\"SIM-1\",\"outcome\":\"CAPTURED\"}";

        PaymentGateway.Notification notification = gateway.parseNotification(signed(body, NOW));

        assertThat(notification.providerReference()).isEqualTo("SIM-1");
        assertThat(notification.providerEventId()).isEqualTo("EVT-1");
        assertThat(notification.outcome()).isEqualTo(GatewayOutcome.CAPTURED);
        // The type carries no amount at all, which is the design: a notification says which payment to go
        // and ask about, never what it was worth (ADR 0023 §3).
    }

    @Test
    void refusesANotificationWithoutASignature() {
        Map<String, List<String>> headers = new HashMap<>();
        headers.put(SimulatedPaymentGateway.TIMESTAMP_HEADER, List.of(NOW.toString()));

        assertThatThrownBy(() -> gateway.parseNotification(new PaymentGateway.RawNotification(
                "/api/v1/webhooks/payments/SIMULATED", headers, "{}".getBytes(StandardCharsets.UTF_8))))
                .isInstanceOf(GatewayException.class)
                .hasMessageContaining("signature");
    }

    @Test
    void refusesATamperedBody() {
        String body = "{\"eventId\":\"EVT-1\",\"reference\":\"SIM-1\",\"outcome\":\"FAILED\"}";
        PaymentGateway.RawNotification honest = signed(body, NOW);
        String forged = body.replace("FAILED", "CAPTURED");

        PaymentGateway.RawNotification tampered = new PaymentGateway.RawNotification(honest.path(),
                honest.headers(), forged.getBytes(StandardCharsets.UTF_8));

        // The signature is computed over the bytes received. This is the attack the whole verification
        // exists for: somebody changing "failed" into "captured" on its way in.
        assertThatThrownBy(() -> gateway.parseNotification(tampered))
                .isInstanceOf(GatewayException.class)
                .hasMessageContaining("signature mismatch");
    }

    @Test
    void refusesAValidSignatureThatIsTooOld() {
        String body = "{\"eventId\":\"EVT-1\",\"reference\":\"SIM-1\",\"outcome\":\"CAPTURED\"}";
        Instant stale = NOW.minus(SimulatedPaymentGateway.SIGNATURE_TOLERANCE).minusSeconds(1);

        // A correctly signed request captured off the wire and sent again later is a replay. The window is
        // what makes a captured request stop working.
        assertThatThrownBy(() -> gateway.parseNotification(signed(body, stale)))
                .isInstanceOf(GatewayException.class)
                .hasMessageContaining("time window");
    }

    @Test
    void refusesABodyItCannotRead() {
        assertThatThrownBy(() -> gateway.parseNotification(signed("not json at all", NOW)))
                .isInstanceOf(GatewayException.class);
    }

    @Test
    void callsAnUnrecognisedOutcomeUnknownRatherThanFailed() {
        String body = "{\"eventId\":\"EVT-9\",\"reference\":\"SIM-9\",\"outcome\":\"ALGO_NUEVO\"}";

        PaymentGateway.Notification notification = gateway.parseNotification(signed(body, NOW));

        // Folding it into FAILED would be a lie with financial consequences: a payment reported in a
        // vocabulary we do not know may well have taken the citizen's money.
        assertThat(notification.outcome()).isEqualTo(GatewayOutcome.UNKNOWN);
    }

    @Test
    void derivesTestCardBehaviourFromTheNumber() {
        assertThat(SimulatedTestCard.of("4111 1111 1111 1111").outcome()).isEqualTo(GatewayOutcome.CAPTURED);
        assertThat(SimulatedTestCard.of("5555-5555-5555-4444").network()).isEqualTo(CardNetwork.MASTERCARD);
        assertThat(SimulatedTestCard.of("4000000000000002").outcome()).isEqualTo(GatewayOutcome.FAILED);
        assertThat(SimulatedTestCard.of("4000000000009995").failureCode()).isEqualTo("INSUFFICIENT_FUNDS");
        assertThat(SimulatedTestCard.of("4000000000003220").requiresChallenge()).isTrue();

        // Unrecognised numbers approve, so a demonstration never dead-ends on a typo.
        assertThat(SimulatedTestCard.of("1234").outcome()).isEqualTo(GatewayOutcome.CAPTURED);
        assertThat(SimulatedTestCard.find("1234")).isEmpty();
    }

    @Test
    void onlyEverExposesTheLastFourDigits() {
        for (SimulatedTestCard card : SimulatedTestCard.values()) {
            assertThat(card.last4()).hasSize(4);
            assertThat(card.number()).endsWith(card.last4());
        }
    }

    private PaymentGateway.RawNotification signed(String body, Instant sentAt) {
        String timestamp = sentAt.toString();
        Map<String, List<String>> headers = new HashMap<>();
        headers.put(SimulatedPaymentGateway.SIGNATURE_HEADER, List.of(gateway.sign(timestamp + "." + body)));
        headers.put(SimulatedPaymentGateway.TIMESTAMP_HEADER, List.of(timestamp));
        return new PaymentGateway.RawNotification("/api/v1/webhooks/payments/SIMULATED", headers,
                body.getBytes(StandardCharsets.UTF_8));
    }

    private static PaymentGateway.CheckoutRequest request(String idempotencyKey) {
        return new PaymentGateway.CheckoutRequest(TENANT, UUID.randomUUID(),
                Money.ofMinor(500_000L, "CRC"), PaymentPurpose.WALLET_TOPUP, "Municipalidad de prueba",
                "http://localhost:5183/wallet/topup/return?token=abc",
                "http://localhost:5183/wallet/topup/return?cancelled=1", Locale.forLanguageTag("es-CR"),
                idempotencyKey, UUID.randomUUID().toString(), null);
    }

    private static PaymentsProperties properties() {
        return new PaymentsProperties(null, null, null, null, null, null, null, null, null);
    }

}
