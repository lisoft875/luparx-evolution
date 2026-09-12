package cr.luparx.parking.repository;

/**
 * One zone with its geometry already serialised by PostGIS (CONTRACT.md v0.40).
 *
 * <p>A projection and not the entity on purpose: the geometry never becomes a Java object. PostGIS
 * turns it into GeoJSON with {@code ST_AsGeoJSON} and the application passes that text through, so
 * no geometry library enters the JVM and there is no second representation that could disagree with
 * the column (ADR 0024).</p>
 *
 * <p>The aliases of the native query have to match these names, which is why the query spells them
 * out. {@code id} arrives as text because the only thing done with it is writing it into a GeoJSON
 * {@code properties} object.</p>
 */
public interface ZoneGeometryRow {

    String getId();

    String getCode();

    String getName();

    /** RFC 7946 geometry object, as produced by {@code ST_AsGeoJSON}. Never a Feature. */
    String getGeometry();
}
