package cr.luparx.parking.model;

import java.time.Instant;

/**
 * One duration a citizen may add to a running session, already priced, and what the session would
 * expire at if they took it.
 *
 * <p>It exists because the screen that offers extensions has to show a price next to each option,
 * and the alternative was a quote request per option — three or four round trips to draw one list,
 * every one of them able to answer differently from the others because the clock moved in between.
 * One call, one moment, one set of numbers that agree with each other.</p>
 *
 * <p>The money is computed by the server and only the server, exactly as it is for a quote and for
 * the extension itself: the same tariff, the same started blocks, the same charging hours. An option
 * that falls entirely outside those hours is <b>free and still offered</b> — the citizen genuinely
 * may park for it, and hiding it would be the platform refusing to sell nothing.</p>
 *
 * @param minutes           the duration offered, from the municipality's configured list
 * @param quote             what it costs: chargeable minutes, credit applied and money payable
 * @param newExpiresAt      when the session would expire if this option were taken
 * @param allowed           whether it can actually be taken right now
 * @param unavailableReason stable code explaining why not, or null when it is allowed
 */
public record ExtensionOption(
        int minutes,
        ParkingQuote quote,
        Instant newExpiresAt,
        boolean allowed,
        String unavailableReason) {

    public static ExtensionOption available(int minutes, ParkingQuote quote, Instant newExpiresAt) {
        return new ExtensionOption(minutes, quote, newExpiresAt, true, null);
    }

    /**
     * An option the municipality offers but this session cannot take — over the total cap, or more
     * money than the wallet holds.
     *
     * <p>Returned rather than omitted on purpose: a citizen who sees "4 h — over the limit" learns
     * something, and a citizen who sees a list that silently lost its last entry learns nothing and
     * wonders whether the app is broken.</p>
     */
    public static ExtensionOption unavailable(int minutes, ParkingQuote quote, Instant newExpiresAt,
                                              String reason) {
        return new ExtensionOption(minutes, quote, newExpiresAt, false, reason);
    }
}
