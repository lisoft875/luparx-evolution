package cr.luparx.app.web;

import cr.luparx.parking.entity.ParkingScheduleSlot;

import java.time.DayOfWeek;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * A charging timetable written as one readable line, for the audit trail (CONTRACT.md v0.32).
 *
 * <p>A timetable is replaced whole, so a field-by-field diff of forty band rows would answer a
 * question nobody asks. What an auditor asks is whether the municipality started charging on Sundays,
 * or moved closing time, or stopped charging altogether — and
 * {@code MON 07:00-18:00 | … | SUN —} answers exactly that in one string that fits in a table cell
 * and reads without training.</p>
 *
 * <p>A day with no band is written {@code —} rather than left out. An absence that is invisible is an
 * absence somebody reads as "not configured", and here it means free parking every Sunday.</p>
 */
final class ScheduleShape {

    private static final String[] DAYS = {"LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"};

    private ScheduleShape() {
    }

    static String of(List<ParkingScheduleSlot> slots) {
        Map<DayOfWeek, List<String>> byDay = new EnumMap<>(DayOfWeek.class);
        for (ParkingScheduleSlot slot : slots) {
            byDay.computeIfAbsent(slot.weekday(), key -> new ArrayList<>())
                    .add(hhmm(slot.getStartMinute()) + "-" + hhmm(slot.getEndMinute()));
        }
        StringBuilder shape = new StringBuilder(96);
        for (DayOfWeek weekday : DayOfWeek.values()) {
            if (shape.length() > 0) {
                shape.append(" | ");
            }
            List<String> bands = byDay.get(weekday);
            shape.append(DAYS[weekday.getValue() - 1]).append(' ')
                    .append(bands == null || bands.isEmpty() ? "—" : String.join(",", bands));
        }
        return shape.toString();
    }

    /** Minutes from midnight as wall clock; 1440 is written 24:00, which no {@code LocalTime} can be. */
    private static String hhmm(int minute) {
        return String.format("%02d:%02d", minute / 60, minute % 60);
    }
}
