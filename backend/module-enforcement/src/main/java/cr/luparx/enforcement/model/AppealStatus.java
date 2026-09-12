package cr.luparx.enforcement.model;

import java.util.Locale;
import java.util.Optional;

/**
 * Where a citizen's defence stands.
 *
 * <p>Deliberately four values and not the citation's eight. The defence and the citation are two
 * different things: the defence is a document somebody filed, the citation is the act it challenges.
 * Resolving the defence moves the citation ({@code ACCEPTED} → the citation is
 * {@link CitationStatus#DISMISSED}, {@code REJECTED} → {@link CitationStatus#UPHELD}), and keeping
 * the two vocabularies apart is what stops "rejected" from meaning the opposite thing depending on
 * which row you are reading.</p>
 */
public enum AppealStatus {

    /** Filed and waiting for the municipality. */
    SUBMITTED,
    /** The municipality agreed with the citizen: the citation is void. */
    ACCEPTED,
    /** The municipality disagreed: the citation stands and is payable again. */
    REJECTED,
    /**
     * The citizen closed it themselves by paying the citation (v0.41).
     *
     * <p>Not a decision and not a defeat: <b>nobody ruled</b>. It carries a {@code resolvedAt} —it
     * ended, and when— but no {@code resolvedBy} and no reason, because there was no official to
     * name. Collapsing it into {@code REJECTED} would put a decision in the municipality's mouth
     * that it never made, and a citizen reading their history would be told they lost an argument
     * nobody heard.</p>
     */
    WITHDRAWN;

    /** No longer waiting for the municipality — decided, or withdrawn by the citizen. */
    public boolean isResolved() {
        return this != SUBMITTED;
    }

    /**
     * The municipality actually ruled.
     *
     * <p>Distinct from {@link #isResolved()} since v0.41, and the schema depends on the difference:
     * only these two carry a {@code resolved_by} and a reason ({@code ck_citation_appeals_resolution}).
     */
    public boolean isDecided() {
        return this == ACCEPTED || this == REJECTED;
    }

    public static Optional<AppealStatus> parse(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        for (AppealStatus status : values()) {
            if (status.name().equals(normalized)) {
                return Optional.of(status);
            }
        }
        return Optional.empty();
    }

    public String labelKey() {
        return "appeal.status." + name().toLowerCase(Locale.ROOT);
    }
}
