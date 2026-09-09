package cr.luparx.enforcement.model;

import java.util.Collections;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * The legal life of a citation.
 *
 * <p>A citation is an administrative act, not a row somebody may fix later. Once it is
 * {@link #ISSUED} it is never edited and never deleted: it is annulled with a reason
 * ({@link #CANCELLED}), paid, appealed, or it runs out of time. That is why the transitions live
 * here, as data, instead of being re-implemented by every caller that changes a status — a rule that
 * exists in one place can be shown to a court; one scattered across services cannot.</p>
 *
 * <ul>
 *   <li>{@link #DRAFT} — captured on the street and not yet a legal act. It has no number yet (see
 *       {@code CitationNumberService}: a draft that is abandoned must not burn a consecutive) and it
 *       is the state an inspector's device leaves a citation in while the photograph the infraction
 *       type demands is still uploading.</li>
 *   <li>{@link #ISSUED} — emitted. From here on the row is append-only.</li>
 *   <li>{@link #PAID} — settled. Terminal.</li>
 *   <li>{@link #APPEALED} — the citizen filed a defence; it resolves into {@link #UPHELD} (the
 *       citation stands and is payable again) or {@link #DISMISSED} (it is void, terminal).</li>
 *   <li>{@link #CANCELLED} — annulled by the municipality with a reason. Terminal.</li>
 *   <li>{@link #EXPIRED} — the payment window closed with the citation unpaid. Terminal here; what a
 *       municipality does afterwards (collection, a lien, a transit court) is outside this
 *       platform.</li>
 * </ul>
 */
public enum CitationStatus {

    DRAFT,
    ISSUED,
    PAID,
    APPEALED,
    UPHELD,
    DISMISSED,
    CANCELLED,
    EXPIRED;

    private static final Map<CitationStatus, Set<CitationStatus>> TRANSITIONS = buildTransitions();

    private static Map<CitationStatus, Set<CitationStatus>> buildTransitions() {
        EnumMap<CitationStatus, Set<CitationStatus>> table = new EnumMap<>(CitationStatus.class);
        // A draft becomes a real act, or is discarded with a reason. It can never jump to PAID:
        // nothing that was never issued can be owed.
        table.put(DRAFT, EnumSet.of(ISSUED, CANCELLED));
        table.put(ISSUED, EnumSet.of(PAID, APPEALED, CANCELLED, EXPIRED));
        // An appeal that fails leaves the citation payable again; one that succeeds voids it.
        table.put(APPEALED, EnumSet.of(UPHELD, DISMISSED, CANCELLED));
        table.put(UPHELD, EnumSet.of(PAID, CANCELLED, EXPIRED));
        // Terminal states. Reopening a paid or annulled citation is a new act, not an edit.
        table.put(PAID, EnumSet.noneOf(CitationStatus.class));
        table.put(DISMISSED, EnumSet.noneOf(CitationStatus.class));
        table.put(CANCELLED, EnumSet.noneOf(CitationStatus.class));
        // An expired citation may still be paid late or annulled; the municipality decides, and both
        // are recorded rather than silently allowed by editing the row.
        table.put(EXPIRED, EnumSet.of(PAID, CANCELLED));

        EnumMap<CitationStatus, Set<CitationStatus>> immutable = new EnumMap<>(CitationStatus.class);
        for (Map.Entry<CitationStatus, Set<CitationStatus>> entry : table.entrySet()) {
            immutable.put(entry.getKey(), Collections.unmodifiableSet(EnumSet.copyOf(entry.getValue())));
        }
        return Collections.unmodifiableMap(immutable);
    }

    /** True while the citation is a capture on a device and not yet an administrative act. */
    public boolean isDraft() {
        return this == DRAFT;
    }

    /** True when money is still owed: the citation stands and nobody has paid it. */
    public boolean isPayable() {
        return this == ISSUED || this == UPHELD || this == EXPIRED;
    }

    /** True when nothing further can happen to the citation inside this platform. */
    public boolean isTerminal() {
        return TRANSITIONS.get(this).isEmpty();
    }

    public boolean canMoveTo(CitationStatus target) {
        return target != null && TRANSITIONS.get(this).contains(target);
    }

    public Set<CitationStatus> allowedTargets() {
        return TRANSITIONS.get(this);
    }

    public static Optional<CitationStatus> parse(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        for (CitationStatus status : values()) {
            if (status.name().equals(normalized)) {
                return Optional.of(status);
            }
        }
        return Optional.empty();
    }

    /** Translation key for the client; the server never sends a translated word (CONTRACT.md §7). */
    public String labelKey() {
        return "citation.status." + name().toLowerCase(Locale.ROOT);
    }
}
