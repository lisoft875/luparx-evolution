package cr.luparx.enforcement.model;

import java.util.Locale;
import java.util.Optional;

/**
 * Where a citation was born (CONTRACT.md v0.34).
 *
 * <p>"Preparar el modelo aunque inicialmente una municipalidad siga utilizando otro sistema." A
 * municipality that keeps issuing and collecting in the system it already has still wants its
 * citations visible here — the citizen looking up their plate, the officer checking a car, the
 * office answering the telephone. What it does <em>not</em> want is a platform that quietly starts
 * behaving as if it owned those acts.</p>
 *
 * <p>So the distinction is not a label on a screen. It decides who owns the citation's life:</p>
 *
 * <ul>
 *   <li>{@link #LUPARX} — the act was raised here. The platform issues it, numbers it, moves it
 *       through {@link CitationStatus}, takes the money and answers for it.</li>
 *   <li>{@link #EXTERNAL} — the act was raised somewhere else and this row is a <b>mirror</b>. It is
 *       read, searched and shown; it is not paid here, not moved here and not appealed here. Its
 *       state changes only when the other system says so.</li>
 * </ul>
 *
 * <h2>Por qué el espejo no cobra</h2>
 *
 * <p>Because the alternative is a municipality holding two answers to "did this citizen pay?" and no
 * way to tell which one is true. A platform that accepts a payment for an act it did not issue owes
 * the other system a message it may never manage to deliver, and the day that message fails, someone
 * has paid and still owes. Refusing is the honest position while the other system is the one that
 * charges.</p>
 *
 * <p>It is also the smallest thing that can be built now and grown later. The day a municipality
 * wants LupaRX to collect on citations it did not issue, what that needs is a settlement owner
 * declared per municipality and a callback to the other system — not a rewrite: every change of
 * state in this platform already funnels through one method, which is where the rule lives.</p>
 */
public enum CitationSource {

    /** Raised in LupaRX. The platform owns it end to end. */
    LUPARX,

    /**
     * Raised in another system. A mirror: readable, never settled here.
     *
     * <p>Both facts stay true even when the mirrored citation looks exactly like one of ours — same
     * plate, same zone, same amount. Where it came from is what decides what may be done to it, not
     * how complete it happens to look.</p>
     */
    EXTERNAL;

    /** True when this platform decides what happens to the citation. */
    public boolean isManagedHere() {
        return this == LUPARX;
    }

    /** True when the row only reflects an act that lives somewhere else. */
    public boolean isMirror() {
        return this == EXTERNAL;
    }

    public static Optional<CitationSource> parse(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        for (CitationSource source : values()) {
            if (source.name().equals(normalized)) {
                return Optional.of(source);
            }
        }
        return Optional.empty();
    }

    /** Translation key for the client; the server never sends a translated word (CONTRACT.md §7). */
    public String labelKey() {
        return "citation.source." + name().toLowerCase(Locale.ROOT);
    }
}
