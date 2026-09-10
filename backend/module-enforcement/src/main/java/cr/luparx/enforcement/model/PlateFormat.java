package cr.luparx.enforcement.model;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ValidationException;

import java.util.Locale;

/**
 * How enforcement writes a plate down: upper case, separators dropped.
 *
 * <p>A pure function with no dependencies, deliberately extracted from {@code PlateStatusService}
 * when {@code PlateExemptionService} came to need the same normalisation. Two services calling each
 * other to share a string function is a circular dependency, and the way out of one is not
 * {@code @Lazy} — it is noticing that the shared thing was never a service to begin with.</p>
 *
 * <p>Enforcement keeps its own copy rather than reaching for the parking domain's
 * {@code PlateNormalizer}: this module does not depend on that one, on purpose (see
 * {@code ParkingStatusPort}). The two must agree, and the reason they must is written down in both.</p>
 *
 * <p>No country's plate shape is validated. Rejecting a valid foreign plate would leave an officer
 * unable to look up a car that is very much parked in front of them.</p>
 */
public final class PlateFormat {

    /** Longest plate accepted, matching {@code vehicles.plate_normalized} in the parking domain. */
    public static final int MAX_LENGTH = 16;

    private PlateFormat() {
    }

    /**
     * The canonical form, or a refusal.
     *
     * <p>This is a gate: a plate that fails it can be neither looked up nor fined nor exempted.</p>
     *
     * @throws ValidationException when nothing usable is left, or the result is too long
     */
    public static String normalize(String plate) {
        if (plate == null) {
            throw new ValidationException("plate", ErrorCode.VALIDATION_FAILED, "error.parking.plate.invalid");
        }
        String canonical = strip(plate, MAX_LENGTH + 1);
        if (canonical.isEmpty() || canonical.length() > MAX_LENGTH) {
            throw new ValidationException("plate", ErrorCode.VALIDATION_FAILED, "error.parking.plate.invalid");
        }
        return canonical;
    }

    /**
     * The same treatment for a <em>fragment</em> typed into a search box, with no refusal.
     *
     * <p>Separate from {@link #normalize} on purpose: softening the gate so a search box could reuse
     * it would weaken the gate for everybody. Returns an empty string when nothing usable is left.</p>
     */
    public static String normalizeFragment(String fragment) {
        return fragment == null ? "" : strip(fragment, MAX_LENGTH);
    }

    private static String strip(String value, int limit) {
        String upper = value.toUpperCase(Locale.ROOT);
        StringBuilder builder = new StringBuilder(Math.min(upper.length(), limit));
        for (int index = 0; index < upper.length() && builder.length() < limit; index++) {
            char character = upper.charAt(index);
            if ((character >= 'A' && character <= 'Z') || (character >= '0' && character <= '9')) {
                builder.append(character);
            }
        }
        return builder.toString();
    }
}
