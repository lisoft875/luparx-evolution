package cr.luparx.parking.model;

import java.time.LocalTime;

/**
 * One stretch of a day during which a municipality charges, as minutes from local midnight
 * (CONTRACT.md v0.3, "Horario de cobro").
 *
 * <p><b>Why minutes and not two {@link LocalTime}s.</b> A band has to be able to end at midnight,
 * and {@code LocalTime} has no 24:00 — the closest it offers is 23:59:59.999999999, which would
 * quietly lose a minute out of every night. Minutes from midnight say 0..1440 without ceremony, and
 * the arithmetic that matters here is minute arithmetic anyway.</p>
 *
 * <p><b>A band never crosses midnight.</b> A timetable that charges from 22:00 to 02:00 is two
 * bands, one on each day. That is not a limitation, it is what keeps every band comparable inside
 * its own day and keeps the intersection below from having to reason about a range that is
 * simultaneously before and after itself.</p>
 *
 * @param startMinute inclusive start, 0..1439
 * @param endMinute   exclusive end, 1..1440; always greater than {@code startMinute}
 */
public record ChargingBand(int startMinute, int endMinute) {

    /** Minutes in a day. Not a magic number anywhere below. */
    public static final int MINUTES_PER_DAY = 24 * 60;

    /** The band that covers a whole day; what {@code charges_all_day} resolves to. */
    public static final ChargingBand WHOLE_DAY = new ChargingBand(0, MINUTES_PER_DAY);

    public ChargingBand {
        if (startMinute < 0 || startMinute >= MINUTES_PER_DAY) {
            throw new IllegalArgumentException("a band starts within the day: " + startMinute);
        }
        if (endMinute <= startMinute || endMinute > MINUTES_PER_DAY) {
            throw new IllegalArgumentException("a band ends after it starts and within the day: " + endMinute);
        }
    }

    public static ChargingBand of(LocalTime start, LocalTime end) {
        int startMinute = start.getHour() * 60 + start.getMinute();
        int endMinute = end.getHour() * 60 + end.getMinute();
        // 00:00 as an end means "midnight at the end of the day", the only reading that is not empty.
        return new ChargingBand(startMinute, endMinute == 0 ? MINUTES_PER_DAY : endMinute);
    }

    public LocalTime startTime() {
        return LocalTime.of(startMinute / 60, startMinute % 60);
    }

    /** {@code null} when the band ends at midnight, which no {@link LocalTime} can express. */
    public LocalTime endTime() {
        return endMinute == MINUTES_PER_DAY ? null : LocalTime.of(endMinute / 60, endMinute % 60);
    }

    public int minutes() {
        return endMinute - startMinute;
    }
}
