package cr.luparx.billing.model;

import java.util.Locale;

/**
 * What became of one line of a provider's statement (CONTRACT.md v0.35).
 *
 * <p>Four outcomes, kept apart because each one is somebody else's problem: a mismatch is a
 * conversation with the provider, an unknown payment is a conversation about whose money that is, a
 * duplicate is a bug in their export, and a match is nothing at all.</p>
 */
public enum LineMatchStatus {

    /** It corresponds to one of our payments, for the same amount. */
    MATCHED,
    /**
     * The provider settled something this platform has no record of.
     *
     * <p>Never resolved by creating the missing payment. A row invented to make a total agree is
     * exactly the sort of thing that makes a ledger useless as evidence; somebody looks at it.</p>
     */
    UNKNOWN_PAYMENT,
    /** The same payment, a different amount. */
    AMOUNT_MISMATCH,
    /** The same provider reference twice in one statement. */
    DUPLICATE;

    /** True when this line needs a person. */
    public boolean isFinding() {
        return this != MATCHED;
    }

    public String labelKey() {
        return "settlement.line." + name().toLowerCase(Locale.ROOT);
    }
}
