package cr.luparx.parking.model;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The rule CONTRACT.md v0.3 will not let anybody improvise: <b>only the minutes that fall inside a
 * charging band are charged</b>, computed in the municipality's own time zone.
 *
 * <p>These tests exist because that rule is arithmetic with edges, and every one of those edges is a
 * way to overcharge a citizen or to give away an afternoon of revenue. They use a zone with a fixed
 * offset and no daylight saving ({@code America/Costa_Rica}) so that a failure means the intersection
 * is wrong and never that the calendar moved underneath it.</p>
 */
class ChargingScheduleTest {

    private static final ZoneId ZONE = ZoneId.of("America/Costa_Rica");

    /** Monday to Saturday, 07:00–18:00; Sunday not charged. The platform default of this deployment. */
    private static ChargingSchedule mondayToSaturday() {
        Map<DayOfWeek, List<ChargingBand>> weekly = new EnumMap<>(DayOfWeek.class);
        for (DayOfWeek day : List.of(DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY,
                DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY)) {
            weekly.put(day, List.of(new ChargingBand(7 * 60, 18 * 60)));
        }
        return new ChargingSchedule(ZONE, false, weekly, Map.of());
    }

    /** A local wall-clock moment in the municipality's zone. */
    private static Instant at(String isoDate, int hour, int minute) {
        return LocalDateTime.of(LocalDate.parse(isoDate), LocalTime.of(hour, minute)).atZone(ZONE).toInstant();
    }

    // 2026-09-07 is a Monday; 2026-09-12 a Saturday; 2026-09-13 a Sunday.

    @Nested
    @DisplayName("a stay that runs past closing time")
    class PastClosingTime {

        @Test
        @DisplayName("17:30 to 19:00 with closing at 18:00 charges thirty minutes")
        void chargesOnlyUntilClosing() {
            // The example the contract states in words. If this ever returns 90, a citizen is being
            // charged for time the municipality does not charge for.
            assertEquals(30, mondayToSaturday()
                    .chargeableMinutes(at("2026-09-07", 17, 30), at("2026-09-07", 19, 0)));
        }

        @Test
        @DisplayName("an extension bought at 17:55 for an hour is free after 18:00")
        void extensionAfterClosingIsFree() {
            // An extension is priced on the stretch it ADDS, which here starts at 18:30.
            assertEquals(0, mondayToSaturday()
                    .chargeableMinutes(at("2026-09-07", 18, 30), at("2026-09-07", 19, 30)));
        }
    }

    @Nested
    @DisplayName("exact edges")
    class Edges {

        @Test
        @DisplayName("a stay entirely inside the band charges all of it")
        void fullyInside() {
            assertEquals(60, mondayToSaturday()
                    .chargeableMinutes(at("2026-09-07", 9, 0), at("2026-09-07", 10, 0)));
        }

        @Test
        @DisplayName("a stay that ends exactly when the band opens charges nothing")
        void endsWhenBandOpens() {
            // Half-open windows: touching is not overlapping. Anything else double-charges the
            // boundary minute against the stay that ends there and the one that starts there.
            assertEquals(0, mondayToSaturday()
                    .chargeableMinutes(at("2026-09-07", 6, 0), at("2026-09-07", 7, 0)));
        }

        @Test
        @DisplayName("a stay that starts exactly when the band closes charges nothing")
        void startsWhenBandCloses() {
            assertEquals(0, mondayToSaturday()
                    .chargeableMinutes(at("2026-09-07", 18, 0), at("2026-09-07", 19, 0)));
        }

        @Test
        @DisplayName("a stay that starts exactly when the band opens charges from the first minute")
        void startsWhenBandOpens() {
            assertEquals(60, mondayToSaturday()
                    .chargeableMinutes(at("2026-09-07", 7, 0), at("2026-09-07", 8, 0)));
        }

        @Test
        @DisplayName("a stay that swallows the whole band charges the band, not the stay")
        void swallowsTheBand() {
            assertEquals(11 * 60, mondayToSaturday()
                    .chargeableMinutes(at("2026-09-07", 0, 0), at("2026-09-08", 0, 0)));
        }

        @Test
        @DisplayName("an empty or inverted window charges nothing instead of throwing")
        void emptyWindow() {
            ChargingSchedule schedule = mondayToSaturday();
            assertEquals(0, schedule.chargeableMinutes(at("2026-09-07", 9, 0), at("2026-09-07", 9, 0)));
            assertEquals(0, schedule.chargeableMinutes(at("2026-09-07", 10, 0), at("2026-09-07", 9, 0)));
        }
    }

    @Nested
    @DisplayName("across midnight")
    class AcrossMidnight {

