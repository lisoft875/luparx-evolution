package cr.luparx.parking.model;

import cr.luparx.core.time.Easter;
import cr.luparx.core.time.HolidayObservance;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * When an exception to the weekly timetable falls (CONTRACT.md v0.31).
 *
 * <p>Until v0.31 an exception was one date and nothing else, so somebody had to retype a country's
 * eleven holidays every December, for every municipality — and the December they forgot, the platform
 * charged on Independence Day.</p>
 *
 * <h2>The rule is stored, not the dates</h2>
 *
 * <p>Expanding twenty years of "15 September" into twenty rows would be twenty copies of one
 * decision, and the day the law changed it would mean rewriting rows that describe what was already
 * charged. The row says <em>15 September, every year</em>, and this class turns that into the dates
 * that fall inside the window somebody is asking about.</p>
 *
 * <p>{@link Kind#EASTER} exists because Maundy Thursday and Good Friday cannot be written as a day of
 * the year at all: they move. Their rule is a number of days from Easter Sunday, which is exactly how
 * they are defined.</p>
 */
public record ExceptionRecurrence(Kind kind, LocalDate date, Integer month, Integer day,
                                  Integer easterOffsetDays, HolidayObservance observance) {

    /** How the date of an exception is decided. */
    public enum Kind {
        /** One concrete date. What every exception written before v0.31 means. */
        ONCE,
        /** A day of the year, every year. */
        ANNUAL,
        /** A number of days from Easter Sunday, which is how the moveable feasts are defined. */
        EASTER
    }

    public ExceptionRecurrence {
        observance = observance == null ? HolidayObservance.EXACT : observance;
    }

    public static ExceptionRecurrence once(LocalDate date) {
        return new ExceptionRecurrence(Kind.ONCE, date, null, null, null, HolidayObservance.EXACT);
    }

    public static ExceptionRecurrence annual(int month, int day, HolidayObservance observance) {
        return new ExceptionRecurrence(Kind.ANNUAL, null, month, day, null, observance);
    }

    public static ExceptionRecurrence easter(int offsetDays, HolidayObservance observance) {
        return new ExceptionRecurrence(Kind.EASTER, null, null, null, offsetDays, observance);
    }

    /**
     * Every date this rule produces inside {@code [from, to]}, both ends included.
     *
     * <p>Bounded by the window and never by "how many years ahead": a stay covers a few days and the
     * "when does charging resume" scan covers a fixed number, so this is always a handful of dates
     * however long the municipality has been operating.</p>
     *
     * <p>A rule that cannot land on a real date in some year — 29 February in a common year — simply
     * produces nothing for that year. Silently, and on purpose: the alternative is either moving it
     * to a day the municipality did not choose, or failing a price quote over a calendar detail.</p>
     */
    public List<LocalDate> datesIn(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) {
            return List.of();
        }
        List<LocalDate> dates = new ArrayList<>(2);
        switch (kind) {
            case ONCE -> {
                if (date != null && !date.isBefore(from) && !date.isAfter(to)) {
                    dates.add(date);
                }
            }
            // A year either side of the window: an observance that shifts to Monday can carry a date
            // from December into January, and a window that starts in January has to see it.
            case ANNUAL -> {
                for (int year = from.getYear() - 1; year <= to.getYear() + 1; year++) {
                    LocalDate nominal = safeDate(year, month, day);
                    add(dates, nominal, from, to);
                }
            }
            case EASTER -> {
                for (int year = from.getYear() - 1; year <= to.getYear() + 1; year++) {
                    LocalDate nominal = easterDate(year, easterOffsetDays);
                    add(dates, nominal, from, to);
                }
            }
            default -> {
                // Unreachable: the enum is closed and every value is handled above.
            }
        }
        return List.copyOf(dates);
    }

    private void add(List<LocalDate> dates, LocalDate nominal, LocalDate from, LocalDate to) {
        if (nominal == null) {
            return;
        }
        LocalDate observed = observance.observed(nominal);
        if (!observed.isBefore(from) && !observed.isAfter(to) && !dates.contains(observed)) {
            dates.add(observed);
        }
    }

    /** Null when the day does not exist in that year — 29 February outside a leap year. */
    private static LocalDate safeDate(int year, Integer month, Integer day) {
        if (month == null || day == null) {
            return null;
        }
        try {
            return LocalDate.of(year, month, day);
        } catch (java.time.DateTimeException notADate) {
            return null;
        }
    }

    /** Null outside the range the computus is defined for, rather than a plausible wrong date. */
    private static LocalDate easterDate(int year, Integer offsetDays) {
        if (offsetDays == null) {
            return null;
        }
        try {
            return Easter.sunday(year).plusDays(offsetDays);
        } catch (IllegalArgumentException outOfRange) {
            return null;
        }
    }
}
