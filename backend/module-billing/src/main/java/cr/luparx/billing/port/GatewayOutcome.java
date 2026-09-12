package cr.luparx.billing.port;

import cr.luparx.billing.model.PaymentState;

import java.util.Optional;

/**
 * What a provider says happened, said in the domain's words (ADR 0023).
 *
 * <h2>Por qué no se usa PaymentState directamente</h2>
 *
 * <p>{@link PaymentState} is the life of <em>our</em> record and its transitions are ours to enforce.
 * This is a report from outside, and the two must not be the same type: the day a provider reports
 * something our state machine forbids, the mismatch has to be a decision in one place rather than an
 * illegal write. {@link #PENDING} and {@link #UNKNOWN} are exactly why — neither is a state a payment
 * of ours can be moved to, and both are things a provider legitimately answers.</p>
 */
public enum GatewayOutcome {

    /** The provider has it and has not resolved it. Nothing to do but ask again later. */
    PENDING,
    /** Authorised, not captured. The money is earmarked and is not the municipality's yet. */
    AUTHORIZED,
    /** Taken. The only outcome that credits anything. */
    CAPTURED,
    /** Refused. The provider's own code travels beside this, unaltered. */
    FAILED,
    /** The person walked away, or the session expired before they paid. */
    CANCELLED,
    REFUNDED,
    CHARGED_BACK,
    /**
     * The provider answered something this adapter does not recognise.
     *
     * <p>Not folded into {@link #FAILED}, which would be a lie with financial consequences: a payment
     * reported in a vocabulary we do not know may well have taken the citizen's money. It stays
     * pending and visible so a person looks at it.</p>
     */
    UNKNOWN;

    /** The state our record should move to, when this outcome maps onto one at all. */
    public Optional<PaymentState> toPaymentState() {
        return switch (this) {
            case AUTHORIZED -> Optional.of(PaymentState.AUTHORIZED);
            case CAPTURED -> Optional.of(PaymentState.CAPTURED);
            case FAILED -> Optional.of(PaymentState.FAILED);
            case CANCELLED -> Optional.of(PaymentState.CANCELLED);
            case REFUNDED -> Optional.of(PaymentState.REFUNDED);
            case CHARGED_BACK -> Optional.of(PaymentState.CHARGED_BACK);
            case PENDING, UNKNOWN -> Optional.empty();
        };
    }

    /** True when the attempt is over as far as the provider is concerned. */
    public boolean isResolved() {
        return this != PENDING && this != UNKNOWN;
    }

    public boolean isCaptured() {
        return this == CAPTURED;
    }
}
