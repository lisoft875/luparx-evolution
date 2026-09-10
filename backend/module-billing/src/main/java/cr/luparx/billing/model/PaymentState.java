package cr.luparx.billing.model;

import java.util.Collections;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * The life of one attempt to receive money (CONTRACT.md v0.35).
 *
 * <h2>Por qué no se llama PaymentStatus</h2>
 *
 * <p>{@code parking.model.PaymentStatus} already exists and answers a different question: whether a
 * <em>stay</em> was charged for. This one is about a single attempt to move real money. Two things
 * that would be confused by sharing a name are two things that should not share one — the day
 * somebody imports the wrong {@code PaymentStatus} the compiler will not help them, and the bug is
 * about money.</p>
 *
 * <h2>Un intento fallido se guarda</h2>
 *
 * <p>{@link #FAILED} is a state and not an absence, because "I paid and my balance did not go up" is
 * a sentence a municipality has to be able to answer. A table that only kept the successes turns a
 * problem at the bank into the citizen's word against the council's.</p>
 */
public enum PaymentState {

    /** Started and not yet resolved. Every payment begins here, including the ones that fail. */
    PENDING,
    /** The card was authorised and the money is not ours yet. Some gateways stop here for a while. */
    AUTHORIZED,
    /** The money was taken. The only state in which anything is credited. */
    CAPTURED,
    /** The provider refused it. Terminal, and kept precisely because it is what a claim is built on. */
    FAILED,
    /** Abandoned before resolving — a citizen who closed the page. Terminal. */
    CANCELLED,
    /** Given back, wholly or in part. */
    REFUNDED,
    /** Reversed by the bank against the municipality's will. Terminal, and never silent. */
    CHARGED_BACK;

    private static final Map<PaymentState, Set<PaymentState>> TRANSITIONS = buildTransitions();

    private static Map<PaymentState, Set<PaymentState>> buildTransitions() {
        EnumMap<PaymentState, Set<PaymentState>> table = new EnumMap<>(PaymentState.class);
        table.put(PENDING, EnumSet.of(AUTHORIZED, CAPTURED, FAILED, CANCELLED));
        table.put(AUTHORIZED, EnumSet.of(CAPTURED, FAILED, CANCELLED));
        // A captured payment can still be given back or taken back, and both are new facts about it
        // rather than edits to it: each one moves the state and leaves the previous one recorded.
        table.put(CAPTURED, EnumSet.of(REFUNDED, CHARGED_BACK));
        // A charge-back can follow a refund (the bank reverses anyway); nothing follows a failure.
        table.put(REFUNDED, EnumSet.of(CHARGED_BACK));
        table.put(FAILED, EnumSet.noneOf(PaymentState.class));
        table.put(CANCELLED, EnumSet.noneOf(PaymentState.class));
        table.put(CHARGED_BACK, EnumSet.noneOf(PaymentState.class));

        EnumMap<PaymentState, Set<PaymentState>> immutable = new EnumMap<>(PaymentState.class);
        for (Map.Entry<PaymentState, Set<PaymentState>> entry : table.entrySet()) {
            immutable.put(entry.getKey(), Collections.unmodifiableSet(EnumSet.copyOf(entry.getValue())));
        }
        return Collections.unmodifiableMap(immutable);
    }

    /** True when the money was actually taken and something may be credited against it. */
    public boolean isCaptured() {
        return this == CAPTURED;
    }

    /** True when nothing further can happen to this attempt. */
    public boolean isTerminal() {
        return TRANSITIONS.get(this).isEmpty();
    }

    /** True when a provider should be expected to report it in a statement. */
    public boolean isExpectedInSettlement() {
        return this == CAPTURED;
    }

    public boolean canMoveTo(PaymentState target) {
        return target != null && TRANSITIONS.get(this).contains(target);
    }

    public Set<PaymentState> allowedTargets() {
        return TRANSITIONS.get(this);
    }

    public String labelKey() {
        return "payment.state." + name().toLowerCase(Locale.ROOT);
    }

    public static Optional<PaymentState> parse(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        for (PaymentState state : values()) {
            if (state.name().equals(normalized)) {
                return Optional.of(state);
            }
        }
        return Optional.empty();
    }
}
