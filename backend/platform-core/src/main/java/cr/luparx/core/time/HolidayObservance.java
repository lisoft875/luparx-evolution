package cr.luparx.core.time;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;

/**
 * When a holiday is actually taken, given the date it nominally falls on.
 *
 * <p>Kept apart from the rule that <em>computes</em> the nominal date, because they answer different
 * questions and countries mix them freely: Costa Rica moves several holidays to the following Monday
 * (Ley 9875) while leaving others where they land, and a country that moves nothing uses the same
 * rows with {@link #EXACT}. Folding the two together would mean a new enumeration value for every
 * combination.</p>
 *
 * <p>This is a <b>default</b>, not a legal ruling. Holiday law changes, and in this platform a
 * municipality always ends up owning a concrete row it can edit — the catalogue is a starting point
 * it copies, never a live authority over what it charges.</p>
 */
public enum HolidayObservance {

    /** Taken on the day it falls. */
    EXACT,

    /**
     * Taken on the following Monday. A holiday that already falls on a Monday stays where it is —
     * "the Monday on or after" rather than "the next Monday", which would push it a week away.
     */
    MONDAY;

    public LocalDate observed(LocalDate nominal) {
        if (this == MONDAY) {
            return nominal.with(TemporalAdjusters.nextOrSame(DayOfWeek.MONDAY));
        }
        return nominal;
    }
}
