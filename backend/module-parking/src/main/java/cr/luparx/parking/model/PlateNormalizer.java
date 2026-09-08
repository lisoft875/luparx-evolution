package cr.luparx.parking.model;

import java.util.Locale;

/**
 * Turns a licence plate as a person typed it into the single form the platform compares and indexes:
 * upper case, with every separator removed (CONTRACT.md v0.2, "Vehículos").
 *
 * <p>Deliberately international. No country's plate format is validated here — the shape of a plate
 * is a fact about a vehicle registry, not about this platform, and a rule that rejects a valid
 * Panamanian plate because it does not look Costa Rican is a bug waiting for the first cross-border
 * driver. Only two things are enforced: something is left after normalising, and it is short enough
 * to be a plate.</p>
 */
public final class PlateNormalizer {

    /** Longest normalised plate accepted; matches {@code vehicles.plate_normalized}. */
    public static final int MAX_LENGTH = 16;

    private PlateNormalizer() {
    }

    /**
     * @return the normalised plate, or {@code null} when the input holds no alphanumeric character
     *         at all (which the caller reports as a validation error, never as an empty plate)
     */
    public static String normalize(String plate) {
        if (plate == null) {
            return null;
        }
        String upper = plate.toUpperCase(Locale.ROOT);
        StringBuilder builder = new StringBuilder(upper.length());
        for (int index = 0; index < upper.length(); index++) {
            char character = upper.charAt(index);
            if ((character >= 'A' && character <= 'Z') || (character >= '0' && character <= '9')) {
                builder.append(character);
            }
        }
        return builder.isEmpty() ? null : builder.toString();
    }

    public static boolean isValid(String normalized) {
        return normalized != null && !normalized.isEmpty() && normalized.length() <= MAX_LENGTH;
    }
}
