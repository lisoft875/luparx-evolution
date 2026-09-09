package cr.luparx.enforcement.model;

import java.util.Locale;
import java.util.Optional;

/**
 * Where a citizen's defence stands.
 *
 * <p>Deliberately three values and not the citation's eight. The defence and the citation are two
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
    REJECTED;

    public boolean isResolved() {
        return this != SUBMITTED;
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
