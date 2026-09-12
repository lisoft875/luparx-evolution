package cr.luparx.app.geo;

import com.fasterxml.jackson.databind.JsonNode;
import cr.luparx.app.config.GeoProperties;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.UnprocessableEntityException;
import cr.luparx.core.error.ValidationException;
import org.springframework.stereotype.Component;

/**
 * Structural validation of an incoming RFC 7946 geometry, before it reaches PostGIS
 * (CONTRACT.md v0.40, ADR 0024).
 *
 * <h2>Why this exists when the database also checks</h2>
 *
 * <p>The two checks catch different things and neither replaces the other. PostGIS answers the
 * <b>topological</b> question — is this polygon self-intersecting? — and {@code
 * ck_parking_zones_geom_valid} makes that answer binding for every writer, including a future job or
 * a hand-run statement. What PostGIS cannot do is tell a client <em>which field</em> was wrong: a
 * {@code Feature} instead of a geometry, an unclosed ring or a longitude of 500 all surface as one
 * database error, and two of those three would not even reach the constraint —
 * {@code ST_GeomFromGeoJSON} would throw first and abort the transaction.</p>
 *
 * <p>So the shape of the payload is checked here, where a precise field path and an i18n key can be
 * produced (CONTRACT.md §4), and validity stays the database's word.</p>
 *
 * <h2>What it deliberately does not do</h2>
 *
 * <p>It does not repair anything. A ring that is not closed is not silently closed and a winding
 * order is not reversed: accepting a polygon the client did not draw is how a zone ends up covering
 * a street nobody agreed to charge for.</p>
 */
@Component
public class GeoJsonGeometryValidator {

    private static final String POLYGON = "Polygon";
    private static final String MULTI_POLYGON = "MultiPolygon";
    /** RFC 7946 §3.1.6: a linear ring has at least four positions, the last repeating the first. */
    private static final int MIN_RING_POSITIONS = 4;

    private final GeoProperties properties;

    public GeoJsonGeometryValidator(GeoProperties properties) {
        this.properties = properties;
    }

    /**
     * @param field    dotted path of the geometry in the request, used in the field errors
     * @param geometry the parsed GeoJSON geometry object — never a Feature or a FeatureCollection
     * @return how many positions the geometry carries, so the caller can log what it accepted
     * @throws ValidationException          when the payload is not a usable Polygon or MultiPolygon
     * @throws UnprocessableEntityException when it is well formed but larger than this deployment serves
     */
    public int validate(String field, JsonNode geometry) {
        if (geometry == null || !geometry.isObject()) {
            throw fail(field, "error.geo.geometry.required");
        }
        JsonNode typeNode = geometry.get("type");
        if (typeNode == null || !typeNode.isTextual()) {
            throw fail(field + ".type", "error.geo.geometry.type.unsupported");
        }
        String type = typeNode.textValue();
        JsonNode coordinates = geometry.get("coordinates");
        if (coordinates == null || !coordinates.isArray() || coordinates.isEmpty()) {
            throw fail(field + ".coordinates", "error.geo.geometry.coordinates.invalid");
        }

        int positions;
        if (POLYGON.equals(type)) {
            positions = validatePolygon(field + ".coordinates", coordinates);
        } else if (MULTI_POLYGON.equals(type)) {
            positions = 0;
            for (int i = 0; i < coordinates.size(); i++) {
                JsonNode polygon = coordinates.get(i);
                if (!polygon.isArray() || polygon.isEmpty()) {
                    throw fail(field + ".coordinates[" + i + "]", "error.geo.geometry.coordinates.invalid");
                }
                positions += validatePolygon(field + ".coordinates[" + i + "]", polygon);
            }
        } else {
            // Named explicitly so the message can say what IS accepted. A Feature lands here too,
            // which is the single most likely mistake: RFC 7946 puts the geometry inside the
            // Feature, and ST_GeomFromGeoJSON only ever takes the geometry.
            throw fail(field + ".type", "error.geo.geometry.type.unsupported");
        }

        int max = properties.effectiveMaxZoneVertices();
        if (positions > max) {
            throw UnprocessableEntityException.of(ErrorCode.GEOMETRY_TOO_COMPLEX,
                    "error.geo.geometry.tooComplex", positions, max);
        }
        return positions;
    }

    /** @return the number of positions across every ring of this polygon */
    private int validatePolygon(String field, JsonNode rings) {
        if (!rings.isArray() || rings.isEmpty()) {
            throw fail(field, "error.geo.geometry.coordinates.invalid");
        }
        int positions = 0;
        for (int i = 0; i < rings.size(); i++) {
            positions += validateRing(field + "[" + i + "]", rings.get(i));
        }
        return positions;
    }

    private int validateRing(String field, JsonNode ring) {
        if (!ring.isArray() || ring.size() < MIN_RING_POSITIONS) {
            throw fail(field, "error.geo.geometry.ring.tooShort");
        }
        for (int i = 0; i < ring.size(); i++) {
            validatePosition(field + "[" + i + "]", ring.get(i));
        }
        if (!samePosition(ring.get(0), ring.get(ring.size() - 1))) {
            throw fail(field, "error.geo.geometry.ring.notClosed");
        }
        return ring.size();
    }

    /**
     * A position is exactly two finite numbers, longitude first.
     *
     * <p>Two and not three: RFC 7946 allows an altitude, but the column is a 2D
     * {@code geometry(MultiPolygon, 4326)} and PostgreSQL would reject the 3D geometry with a type
     * error that says nothing about altitude. Refusing it here says what happened.</p>
     */
    private void validatePosition(String field, JsonNode position) {
        if (!position.isArray() || position.size() != 2
                || !position.get(0).isNumber() || !position.get(1).isNumber()) {
            throw fail(field, "error.geo.geometry.position.invalid");
        }
        double longitude = position.get(0).asDouble();
        double latitude = position.get(1).asDouble();
        if (!Double.isFinite(longitude) || !Double.isFinite(latitude)
                || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
            throw fail(field, "error.geo.geometry.position.outOfRange");
        }
    }

    private boolean samePosition(JsonNode first, JsonNode last) {
        return first.get(0).asDouble() == last.get(0).asDouble()
                && first.get(1).asDouble() == last.get(1).asDouble();
    }

    private ValidationException fail(String field, String messageKey) {
        return new ValidationException(field, ErrorCode.INVALID_GEOMETRY, messageKey);
    }
}
