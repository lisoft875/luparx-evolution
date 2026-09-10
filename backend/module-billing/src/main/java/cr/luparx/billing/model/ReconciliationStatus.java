package cr.luparx.billing.model;

import java.util.Locale;

/**
 * Where one payment stands against the provider's statements (CONTRACT.md v0.35).
 *
 * <p>This is the payment's side of the question; {@link LineMatchStatus} is the statement's side.
 * They are kept apart because they fail differently: a payment can be missing from a statement, and
 * a statement can carry a line for a payment nobody here has ever seen. One field could not say
 * both.</p>
 */
public enum ReconciliationStatus {

    /** Nobody has checked it yet, or the statement covering it has not arrived. */
    PENDING,
    /** It appears in a statement for the same amount. The answer somebody wants. */
    MATCHED,
    /**
     * It was captured and no statement covering its period reports it.
     *
     * <p>The most consequential finding in this module: money the municipality charged and has not
     * been paid. Everything else here exists so that this one can be stated plainly.</p>
     */
    MISSING_IN_SETTLEMENT,
    /** It appears, for a different amount. */
    AMOUNT_MISMATCH,
    /**
     * Nothing to reconcile against, and that is correct.
     *
     * <p>Cash at the counter, an adjustment, and every top-up recorded before this module existed.
     * Distinct from {@link #PENDING} on purpose: left pending, they would sit in the "charged and
     * never settled" list forever — a permanent alarm about something that is not a problem, which
     * is how a municipality learns to ignore the list.</p>
     */
    NOT_APPLICABLE;

    public String labelKey() {
        return "payment.reconciliation." + name().toLowerCase(Locale.ROOT);
    }
}
