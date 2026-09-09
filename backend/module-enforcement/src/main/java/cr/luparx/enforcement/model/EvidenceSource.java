package cr.luparx.enforcement.model;

import java.util.Locale;

/**
 * Who supplied a piece of evidence.
 *
 * <p>The officer's photograph and the citizen's live in the same table because legally they are the
 * same kind of thing — what each party offers as proof — and splitting them would make "everything
 * that backs this case" two queries that can disagree. But which of the two supplied a given file is
 * never a matter of inference: it is a column, and the screens that show a case show it.</p>
 */
public enum EvidenceSource {

    OFFICER,
    CITIZEN;

    public String labelKey() {
        return "citation.evidence.source." + name().toLowerCase(Locale.ROOT);
    }
}
