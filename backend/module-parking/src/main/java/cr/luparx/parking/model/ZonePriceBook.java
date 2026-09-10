package cr.luparx.parking.model;

import cr.luparx.core.money.Money;
import cr.luparx.parking.entity.ParkingRate;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What one zone costs, at one instant: its linear base plus the rungs of its ladder
 * (CONTRACT.md v0.24).
 *
 * <p>This is the <b>only</b> place that turns a duration into money. Before v0.24 the arithmetic
 * lived inline in {@code ParkingQuoteService} and was quietly duplicated in a development seeder;
 * with two ways to price a stay, a second copy would not merely drift, it would let a municipality's
 * own screen quote a price the citizen is not charged.</p>
 *
 * <h2>The rule</h2>
 *
 * <p><b>An exact rung wins; everything else is the base.</b> No priorities, no scoring, nothing to
 * configure and therefore nothing that can tie: a price stated for exactly 45 minutes is more
 * specific than a formula that can also produce a number for 45 minutes, and that is a fact about
 * the two rows rather than a preference someone set.</p>
 *
 * <p>The base is mandatory for this reason: it is what answers for every duration the ladder does
 * not name. That includes the one duration that can never have a rung — a citizen spending exactly
 * the minutes they had saved, which is an arbitrary integer (CONTRACT.md v0.12).</p>
 */
public final class ZonePriceBook {

    private final ParkingRate base;
    private final Map<Integer, ParkingRate> ladder;

    /**
     * @param base   the zone's {@link RateKind#BLOCK} rate in force; never null
     * @param ladder its {@link RateKind#EXACT} rates in force, keyed by duration
     */
    public ZonePriceBook(ParkingRate base, Map<Integer, ParkingRate> ladder) {
        if (base == null) {
            throw new IllegalArgumentException("a price book needs the zone's base rate");
        }
        this.base = base;
        this.ladder = Collections.unmodifiableMap(new LinkedHashMap<>(ladder));
    }

    /**
     * Builds a book from every rate row of one zone whose window is open.
     *
     * @throws IllegalArgumentException when no base is present — the caller is expected to have
     *                                  refused with {@code PARKING_RATE_NOT_FOUND} before this
     */
    public static ZonePriceBook of(List<ParkingRate> inForce) {
        ParkingRate base = null;
        Map<Integer, ParkingRate> ladder = new LinkedHashMap<>();
        for (ParkingRate rate : inForce) {
            if (rate.isExact()) {
                // First wins: the caller hands these in most-recent-window-first order, and the
                // partial unique index makes a second open row for the same duration impossible
                // anyway. Belt and braces, because pricing is not the place to find out.
                ladder.putIfAbsent(Integer.valueOf(rate.getMinutes()), rate);
            } else if (base == null) {
                base = rate;
            }
        }
        return new ZonePriceBook(base, ladder);
    }

    public ParkingRate base() {
        return base;
    }

    public String currencyCode() {
        return base.getCurrencyCode();
    }

    /** The durations with a price of their own, ascending. */
    public List<Integer> ladderMinutes() {
        List<Integer> minutes = new ArrayList<>(ladder.keySet());
        Collections.sort(minutes);
        return Collections.unmodifiableList(minutes);
    }

    /** Whether this duration is priced by a rung rather than by the base. */
    public boolean hasRung(int minutes) {
        return ladder.containsKey(Integer.valueOf(minutes));
    }

    /**
     * What a stay of exactly {@code minutes} costs.
     *
     * <p>A rung is taken as it stands. Otherwise the base charges by <b>started</b> block, which is
     * why the division rounds up: a municipality selling hours does not sell fractions of one, and
     * rounding down would hand out the tail of every block for free.</p>
     *
     * @param minutes a positive number of minutes; zero or less is zero money and not an error,
     *                because a stay entirely outside charging hours legitimately costs nothing
     */
    public Money priceOf(int minutes) {
        if (minutes <= 0) {
            return Money.zero(currencyCode());
        }
        ParkingRate rung = ladder.get(Integer.valueOf(minutes));
        if (rung != null) {
            return rung.getAmount();
        }
        return base.getAmount().multipliedBy(blocks(minutes, base.getMinutes()));
    }

    /** Started blocks, as integer arithmetic — never a division of money. */
    private static long blocks(int minutes, int blockMinutes) {
        return ((long) minutes + blockMinutes - 1L) / blockMinutes;
    }
}
