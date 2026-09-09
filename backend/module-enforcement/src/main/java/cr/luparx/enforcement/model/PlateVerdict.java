package cr.luparx.enforcement.model;

import java.util.Locale;

/**
 * The answer the inspector's device gets when it looks a plate up, and the resolution of the
 * {@code TODO(domain)} that {@code ParkingSessionRepository} left open about plates that repeat.
 *
 * <h2>The problem</h2>
 *
 * <p>A plate is unique per citizen, never globally (CONTRACT.md v0.2, rule 2): a shared family car,
 * a company car, a plate reused after a transfer, or simply a typo mean two people may each have a
 * running session for {@code SJP123} in the same municipality. "Did this plate pay?" therefore has
 * no answer on its own, and answering it with the first match found would let a real infraction be
 * excused by somebody else's session — the single most expensive mistake this module can make,
 * because it is invisible: nobody is fined, so nobody complains.</p>
 *
 * <h2>The rule</h2>
 *
 * <p><b>The bay is the discriminator.</b> A parking session is not a permit for a plate; it is a paid
 * stay of one vehicle on one numbered bay. The inspector is standing in front of that bay and knows
 * its code, so the lookup takes it, and:</p>
 *
 * <ul>
 *   <li>a running session for that plate <em>on that bay</em> → {@link #COVERED};</li>
 *   <li>running sessions for that plate, but all on other bays → {@link #BAY_MISMATCH}: somebody paid
 *       for a different space, which is a different infraction from not paying at all, and the
 *       inspector is shown where those stays are so they can tell the two apart;</li>
 *   <li>no running session at all → {@link #NOT_COVERED};</li>
 *   <li>a lookup made <em>without</em> a bay while matches exist → {@link #AMBIGUOUS}. The server
 *       deliberately refuses to say "covered" here. It is the honest answer — with the data it has,
 *       it cannot tell whether the car in front of the officer is the one that paid — and the device
 *       is asked for the bay instead of being handed a guess.</li>
 * </ul>
 *
 * <p>Nothing in this enum decides whether to fine anybody. It states what the platform knows; the
 * decision, and the infraction type, remain the officer's.</p>
 */
public enum PlateVerdict {

    COVERED,
    BAY_MISMATCH,
    NOT_COVERED,
    AMBIGUOUS;

    /** True only when the platform can state that this bay was paid for by this plate. */
    public boolean isCovered() {
        return this == COVERED;
    }

    public String labelKey() {
        return "plate.verdict." + name().toLowerCase(Locale.ROOT);
    }
}
