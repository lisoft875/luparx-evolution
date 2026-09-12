package cr.luparx.app.geo;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;
import java.util.Map;

/**
 * The RFC 7946 shapes this API speaks (CONTRACT.md v0.40).
 *
 * <p>They live here and not in {@code ParkingDtos} because nothing about them is parking: the day a
 * bay or a municipal boundary gets a geometry, they are the same shapes.</p>
 *
 * <p>{@code geometry} is a {@link JsonNode} and not a typed record on purpose. A geometry is nested
 * arrays of numbers whose depth depends on its type, so a typed record would be a union of four
 * shapes that the client then has to reassemble — and the value being passed through here was
 * produced by {@code ST_AsGeoJSON}, which is already the authority on that format. Modelling it
 * again in Java would create a second definition that can only ever disagree with PostGIS.</p>
 */
public final class GeoJson {

    private GeoJson() {
    }

    /**
     * A collection of features, which is what every map client and QGIS or ArcGIS expects from a
     * URL that serves geometry.
     */
    public record FeatureCollection(String type, List<Feature> features) {

        public FeatureCollection(List<Feature> features) {
            this("FeatureCollection", features);
        }
    }

    /**
     * One feature: a geometry plus the attributes a map needs to label and link it.
     *
     * <p>{@code properties} carries the zone's id, code and name and nothing else. It is a map
     * because RFC 7946 leaves the contents open, and deliberately narrow because a feature served
     * to a citizen's phone is public the moment it is drawn — tariffs, schedules and anything
     * internal stay out of it.</p>
     */
    public record Feature(String type, String id, JsonNode geometry, Map<String, Object> properties) {

        public Feature(String id, JsonNode geometry, Map<String, Object> properties) {
            this("Feature", id, geometry, properties);
        }
    }
}
