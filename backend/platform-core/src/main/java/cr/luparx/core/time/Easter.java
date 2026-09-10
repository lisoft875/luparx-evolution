package cr.luparx.core.time;

import java.time.LocalDate;

/**
 * The date of Easter Sunday in the Gregorian calendar.
 *
 * <p>It lives in {@code platform-core} because two modules need the same answer and a second copy of
 * this arithmetic would be a second calendar: {@code module-geo} computes it to show a country's
 * holidays for a year, and {@code module-parking} computes it to decide whether a municipality
 * charges on a Thursday in April. Two implementations that disagreed by a day would charge on Good
 * Friday in one screen and not in the other.</p>
 *
 * <p>The algorithm is the anonymous Gregorian computus, exact for every year the calendar covers. It
 * is written out rather than pulled from a library because it is fifteen lines that never change, and
 * because a dependency for fifteen lines is a dependency to keep upgrading forever.</p>
 *
 * <p><b>Western Easter only.</b> The Orthodox date differs, and a deployment that needs it would add
 * a second method here rather than change this one — the two are different feasts on the same name,
 * not two opinions about one date.</p>
 */
public final class Easter {

    private Easter() {
    }

    /**
     * Easter Sunday of {@code year}.
     *
     * @throws IllegalArgumentException outside 1583–4099, where the Gregorian rule either does not
     *         apply yet or the tabulated correction stops being defined. Refused rather than answered
     *         with a plausible wrong date.
     */
    public static LocalDate sunday(int year) {
        if (year < 1583 || year > 4099) {
            throw new IllegalArgumentException("Easter is only computed for 1583..4099, got " + year);
        }
        int a = year % 19;
        int b = year / 100;
        int c = year % 100;
        int d = b / 4;
        int e = b % 4;
        int f = (b + 8) / 25;
        int g = (b - f + 1) / 3;
        int h = (19 * a + b - d - g + 15) % 30;
        int i = c / 4;
        int k = c % 4;
        int l = (32 + 2 * e + 2 * i - h - k) % 7;
        int m = (a + 11 * h + 22 * l) / 451;
        int month = (h + l - 7 * m + 114) / 31;
        int day = ((h + l - 7 * m + 114) % 31) + 1;
        return LocalDate.of(year, month, day);
    }
}
