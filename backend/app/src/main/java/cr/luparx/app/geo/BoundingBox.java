package cr.luparx.app.geo;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ValidationException;

/**
 * The {@code bbox} query parameter of a map request: {@code minLon,minLat,maxLon,maxLat}
 * (CONTRACT.md v0.40).
 *
 * <p>Longitude first, in that order, because that is what RFC 7946 §5 fixes for {@code bbox} and
 * what every map library sends. It is the one part of this API where the order of two numbers is
 * load-bearing, so it is parsed in exactly one place.</p>
 */
public record BoundingBox(double minLon, double minLat, double maxLon, double maxLat) {

    /**
     * @param raw the parameter as the client sent it, or null/blank when absent
     * @return the parsed box, or null when the caller sent none
     * @throws ValidationException when it is present but not four numbers describing a real box
     */
    public static BoundingBox parseOrNull(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String[] parts = raw.split(",", -1);
        if (parts.length != 4) {
            throw invalid();
        }
        double[] values = new double[4];
        for (int i = 0; i < 4; i++) {
            try {
                values[i] = Double.parseDouble(parts[i].trim());
            } catch (NumberFormatException exception) {
                throw invalid();
            }
            if (!Double.isFinite(values[i])) {
                throw invalid();
            }
        }
        BoundingBox box = new BoundingBox(values[0], values[1], values[2], values[3]);
        // A degenerate or inverted box is refused rather than swapped: silently reinterpreting it
        // would return a plausible answer to a question the client did not ask, and the mistake
        // would live on in their code.
        if (box.minLon >= box.maxLon || box.minLat >= box.maxLat
                || box.minLon < -180 || box.maxLon > 180
                || box.minLat < -90 || box.maxLat > 90) {
            throw invalid();
        }
        return box;
    }

    private static ValidationException invalid() {
        return new ValidationException("bbox", ErrorCode.VALIDATION_FAILED, "error.geo.bbox.invalid");
    }
}
