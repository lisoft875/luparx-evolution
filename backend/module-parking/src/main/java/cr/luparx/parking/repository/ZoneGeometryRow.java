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

    /**
     * De dónde salió el polígono (CONTRACT.md v0.44): {@code MUNICIPAL_OFFICIAL}, {@code GIS_IMPORT},
     * {@code ADMIN_DRAWING} o {@code DEMO}.
     */
    String getSource();

    /** Estado de revisión: {@code UNVERIFIED}, {@code PENDING_REVIEW}, {@code VERIFIED}, {@code REJECTED}. */
    String getStatus();

    /**
     * Cuándo se aprobó, en ISO-8601 UTC, o nulo si no está aprobada.
     *
     * <p>Lo arma PostgreSQL con {@code to_char} y viaja como texto a propósito. Un
     * {@code timestamptz} en una proyección de consulta nativa depende de cómo el controlador JDBC
     * y Hibernate acuerden el tipo, y el modo de falla es una excepción de conversión en tiempo de
     * ejecución sobre un extremo que compiló perfecto. El formato que sale es exactamente el que el
     * contrato publica.</p>
     */
    String getVerifiedAt();
}
