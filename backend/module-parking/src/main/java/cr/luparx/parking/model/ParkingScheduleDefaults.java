package cr.luparx.parking.model;

import java.time.DayOfWeek;
import java.util.Collection;
import java.util.EnumSet;
import java.util.Set;

/**
 * The timetable a municipality starts with, when it has not configured one
 * ({@code platform.defaults.parking.schedule.*}).
 *
 * <p>A framework-free value object, filled by the application module from YAML, for the same reason
 * {@link ParkingPolicyDefaults} exists: "Monday to Saturday, 07:00 to 18:00" is the default of
 * <em>this deployment</em>, not a fact about parking. A municipality that opens on Sundays, or one in
 * a country where the working week runs Sunday to Thursday, is a row in {@code parking_schedules} and
 * a line of configuration — never a branch in the code (CONTRACT.md v0.3, "Horario de cobro").</p>
 *
 * @param chargesAllDay     whether a fresh municipality charges around the clock
 * @param chargingWeekdays  the days it charges on; a day left out is a day it does not charge
 * @param band              the band applied to each of those days
 */
public record ParkingScheduleDefaults(
        boolean chargesAllDay,
        Set<DayOfWeek> chargingWeekdays,
        ChargingBand band) {

    public ParkingScheduleDefaults {
        chargingWeekdays = chargingWeekdays == null || chargingWeekdays.isEmpty()
                ? Set.of()
                : Set.copyOf(chargingWeekdays);
        if (band == null) {
            throw new IllegalArgumentException("a default charging band must be configured");
        }
    }

    public static ParkingScheduleDefaults of(boolean chargesAllDay, Collection<DayOfWeek> weekdays,
                                             int startMinute, int endMinute) {
        EnumSet<DayOfWeek> days = EnumSet.noneOf(DayOfWeek.class);
        if (weekdays != null) {
            days.addAll(weekdays);
        }
        return new ParkingScheduleDefaults(chargesAllDay, days, new ChargingBand(startMinute, endMinute));
    }
}
