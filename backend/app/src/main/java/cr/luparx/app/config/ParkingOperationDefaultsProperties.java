package cr.luparx.app.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.DayOfWeek;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * The charging timetable a municipality starts with
 * ({@code platform.defaults.parking.schedule.*}) and the shape of its bay codes
 * ({@code platform.defaults.parking.space-format.*}).
 *
 * <p>Both are <b>defaults of this deployment</b>, exactly like {@link ParkingDefaultsProperties}: the
 * real values live in {@code parking_schedules} and {@code parking_space_formats}, one row per
 * municipality, editable from the admin portal. "Monday to Saturday, 07:00 to 18:00" and "four plain
 * digits" describe the municipality this platform launches with — a deployment whose working week
 * runs Sunday to Thursday, or whose bays read {@code A-12}, changes this file and not a line of Java
 * (CONTRACT.md v0.3).</p>
 *
 * <p>Wrapper types on purpose: an absent property binds to {@code null} rather than to {@code 0} or
 * {@code false}, so "not configured" and "configured to zero" stay distinguishable.</p>
 *
 * @param chargesAllDay      whether a fresh municipality charges around the clock
 * @param chargingWeekdays   the days it charges on, as {@link DayOfWeek} names; a day left out is a
 *                           day it does not charge
 * @param chargingStartsAt   opening time of the daily band, {@code HH:mm}
 * @param chargingEndsAt     closing time of the daily band, {@code HH:mm}; {@code 24:00} closes the day
 * @param spaceCodePrefix    literal prefix every bay code starts with; empty for plain numbering
 * @param spaceCodeDigits    how many characters follow the prefix
 * @param spaceCodeAllowLetters whether those characters may be letters as well as digits
 */
@ConfigurationProperties(prefix = "platform.defaults.parking")
public record ParkingOperationDefaultsProperties(
        Boolean chargesAllDay,
        List<String> chargingWeekdays,
        String chargingStartsAt,
        String chargingEndsAt,
        String spaceCodePrefix,
        Integer spaceCodeDigits,
        Boolean spaceCodeAllowLetters) {

    /** Minutes in a day; a band that closes the day ends here. */
    public static final int MINUTES_PER_DAY = 24 * 60;

    private static final List<String> DEFAULT_WEEKDAYS =
            List.of("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY");
    private static final int DEFAULT_START_MINUTE = 7 * 60;
    private static final int DEFAULT_END_MINUTE = 18 * 60;
    private static final int DEFAULT_CODE_DIGITS = 4;

    public boolean chargesAllDayOrDefault() {
        return chargesAllDay != null && chargesAllDay.booleanValue();
    }

    /**
     * The configured days, unknown names ignored. A typo in one entry must not take the deployment
     * down, and the days that parsed still describe a usable timetable.
     */
    public List<DayOfWeek> chargingWeekdaysOrDefault() {
        List<String> configured = chargingWeekdays == null || chargingWeekdays.isEmpty()
                ? DEFAULT_WEEKDAYS
                : chargingWeekdays;
        List<DayOfWeek> days = new ArrayList<>(configured.size());
        for (String name : configured) {
            if (name == null || name.isBlank()) {
                continue;
            }
            try {
                days.add(DayOfWeek.valueOf(name.trim().toUpperCase(Locale.ROOT)));
            } catch (IllegalArgumentException exception) {
                // Ignored on purpose; see the method comment.
            }
        }
        return days;
    }

    public int chargingStartMinuteOrDefault() {
        return parseMinuteOfDay(chargingStartsAt, DEFAULT_START_MINUTE);
    }

    public int chargingEndMinuteOrDefault() {
        int end = parseMinuteOfDay(chargingEndsAt, DEFAULT_END_MINUTE);
        return end <= chargingStartMinuteOrDefault() ? DEFAULT_END_MINUTE : end;
    }

    public String spaceCodePrefixOrDefault() {
        return spaceCodePrefix == null ? "" : spaceCodePrefix.trim();
    }

    public int spaceCodeDigitsOrDefault() {
        return spaceCodeDigits == null || spaceCodeDigits.intValue() < 1 || spaceCodeDigits.intValue() > 12
                ? DEFAULT_CODE_DIGITS
                : spaceCodeDigits.intValue();
    }

    public boolean spaceCodeAllowLettersOrDefault() {
        return spaceCodeAllowLetters != null && spaceCodeAllowLetters.booleanValue();
    }

    /**
     * Parses {@code HH:mm} into minutes from midnight. {@code 24:00} is accepted and means midnight
     * at the end of the day, which is the only way to say "we charge until the day ends".
     */
    private static int parseMinuteOfDay(String value, int fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        String[] parts = value.trim().split(":");
        if (parts.length < 2) {
            return fallback;
        }
        try {
            int hour = Integer.parseInt(parts[0].trim());
            int minute = Integer.parseInt(parts[1].trim());
            int total = hour * 60 + minute;
            if (hour < 0 || minute < 0 || minute > 59 || total > MINUTES_PER_DAY) {
                return fallback;
            }
            return total;
        } catch (NumberFormatException exception) {
            return fallback;
        }
    }
}