        @Test
        @DisplayName("a stay from Monday evening into Tuesday morning charges only Tuesday's band")
        void overnightChargesTheNextMorning() {
            // 22:00 Monday → 09:00 Tuesday: nothing after 18:00 Monday, then 07:00–09:00 Tuesday.
            assertEquals(120, mondayToSaturday()
                    .chargeableMinutes(at("2026-09-07", 22, 0), at("2026-09-08", 9, 0)));
        }

        @Test
        @DisplayName("a night band expressed as two bands charges both halves")
        void nightBandInTwoHalves() {
            // 22:00–24:00 on Monday and 00:00–02:00 on Tuesday: a band never wraps, so a night tariff
            // is two bands and the stay across midnight has to pick up both.
            Map<DayOfWeek, List<ChargingBand>> weekly = new EnumMap<>(DayOfWeek.class);
            weekly.put(DayOfWeek.MONDAY, List.of(new ChargingBand(22 * 60, ChargingBand.MINUTES_PER_DAY)));
            weekly.put(DayOfWeek.TUESDAY, List.of(new ChargingBand(0, 2 * 60)));
            ChargingSchedule schedule = new ChargingSchedule(ZONE, false, weekly, Map.of());
            assertEquals(180, schedule.chargeableMinutes(at("2026-09-07", 23, 0), at("2026-09-08", 3, 0)));
        }

        @Test
        @DisplayName("a stay over a whole weekend skips Sunday and charges Saturday and Monday")
        void skipsTheUnchargedDay() {
            // Saturday 16:00 → Monday 08:00 = 2h of Saturday + 0 of Sunday + 1h of Monday.
            assertEquals(180, mondayToSaturday()
                    .chargeableMinutes(at("2026-09-12", 16, 0), at("2026-09-14", 8, 0)));
        }
    }

    @Nested
    @DisplayName("a weekday with no band")
    class UnchargedWeekday {

        @Test
        @DisplayName("Sunday charges nothing at any hour")
        void sundayIsFree() {
            ChargingSchedule schedule = mondayToSaturday();
            assertEquals(0, schedule.chargeableMinutes(at("2026-09-13", 9, 0), at("2026-09-13", 17, 0)));
            assertFalse(schedule.chargesAt(at("2026-09-13", 12, 0)));
        }

        @Test
        @DisplayName("charging resumes on the next day that has a band")
        void nextChargingStartIsMonday() {
            assertEquals(at("2026-09-14", 7, 0),
                    mondayToSaturday().nextChargingStart(at("2026-09-13", 12, 0)).orElseThrow());
        }

        @Test
        @DisplayName("before opening on a charged day, charging resumes the same morning")
        void nextChargingStartIsThisMorning() {
            assertEquals(at("2026-09-07", 7, 0),
                    mondayToSaturday().nextChargingStart(at("2026-09-07", 5, 30)).orElseThrow());
        }

        @Test
        @DisplayName("a timetable with no band at all has no next start")
        void neverCharges() {
            ChargingSchedule nothing = new ChargingSchedule(ZONE, false, Map.of(), Map.of());
            assertTrue(nothing.chargesNothing());
            assertTrue(nothing.nextChargingStart(at("2026-09-07", 9, 0)).isEmpty());
            assertEquals(0, nothing.chargeableMinutes(at("2026-09-07", 9, 0), at("2026-09-07", 18, 0)));
        }
    }

    @Nested
    @DisplayName("dated exceptions")
    class Exceptions {

        @Test
        @DisplayName("a holiday charges nothing even on a normally charged weekday")
        void holidaySuspendsCharging() {
            ChargingSchedule schedule = withException(LocalDate.parse("2026-09-15"),
                    ChargingDayRule.notCharged());
            assertEquals(0, schedule.chargeableMinutes(at("2026-09-15", 8, 0), at("2026-09-15", 17, 0)));
        }

        @Test
        @DisplayName("a holiday inside a long stay removes only that day")
        void holidayInsideALongStay() {
            // Monday 16:00 → Wednesday 09:00, with Tuesday a holiday: 2h Monday + 0 + 2h Wednesday.
            ChargingSchedule schedule = withException(LocalDate.parse("2026-09-08"),
                    ChargingDayRule.notCharged());
            assertEquals(240, schedule.chargeableMinutes(at("2026-09-07", 16, 0), at("2026-09-09", 9, 0)));
        }

        @Test
        @DisplayName("an exception with its own bands replaces the weekday's")
        void exceptionWithOwnBands() {
            ChargingSchedule schedule = withException(LocalDate.parse("2026-09-08"),
                    new ChargingDayRule(true, false, List.of(new ChargingBand(9 * 60, 12 * 60))));
            assertEquals(180, schedule.chargeableMinutes(at("2026-09-08", 7, 0), at("2026-09-08", 18, 0)));
        }

