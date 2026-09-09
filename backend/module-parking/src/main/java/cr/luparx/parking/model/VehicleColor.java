package cr.luparx.parking.model;

import java.util.Locale;
import java.util.Optional;

/**
 * The colour of a vehicle, as a closed catalogue.
 *
 * <h2>Why a catalogue and not free text</h2>
 *
 * <p>An inspector standing in the street looks for "the grey one". If every citizen types their own
 * colour, that search matches "gris", "Gris", "gris oscuro", "plomo" and "grisáceo" as five
 * different things, and the one query the field exists for stops working. The set is therefore
 * closed, stored as a key, and published with an i18n label
 * ({@code GET /api/v1/catalog/vehicle-colors}) so the client never ships its own copy.</p>
 *
 * <p>Storing a key rather than a word is also what makes the field survive translation: the same
 * vehicle is "Gris" to a citizen reading Spanish and "Grey" to an inspector reading English, and it
 * is one row either way.</p>
 *
 * <h2>Why these values</h2>
 *
 * <p>They are the colours a person says out loud about a car, not a paint catalogue. {@link #GRAY}
 * and {@link #SILVER} are kept apart because people genuinely distinguish them on the street and
 * merging them would lose the distinction the search depends on; {@link #OTHER} exists so that
 * registering a vehicle is never blocked by a colour nobody anticipated.</p>
 */
public enum VehicleColor {

    WHITE,
    BLACK,
    GRAY,
    SILVER,
    RED,
    BLUE,
    GREEN,
    YELLOW,
    ORANGE,
    BROWN,
    BEIGE,
    OTHER;

    /** The i18n key the client renders; never a literal (CONTRACT.md §7). */
    public String labelKey() {
        return "vehicle.color." + name().toLowerCase(Locale.ROOT);
    }

    /** Parses a value from the wire; empty for null, blank or unknown. */
    public static Optional<VehicleColor> parse(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        for (VehicleColor color : values()) {
            if (color.name().equals(normalized)) {
                return Optional.of(color);
            }
        }
        return Optional.empty();
    }
}
