package cr.luparx.parking.model;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * When a municipality charges, and — the part that actually matters — <b>how many minutes of a given
 * stay fall inside that</b> (CONTRACT.md v0.3, "Horario de cobro").
 *
 * <h2>The rule, in one sentence</h2>
 *
 * <p>Only the minutes that fall inside a band are charged. A stay from 17:30 to 19:00 where charging
 * closes at 18:00 pays thirty minutes, not ninety. The same applies to an extension: it is priced on
 * the minutes <em>it</em> adds that fall inside a band, not on the minutes it was asked for.</p>
 *
 * <h2>Why this is a pure value object</h2>
 *
 * <p>Nothing here touches a repository, a clock or Spring. The intersection between a stay and a
 * timetable is arithmetic with edges — a band that ends exactly when the stay starts, a stay that
 * crosses midnight, a weekday with no band at all, a holiday in the middle of a long stay — and
 * arithmetic with edges is worth having in a class that can be built in a test with three lines and
 * no database. The service that loads the rows builds one of these and asks it.</p>
 *
 * <h2>Time zone</h2>
 *
 * <p>Everything is evaluated in the <b>municipality's</b> zone, never the device's. A band is a local
 * wall-clock statement ("we charge from seven"), so it is resolved against each local date in turn;
 * a change of offset moves the instant, not the hour, which is exactly what a municipality means when
 * it publishes its hours.</p>
 *
 * <h2>Precedence</h2>
 *
 * <ol>
 *   <li>A dated exception, if there is one for that local date, wins — including over
 *       {@code chargesAllDay}. A municipality that charges around the clock and still declares a
 *       public holiday means the holiday: "all day" is a statement about the daily timetable, and a
 *       holiday is a statement about the calendar.</li>
 *   <li>Otherwise {@code chargesAllDay} charges the whole day and the weekday bands are ignored.</li>
 *   <li>Otherwise the bands of that weekday. A weekday with no band is a day that is not charged —
 *       by default, Sunday.</li>
 * </ol>
 */
public final class ChargingSchedule {

    /**
     * How far ahead {@link #nextChargingStart} is willing to look. A municipality whose next charging
     * band is more than a year away has not configured a timetable, it has configured a mistake, and
     * scanning forever would turn that mistake into a hung request.
     */
    private static final int MAX_LOOKAHEAD_DAYS = 370;

    private final ZoneId zone;
    private final boolean chargesAllDay;
    private final Map<DayOfWeek, List<ChargingBand>> weekly;
    private final Map<LocalDate, ChargingDayRule> exceptions;

    public ChargingSchedule(ZoneId zone, boolean chargesAllDay, Map<DayOfWeek, List<ChargingBand>> weekly,
                            Map<LocalDate, ChargingDayRule> exceptions) {
        this.zone = zone == null ? ZoneId.of("UTC") : zone;
        this.chargesAllDay = chargesAllDay;
        Map<DayOfWeek, List<ChargingBand>> copy = new EnumMap<>(DayOfWeek.class);
        if (weekly != null) {
            for (Map.Entry<DayOfWeek, List<ChargingBand>> entry : weekly.entrySet()) {
                List<ChargingBand> merged = normalize(entry.getValue());
                if (!merged.isEmpty()) {
                    copy.put(entry.getKey(), merged);
                }
            }
        }
        this.weekly = Collections.unmodifiableMap(copy);
        this.exceptions = exceptions == null ? Map.of() : Map.copyOf(exceptions);
    }

    public ZoneId zone() {
        return zone;
    }

    public boolean chargesAllDay() {
        return chargesAllDay;
    }

    public Map<DayOfWeek, List<ChargingBand>> weeklyBands() {
        return weekly;
    }

    public Map<LocalDate, ChargingDayRule> exceptions() {
        return exceptions;
    }

    /** True when this municipality never charges anything — a timetable with no band anywhere. */
    public boolean chargesNothing() {
        return !chargesAllDay && weekly.isEmpty();
    }

    /** The bands in force on one local date, exceptions and the all-day switch already applied. */
    public List<ChargingBand> bandsOn(LocalDate date) {
        ChargingDayRule exception = exceptions.get(date);
        if (exception != null) {
            if (!exception.charges()) {
                return List.of();
            }
            if (exception.allDay()) {
                return List.of(ChargingBand.WHOLE_DAY);
            }
            if (!exception.bands().isEmpty()) {
                return normalize(exception.bands());
            }
            // "Charged as usual": fall through to the weekday bands.
        }
        if (chargesAllDay) {
            return List.of(ChargingBand.WHOLE_DAY);
        }
        return weekly.getOrDefault(date.getDayOfWeek(), List.of());
    }