        @Test
        @DisplayName("an exception that charges but declares no band falls back to the weekday's")
        void exceptionWithoutBandsFallsBack() {
            ChargingSchedule schedule = withException(LocalDate.parse("2026-09-08"),
                    new ChargingDayRule(true, false, List.of()));
            assertEquals(11 * 60, schedule.chargeableMinutes(at("2026-09-08", 0, 0), at("2026-09-09", 0, 0)));
        }

        @Test
        @DisplayName("an all-day exception charges the whole day")
        void allDayException() {
            ChargingSchedule schedule = withException(LocalDate.parse("2026-09-13"),
                    new ChargingDayRule(true, true, List.of()));
            assertEquals(24 * 60, schedule.chargeableMinutes(at("2026-09-13", 0, 0), at("2026-09-14", 0, 0)));
        }

        @Test
        @DisplayName("a holiday still wins over a municipality that charges around the clock")
        void holidayBeatsChargesAllDay() {
            // "All day" is a statement about the daily timetable; a holiday is one about the calendar.
            ChargingSchedule schedule = new ChargingSchedule(ZONE, true, Map.of(),
                    Map.of(LocalDate.parse("2026-09-15"), ChargingDayRule.notCharged()));
            assertEquals(0, schedule.chargeableMinutes(at("2026-09-15", 0, 0), at("2026-09-16", 0, 0)));
            assertEquals(24 * 60, schedule.chargeableMinutes(at("2026-09-16", 0, 0), at("2026-09-17", 0, 0)));
        }

        private ChargingSchedule withException(LocalDate date, ChargingDayRule rule) {
            ChargingSchedule base = mondayToSaturday();
            return new ChargingSchedule(ZONE, false, base.weeklyBands(), Map.of(date, rule));
        }
    }

    @Nested
    @DisplayName("overlapping bands entered by hand")
    class OverlappingBands {

        @Test
        @DisplayName("two overlapping bands are charged once, not twice")
        void overlappingBandsAreMerged() {
            Map<DayOfWeek, List<ChargingBand>> weekly = new EnumMap<>(DayOfWeek.class);
            weekly.put(DayOfWeek.MONDAY, List.of(
                    new ChargingBand(7 * 60, 12 * 60),
                    new ChargingBand(10 * 60, 18 * 60)));
            ChargingSchedule schedule = new ChargingSchedule(ZONE, false, weekly, Map.of());
            assertEquals(11 * 60, schedule.chargeableMinutes(at("2026-09-07", 0, 0), at("2026-09-08", 0, 0)));
        }

        @Test
        @DisplayName("two bands that touch become one continuous stretch")
        void touchingBandsAreMerged() {
            Map<DayOfWeek, List<ChargingBand>> weekly = new EnumMap<>(DayOfWeek.class);
            weekly.put(DayOfWeek.MONDAY, List.of(
                    new ChargingBand(7 * 60, 12 * 60),
                    new ChargingBand(12 * 60, 18 * 60)));
            ChargingSchedule schedule = new ChargingSchedule(ZONE, false, weekly, Map.of());
            assertEquals(1, schedule.bandsOn(LocalDate.parse("2026-09-07")).size());
            assertEquals(11 * 60, schedule.chargeableMinutes(at("2026-09-07", 0, 0), at("2026-09-08", 0, 0)));
        }
    }

    @Nested
    @DisplayName("time zone of the municipality")
    class MunicipalityTimeZone {

        @Test
        @DisplayName("the hours are the municipality's local ones, not UTC")
        void hoursAreLocal() {
            // 13:00 UTC is 07:00 in Costa Rica (UTC-6): charging has just opened there and the
            // schedule must say so even though the instant reads as the afternoon in UTC.
            ChargingSchedule schedule = mondayToSaturday();
            assertTrue(schedule.chargesAt(Instant.parse("2026-09-07T13:00:00Z")));
            assertFalse(schedule.chargesAt(Instant.parse("2026-09-07T12:59:00Z")));
        }

        @Test
        @DisplayName("the same timetable in another zone charges different instants")
        void sameTimetableOtherZone() {
            Map<DayOfWeek, List<ChargingBand>> weekly = new EnumMap<>(DayOfWeek.class);
            weekly.put(DayOfWeek.MONDAY, List.of(new ChargingBand(7 * 60, 18 * 60)));
            ChargingSchedule madrid = new ChargingSchedule(ZoneId.of("Europe/Madrid"), false, weekly, Map.of());
            // 07:00 in Madrid on that date is 05:00 UTC; Costa Rica's 07:00 is 13:00 UTC.
            assertTrue(madrid.chargesAt(Instant.parse("2026-09-07T05:00:00Z")));
            assertFalse(mondayToSaturday().chargesAt(Instant.parse("2026-09-07T05:00:00Z")));
        }
    }
}
