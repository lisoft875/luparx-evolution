package cr.luparx.billing.model;

import java.util.Locale;

/**
 * The life of a hand-off to a provider's page — not of the money (ADR 0023).
 *
 * <h2>Por qué son tres y no siete</h2>
 *
 * <p>The obvious mistake here would be to mirror {@code PaymentState}: {@code PAID}, {@code DECLINED},
 * {@code REFUNDED}. That would give the platform <b>two tables with an opinion about whether a payment
 * succeeded</b>, and the day they disagreed there would be no way to tell which was right. ADR 0019
 * built the treasurer's figures out of a single source on purpose; this keeps that.</p>
 *
 * <p>So the question this answers is only: is the citizen still out there deciding, did the provider
 * give us an answer, or did we stop waiting. What the answer <em>was</em> is read from the payment.</p>
 */
public enum CheckoutState {

    /** The citizen is on the provider's page, or on their way back. Nothing is known yet. */
    OPEN,
    /** The provider gave an answer and the payment was moved accordingly, whatever it said. */
    COMPLETED,
    /**
     * We stopped waiting.
     *
     * <p>A closed tab produces no return and may produce no notification. Without this state the
     * attempt would sit {@code PENDING} for ever and show up in the treasurer's "charged and never
     * settled" list — which is how a municipality learns to stop looking at that list.</p>
     */
    EXPIRED;

    public boolean isOpen() {
        return this == OPEN;
    }

    public String labelKey() {
        return "payment.checkout.state." + name().toLowerCase(Locale.ROOT);
    }
}