    /**
     * How many minutes of {@code [from, to)} are charged.
     *
     * <p>Half-open on purpose: a stay that ends exactly when a band opens pays nothing for it, and a
     * band that ends exactly when a stay starts charges nothing either. Anything else would charge a
     * minute twice at every boundary.</p>
     *
     * @return 0 when the window is empty, inverted, or falls entirely outside every band
     */
    public int chargeableMinutes(Instant from, Instant to) {
        if (from == null || to == null || !to.isAfter(from)) {
            return 0;
        }
        long seconds = 0L;
        LocalDate date = from.atZone(zone).toLocalDate();
        LocalDate last = to.atZone(zone).toLocalDate();
        // A stay is bounded by the policy's session cap, so this walk is a handful of days at most.
        // The guard is there for a caller that ever asks something absurd, not for the normal path.
        for (int guard = 0; !date.isAfter(last) && guard <= MAX_LOOKAHEAD_DAYS; guard++) {
            for (ChargingBand band : bandsOn(date)) {
                Instant bandStart = at(date, band.startMinute());
                Instant bandEnd = at(date, band.endMinute());
                Instant overlapStart = bandStart.isAfter(from) ? bandStart : from;
                Instant overlapEnd = bandEnd.isBefore(to) ? bandEnd : to;
                if (overlapEnd.isAfter(overlapStart)) {
                    seconds += Duration.between(overlapStart, overlapEnd).getSeconds();
                }
            }
            date = date.plusDays(1);
        }
        // Floor: a partial minute is not charged. Bands and stays are whole minutes in practice, so
        // this only ever matters for a caller that hands in an odd number of seconds.
        return (int) Math.min(seconds / 60L, Integer.MAX_VALUE);
    }

    /** Whether this instant falls inside a band. */
    public boolean chargesAt(Instant moment) {
        if (moment == null) {
            return false;
        }
        LocalDate date = moment.atZone(zone).toLocalDate();
        for (ChargingBand band : bandsOn(date)) {
            Instant start = at(date, band.startMinute());
            Instant end = at(date, band.endMinute());
            if (!moment.isBefore(start) && moment.isBefore(end)) {
                return true;
            }
        }
        return false;
    }

    /**
     * When charging next resumes, at or after {@code from}.
     *
     * <p>This is what the app turns into "charging resumes on Monday at 7:00". Empty means the
     * municipality has no band within {@link #MAX_LOOKAHEAD_DAYS} — a timetable that charges nothing,
     * which is legitimate configuration and not something to hang a request over.</p>
     */
    public Optional<Instant> nextChargingStart(Instant from) {
        if (from == null || chargesNothing()) {
            return Optional.empty();
        }
        LocalDate date = from.atZone(zone).toLocalDate();
        for (int day = 0; day <= MAX_LOOKAHEAD_DAYS; day++) {
            for (ChargingBand band : bandsOn(date)) {
                Instant start = at(date, band.startMinute());
                Instant end = at(date, band.endMinute());
                if (end.isAfter(from)) {
                    // Inside a band already: charging resumes now, not at the next opening hour.
                    return Optional.of(start.isAfter(from) ? start : from);
                }
            }
            date = date.plusDays(1);
        }
        return Optional.empty();
    }

    /**
     * Resolves a local minute-of-day on a local date to an instant, in the municipality's zone.
     *
     * <p>Minute 1440 is midnight at the <em>end</em> of the day, which is the start of the next one:
     * expressing it that way is what lets a band close the day without {@link LocalTime} having to
     * represent 24:00. Across a daylight-saving change {@code atZone} resolves a gap forward and an
     * overlap to the earlier offset, which is the JDK's documented behaviour and the one a published
     * timetable implies — "we open at seven" means the first seven o'clock there is.</p>
     */
    private Instant at(LocalDate date, int minuteOfDay) {
        if (minuteOfDay >= ChargingBand.MINUTES_PER_DAY) {
            return date.plusDays(1).atStartOfDay(zone).toInstant();
        }
        ZonedDateTime zoned = date.atTime(LocalTime.of(minuteOfDay / 60, minuteOfDay % 60)).atZone(zone);
        return zoned.toInstant();
    }

    /**
     * Sorts bands and merges the ones that touch or overlap, so a day is a set of disjoint stretches.
     * Without this, two overlapping bands an administrator entered by hand would each contribute their
     * minutes and the citizen would be charged twice for the same time.
     */
    private static List<ChargingBand> normalize(List<ChargingBand> bands) {
        if (bands == null || bands.isEmpty()) {
            return List.of();
        }
        List<ChargingBand> sorted = new ArrayList<>(bands);
        sorted.sort((left, right) -> {
            int byStart = Integer.compare(left.startMinute(), right.startMinute());
            return byStart != 0 ? byStart : Integer.compare(left.endMinute(), right.endMinute());
        });
        List<ChargingBand> merged = new ArrayList<>(sorted.size());
        int start = sorted.get(0).startMinute();
        int end = sorted.get(0).endMinute();
        for (int index = 1; index < sorted.size(); index++) {
            ChargingBand band = sorted.get(index);
            if (band.startMinute() <= end) {
                end = Math.max(end, band.endMinute());
            } else {
                merged.add(new ChargingBand(start, end));
                start = band.startMinute();
                end = band.endMinute();
            }
        }
        merged.add(new ChargingBand(start, end));
        return List.copyOf(merged);
    }
}
