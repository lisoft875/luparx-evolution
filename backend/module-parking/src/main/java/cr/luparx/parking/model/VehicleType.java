package cr.luparx.parking.model;

import java.util.Locale;
import java.util.Optional;

/**
 * What kind of vehicle a citizen registered.
 *
 * <h2>Why this is an enum in the domain and a catalogue on the wire</h2>
 *
 * <p>It looks cosmetic — a label on a card — and it is not. The day a municipality charges a
 * motorcycle less than a car, this column is what the tariff is resolved by; the day an inspector
 * has to say what they are looking at, this is the word they use. A free-text field would make both
 * impossible after the fact, and a list written in the frontend would make them impossible to agree
 * on across four applications.</p>
 *
 * <p>So the set is closed and lives here, and the API publishes it with an i18n key per value
 * ({@code GET /api/v1/catalog/vehicle-types}). The client renders the key it is given; it never
 * ships its own copy of the list, and adding a value is a change in one place.</p>
 *
 * <h2>Why exactly two</h2>
 *
 * <p>A car and a motorcycle, and nothing else. The product asks a citizen one question — "is it a car
 * or a motorcycle?" — and every additional option would be a choice the citizen has to make that
 * nothing downstream reads. {@link #MOTORCYCLE} earns its place because it occupies a fraction of a
 * bay and is the one kind municipalities price differently first; {@link #CAR} is everything else and
 * is the default of any backfill.</p>
 *
 * <p>An earlier revision offered PICKUP, VAN and OTHER. They were removed in V16_0 because no tariff,
 * no report and no enforcement rule ever distinguished them: they were three ways to make a form
 * longer. The set is deliberately easy to grow — a value, a translation key, a widened CHECK — so the
 * day a municipality genuinely charges a pick-up differently, it comes back with a reason attached
 * rather than in anticipation of one.</p>
 *
 * <p>A bicycle is absent for a different reason: it does not occupy a paid bay in any municipality
 * this platform serves, so offering it would create a vehicle that can never legitimately start a
 * session — a dead end dressed up as a feature.</p>
 */
public enum VehicleType {

    CAR,
    MOTORCYCLE;

    /** The default of a vehicle that predates this field, and of a client that sends none. */
    public static final VehicleType DEFAULT = CAR;

    /**
     * The i18n key the client renders. Never a literal: no user-visible text lives in the code, and
     * the same key has to serve the app, an email and a PDF (CONTRACT.md §7).
     */
    public String labelKey() {
        return "vehicle.type." + name().toLowerCase(Locale.ROOT);
    }

    /** Parses a value from the wire; empty for null, blank or unknown, so the caller decides. */
    public static Optional<VehicleType> parse(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        for (VehicleType type : values()) {
            if (type.name().equals(normalized)) {
                return Optional.of(type);
            }
        }
        return Optional.empty();
    }
}
