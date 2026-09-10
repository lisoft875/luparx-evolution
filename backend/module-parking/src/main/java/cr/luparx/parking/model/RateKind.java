package cr.luparx.parking.model;

import java.util.Locale;
import java.util.Optional;

/**
 * What a {@code parking_rates} row means (CONTRACT.md v0.24).
 *
 * <p>Two values and not a rules engine. The reference platform expresses a non-linear ladder with
 * generic rules carrying priorities, day sets and time windows, and resolves them by scoring; that
 * design earns its complexity there because those rules also decide <em>when</em> parking is
 * charged. Here it would not: the charging timetable is its own thing ({@code ChargingSchedule},
 * CONTRACT.md v0.3), and a second place deciding the same question is how two answers start
 * disagreeing.</p>
 *
 * <p>So there is nothing to score. A duration either has a price of its own or it does not, and
 * <b>an exact match is more specific than a formula</b> — which is a fact, not a configured
 * priority, so no two rows can ever tie.</p>
 */
public enum RateKind {

    /**
     * The zone's linear base: {@code amount} covers {@code minutes} minutes, charged per started
     * block. Mandatory, and the answer for every duration the ladder does not name — including a
     * citizen's saved-minute balance, which is an arbitrary integer (CONTRACT.md v0.12) and could
     * never have a rung of its own.
     */
    BLOCK,

    /**
     * One rung of the ladder: {@code amount} <b>is</b> the price of a stay of exactly
     * {@code minutes} minutes. Never multiplied by anything.
     */
    EXACT;

    public static Optional<RateKind> parse(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        for (RateKind kind : values()) {
            if (kind.name().equals(normalized)) {
                return Optional.of(kind);
            }
        }
        return Optional.empty();
    }
}
