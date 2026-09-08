package cr.luparx.parking.model;

import java.util.List;

/**
 * What a dated exception says about one day (CONTRACT.md v0.3, "Horario de cobro" — "Excepciones por
 * fecha").
 *
 * <p>Three shapes, and they are genuinely different:</p>
 * <ul>
 *   <li>{@code charges = false} — a public holiday: nothing is charged that day, whatever the weekday
 *       bands say;</li>
 *   <li>{@code charges = true, allDay = true} — that one day is charged around the clock;</li>
 *   <li>{@code charges = true} with bands — that day is charged on hours of its own; with no band of
 *       its own it falls back to the weekday bands, which is what "we open as usual" means.</li>
 * </ul>
 *
 * @param charges whether anything is charged on this date at all
 * @param allDay  whether the whole day is charged, ignoring any band
 * @param bands   this date's own bands; empty means "use the weekday bands"
 */
public record ChargingDayRule(boolean charges, boolean allDay, List<ChargingBand> bands) {

    public ChargingDayRule {
        bands = bands == null ? List.of() : List.copyOf(bands);
    }

    /** A holiday: no charging at all. */
    public static ChargingDayRule notCharged() {
        return new ChargingDayRule(false, false, List.of());
    }
}
