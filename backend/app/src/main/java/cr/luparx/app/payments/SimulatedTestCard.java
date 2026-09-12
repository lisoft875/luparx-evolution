package cr.luparx.app.payments;

import cr.luparx.billing.port.CardNetwork;
import cr.luparx.billing.port.GatewayOutcome;

import java.util.Locale;
import java.util.Optional;

/**
 * The cards the simulator recognises, and what each one does (ADR 0023 §6).
 *
 * <h2>Por el número y no por el monto</h2>
 *
 * <p>Every real provider's sandbox keys its behaviour off the card, so the simulator does too. Keying
 * it off the amount instead — "anything over 10.000 is declined" — would make the tests read nothing
 * like the integration they are standing in for, and would make a legitimate amount untestable.</p>
 *
 * <p>The numbers are from the range reserved for testing and pass the Luhn check, because a client
 * that validates the number before sending it has to be exercisable too.</p>
 *
 * <p>Anything unrecognised is {@link #approved()} as a Visa. That is the friendly choice for a
 * demonstration — whatever a municipal officer types works — and it is safe because this class only
 * exists when the simulator is the configured provider.</p>
 */
public enum SimulatedTestCard {

    VISA_APPROVED("4111111111111111", CardNetwork.VISA, GatewayOutcome.CAPTURED, false, null, null),
    MASTERCARD_APPROVED("5555555555554444", CardNetwork.MASTERCARD, GatewayOutcome.CAPTURED, false, null, null),
    DECLINED("4000000000000002", CardNetwork.VISA, GatewayOutcome.FAILED, false,
            "DECLINED", "El emisor rechazó la transacción."),
    INSUFFICIENT_FUNDS("4000000000009995", CardNetwork.VISA, GatewayOutcome.FAILED, false,
            "INSUFFICIENT_FUNDS", "Fondos insuficientes."),
    /** Approved, but only after the citizen clears a challenge. The flow has to survive a middle step. */
    THREE_DS_CHALLENGE("4000000000003220", CardNetwork.VISA, GatewayOutcome.CAPTURED, true, null, null),
    EXPIRED_CARD("4000000000000069", CardNetwork.VISA, GatewayOutcome.FAILED, false,
            "EXPIRED_CARD", "La tarjeta está vencida.");

    private final String number;
    private final CardNetwork network;
    private final GatewayOutcome outcome;
    private final boolean challenge;
    private final String failureCode;
    private final String failureReason;

    SimulatedTestCard(String number, CardNetwork network, GatewayOutcome outcome, boolean challenge,
                      String failureCode, String failureReason) {
        this.number = number;
        this.network = network;
        this.outcome = outcome;
        this.challenge = challenge;
        this.failureCode = failureCode;
        this.failureReason = failureReason;
    }

    /** The one a demonstration uses, and the fallback for anything unrecognised. */
    public static SimulatedTestCard approved() {
        return VISA_APPROVED;
    }

    /**
     * Which card was typed.
     *
     * <p>Spaces and dashes are stripped, because that is how people type a card number and refusing
     * it would be testing our own form rather than the payment flow.</p>
     */
    public static SimulatedTestCard of(String typed) {
        return find(typed).orElse(approved());
    }

    public static Optional<SimulatedTestCard> find(String typed) {
        if (typed == null || typed.isBlank()) {
            return Optional.empty();
        }
        String digits = typed.replaceAll("[^0-9]", "");
        for (SimulatedTestCard card : values()) {
            if (card.number.equals(digits)) {
                return Optional.of(card);
            }
        }
        return Optional.empty();
    }

    /**
     * The last four digits of this test card.
     *
     * <p>The only part of a card number that is ever stored or shown, here as much as anywhere: the
     * simulator holds itself to the same rule as the real thing, or it stops being a rehearsal.</p>
     */
    public String last4() {
        return number.substring(number.length() - 4);
    }

    public String number() {
        return number;
    }

    public CardNetwork network() {
        return network;
    }

    /** What the provider will report once any challenge has been cleared. */
    public GatewayOutcome outcome() {
        return outcome;
    }

    public boolean requiresChallenge() {
        return challenge;
    }

    public String failureCode() {
        return failureCode;
    }

    public String failureReason() {
        return failureReason;
    }

    public String labelKey() {
        return "payment.simulator.card." + name().toLowerCase(Locale.ROOT);
    }
}
