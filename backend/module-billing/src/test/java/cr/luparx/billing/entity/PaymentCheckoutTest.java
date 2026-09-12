package cr.luparx.billing.entity;

import cr.luparx.billing.model.CheckoutState;
import cr.luparx.billing.port.CardNetwork;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The hand-off is reached from three directions (return, notification, sweep), so the properties that
 * matter are that the second arrival changes nothing and that the first one wins (ADR 0023 §4).
 */
class PaymentCheckoutTest {

    private static final Instant NOW = Instant.parse("2026-09-11T15:00:00Z");

    @Test
    void completingTwiceKeepsTheFirstAnswer() {
        PaymentCheckout checkout = open();

        checkout.complete(CardNetwork.VISA, "1111", "ABC123", NOW);
        checkout.complete(CardNetwork.MASTERCARD, "4444", "ZZZ999", NOW.plusSeconds(30));

        assertThat(checkout.getState()).isEqualTo(CheckoutState.COMPLETED);
        assertThat(checkout.getNetwork()).isEqualTo(CardNetwork.VISA);
        assertThat(checkout.getCardLast4()).isEqualTo("1111");
        assertThat(checkout.getAuthorizationCode()).isEqualTo("ABC123");
        assertThat(checkout.getResolvedAt()).isEqualTo(NOW);
    }

    @Test
    void doesNotExpireSomethingAlreadyAnswered() {
        PaymentCheckout checkout = open();
        checkout.complete(CardNetwork.VISA, "1111", "ABC123", NOW);

        checkout.expire(NOW.plus(Duration.ofHours(1)));

        // The sweep and a late notification can race; a charge that was captured must not end up looking
        // abandoned because a job got there second.
        assertThat(checkout.getState()).isEqualTo(CheckoutState.COMPLETED);
    }

    @Test
    void burnsTheReturnTokenOnUse() {
        PaymentCheckout checkout = open();
        assertThat(checkout.isReturnTokenUsed()).isFalse();

        checkout.useReturnToken(NOW);

        assertThat(checkout.isReturnTokenUsed()).isTrue();
        assertThat(checkout.getReturnTokenUsedAt()).isEqualTo(NOW);
    }

    @Test
    void countsQuestionsAskedOfTheProvider() {
        PaymentCheckout checkout = open();

        checkout.recordPoll(NOW);
        checkout.recordPoll(NOW.plusSeconds(60));

        assertThat(checkout.getPollAttempts()).isEqualTo(2);
        assertThat(checkout.getLastPolledAt()).isEqualTo(NOW.plusSeconds(60));
    }

    @Test
    void knowsWhenItsWindowHasClosed() {
        PaymentCheckout checkout = open();

        assertThat(checkout.isExpiredAt(NOW.plus(Duration.ofMinutes(19)))).isFalse();
        assertThat(checkout.isExpiredAt(NOW.plus(Duration.ofMinutes(20)))).isTrue();
    }

    private static PaymentCheckout open() {
        return new PaymentCheckout(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "SIMULATED", "SIM-1", "https://provider.example/pay/1",
                "hash", NOW.plus(Duration.ofMinutes(20)), NOW);
    }
}
