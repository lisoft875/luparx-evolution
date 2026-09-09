package cr.luparx.enforcement.model;

/**
 * What was done to a citation, as written in its own history ({@code citation_events}).
 *
 * <p>It is not the same thing as the resulting {@link CitationStatus}: two different acts can leave a
 * citation in the same state (an appeal upheld and a late payment both leave it payable), and the
 * person who challenges the citation has the right to read what happened, not only where it ended.
 * Kept as an enum rather than free text so the history can be filtered and translated.</p>
 */
public enum CitationAction {

    /** The capture arrived from a device and became a draft. */
    DRAFTED,
    /** The citation was emitted: from this moment it has a number and is an administrative act. */
    ISSUED,
    /** Evidence (a photograph or a note) was attached. Never changes the status. */
    EVIDENCE_ATTACHED,
    /** Paid. */
    PAID,
    /** The citizen filed a defence. */
    APPEALED,
    /** The appeal was rejected and the citation stands. */
    APPEAL_UPHELD,
    /** The appeal succeeded and the citation is void. */
    APPEAL_DISMISSED,
    /** Annulled by the municipality, always with a reason. */
    CANCELLED,
    /** The payment window closed with the citation unpaid. */
    EXPIRED;

    public String labelKey() {
        return "citation.action." + name().toLowerCase(java.util.Locale.ROOT);
    }
}
