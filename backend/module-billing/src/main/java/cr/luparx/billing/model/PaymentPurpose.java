package cr.luparx.billing.model;

import java.util.Locale;

/**
 * What the money was for (CONTRACT.md v0.35).
 *
 * <p>Only {@link #WALLET_TOPUP} happens today. The others exist because the alternative is a table
 * that answers "what did this municipality collect" only for parking, and the first fine paid online
 * would need a migration to be countable. Naming them now costs a varchar; discovering them later
 * costs a schema change on the busiest financial table in the platform.</p>
 */
public enum PaymentPurpose {

    /** Money added to a citizen's balance for one municipality. */
    WALLET_TOPUP,
    /** A citation paid directly, without passing through the balance. */
    FINE,
    /** A permit or exemption with a cost. */
    PERMIT,
    OTHER;

    public String labelKey() {
        return "payment.purpose." + name().toLowerCase(Locale.ROOT);
    }
}
