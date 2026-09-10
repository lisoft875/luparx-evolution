package cr.luparx.billing.model;

import java.util.Locale;

/** Where a provider's statement stands (CONTRACT.md v0.35). */
public enum SettlementStatus {

    /** Received and stored as it arrived; nobody has matched it yet. */
    IMPORTED,
    /** Matched against this municipality's payments. Findings, if any, are on the lines. */
    RECONCILED,
    /**
     * The municipality is claiming against it.
     *
     * <p>A state and not a note, because a statement under dispute must not quietly count as
     * settled income while somebody argues about it.</p>
     */
    DISPUTED;

    public String labelKey() {
        return "settlement.status." + name().toLowerCase(Locale.ROOT);
    }
}
