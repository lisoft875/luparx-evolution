package cr.luparx.billing.port;

import cr.luparx.billing.model.PaymentState;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The translation between what a provider reports and what our record may become (ADR 0023).
 *
 * <p>Pinned down because this is the one place a provider's vocabulary touches the money's state machine,
 * and the two mistakes it exists to prevent are both expensive: turning "we do not know" into "it failed",
 * and letting an unrecognised answer look like a resolved one.</p>
 */
class GatewayOutcomeTest {

    @Test
    void neverTurnsNotKnowingIntoAFailure() {
        assertThat(GatewayOutcome.UNKNOWN.toPaymentState()).isEmpty();
        assertThat(GatewayOutcome.PENDING.toPaymentState()).isEmpty();
    }

    @Test
    void treatsOnlyAnswersItUnderstandsAsResolved() {
        assertThat(GatewayOutcome.UNKNOWN.isResolved()).isFalse();
        assertThat(GatewayOutcome.PENDING.isResolved()).isFalse();

        assertThat(GatewayOutcome.CAPTURED.isResolved()).isTrue();
        assertThat(GatewayOutcome.FAILED.isResolved()).isTrue();
        assertThat(GatewayOutcome.CANCELLED.isResolved()).isTrue();
    }

    @Test
    void mapsOntoStatesThePaymentCanActuallyReach() {
        assertThat(GatewayOutcome.CAPTURED.toPaymentState()).contains(PaymentState.CAPTURED);
        assertThat(GatewayOutcome.FAILED.toPaymentState()).contains(PaymentState.FAILED);
        assertThat(GatewayOutcome.CANCELLED.toPaymentState()).contains(PaymentState.CANCELLED);
        assertThat(GatewayOutcome.AUTHORIZED.toPaymentState()).contains(PaymentState.AUTHORIZED);

        // Every mapped outcome must be a state a pending attempt can legally be moved to, or the
        // translation would produce writes the state machine refuses.
        assertThat(PaymentState.PENDING.canMoveTo(PaymentState.CAPTURED)).isTrue();
        assertThat(PaymentState.PENDING.canMoveTo(PaymentState.FAILED)).isTrue();
        assertThat(PaymentState.PENDING.canMoveTo(PaymentState.CANCELLED)).isTrue();
        assertThat(PaymentState.PENDING.canMoveTo(PaymentState.AUTHORIZED)).isTrue();
    }

    @Test
    void capturedIsTheOnlyOutcomeThatCredits() {
        for (GatewayOutcome outcome : GatewayOutcome.values()) {
            assertThat(outcome.isCaptured()).isEqualTo(outcome == GatewayOutcome.CAPTURED);
        }
    }

    @Test
    void readsProviderSpellingsOfCardSchemesWithoutGuessing() {
        assertThat(CardNetwork.parse("visa")).isEqualTo(CardNetwork.VISA);
        assertThat(CardNetwork.parse("MASTER-CARD")).isEqualTo(CardNetwork.MASTERCARD);
        assertThat(CardNetwork.parse("American Express")).isEqualTo(CardNetwork.AMERICAN_EXPRESS);

        // Absence and "a scheme we did not map" are different answers, and neither is a guess.
        assertThat(CardNetwork.parse(null)).isEqualTo(CardNetwork.UNKNOWN);
        assertThat(CardNetwork.parse("  ")).isEqualTo(CardNetwork.UNKNOWN);
        assertThat(CardNetwork.parse("Redbanc")).isEqualTo(CardNetwork.OTHER);
    }
}
