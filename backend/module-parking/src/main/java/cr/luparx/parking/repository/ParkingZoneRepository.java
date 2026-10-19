package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingZone;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Zones of one municipality. Every method takes {@code tenantId} as a mandatory first parameter
 * (docs/ARCHITECTURE.md §4): there is deliberately no "list every zone" read, because a query
 * without a tenant is how cross-tenant data escapes.
 */
public interface ParkingZoneRepository extends JpaRepository<ParkingZone, UUID> {

    List<ParkingZone> findByTenantIdOrderByCodeAsc(UUID tenantId);

    List<ParkingZone> findByTenantIdAndActiveTrueOrderByCodeAsc(UUID tenantId);

    Optional<ParkingZone> findByTenantIdAndCode(UUID tenantId, String code);

    Optional<ParkingZone> findByTenantIdAndId(UUID tenantId, UUID id);

    long countByTenantId(UUID tenantId);

    // --- geometry (CONTRACT.md v0.40, ADR 0024) ---------------------------------------------------
    //
    // Native SQL on purpose, and the only place in the codebase where geometry appears. PostGIS does
    // the conversion in both directions and the application handles GeoJSON text, so the JVM never
    // holds a geometry object. The three reasons that is the right trade here are in ADR 0024; the
    // practical one is that every geometric predicate has to be SQL anyway to use the GiST index.
    //
    // Every statement is narrowed by `tenant_id` AND `id`, never by `id` alone: a zone id from
    // another municipality must answer "not found", not "here you go" (SECURITY.md, BOLA).

    /**
     * The geometry of one zone as an RFC 7946 geometry object, or empty when the zone has none.
     *
     * <p>Six decimals is about 11 cm at the equator — far finer than a painted bay — and it keeps the
     * payload small; it is also the precision the existing {@code latitude}/{@code longitude}
     * columns already use. {@code geom is not null} is in the predicate so that an empty result
     * means "no geometry": whether the zone itself exists is a question the caller has already
     * asked.</p>
     */
    @Query(value = """
            select ST_AsGeoJSON(z.geom, 6)
              from parking_zones z
             where z.tenant_id = :tenantId and z.id = :id and z.geom is not null
            """, nativeQuery = true)
    Optional<String> findGeometryGeoJson(@Param("tenantId") UUID tenantId, @Param("id") UUID id);

    /**
     * Replaces the geometry of one zone.
     *
     * <p>{@code ST_GeomFromGeoJSON} assigns SRID 4326, which is what RFC 7946 mandates and what the
     * column declares; {@code ST_Multi} promotes a single {@code Polygon} to the {@code MultiPolygon}
     * the column holds, so a client that draws one piece never has to know about the difference.</p>
     *
     * <p>{@code version} is compared and bumped by hand because this is not a Hibernate update: the
     * caller passes the version it read and a result of 0 means either the zone is gone or somebody
     * else edited it first. Both answers are the caller's to distinguish.</p>
     *
     * <p><b>Redibujar DEGRADA la verificación</b> (CONTRACT.md v0.44). En el mismo UPDATE el estado
     * vuelve a {@code UNVERIFIED} y se borran autor y fecha, porque el sello aprobaba AQUEL
     * polígono y no éste. Sin estas cuatro líneas, quien verifica un perímetro correcto y después
     * lo cambia por otro se queda con el sello puesto, que es el agujero clásico de todo flujo de
     * aprobación. La procedencia pasa a {@code ADMIN_DRAWING}: esto llega por el portal.</p>
     *
     * @return 1 when the row was updated, 0 when the zone does not exist or the version moved
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Transactional
    @Query(value = """
            update parking_zones
               set geom = ST_Multi(ST_GeomFromGeoJSON(cast(:geoJson as text))),
                   geom_source = 'ADMIN_DRAWING',
                   geom_status = 'UNVERIFIED',
                   geom_verified_by = null,
                   geom_verified_at = null,
                   updated_at = :now,
                   version = version + 1
             where id = :id and tenant_id = :tenantId and version = :expectedVersion
            """, nativeQuery = true)
    int replaceGeometry(@Param("tenantId") UUID tenantId,
                        @Param("id") UUID id,
                        @Param("geoJson") String geoJson,
                        @Param("now") Instant now,
                        @Param("expectedVersion") long expectedVersion);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Transactional
    @Query(value = """
            update parking_zones
               set geom = null,
                   geom_source = null,
                   geom_status = 'UNVERIFIED',
                   geom_verified_by = null,
                   geom_verified_at = null,
                   updated_at = :now,
                   version = version + 1
             where id = :id and tenant_id = :tenantId and version = :expectedVersion
            """, nativeQuery = true)
    int clearGeometry(@Param("tenantId") UUID tenantId,
                      @Param("id") UUID id,
                      @Param("now") Instant now,
                      @Param("expectedVersion") long expectedVersion);

    /**
     * Why PostGIS refused a geometry, in its own words.
     *
     * <p>Called only after a write has already failed against
     * {@code ck_parking_zones_geom_valid}, and deliberately not before: the happy path must not pay
     * a round trip for a check the database is going to make anyway. {@code ST_IsValidReason}
     * answers {@code "Valid Geometry"} or a sentence naming the defect and the offending point —
     * "Self-intersection at or near point ..." — which is the difference between a client that can
     * fix its polygon and one that cannot.</p>
     */
    @Query(value = """
            select ST_IsValidReason(ST_GeomFromGeoJSON(cast(:geoJson as text)))
            """, nativeQuery = true)
    Optional<String> explainGeometry(@Param("geoJson") String geoJson);

    /**
     * Zones of this municipality that have a geometry, newest-drawn or not, ordered by code.
     *
     * <p>Bounded by {@code :max} because this feeds a map and an unbounded collection through a
     * normal endpoint is forbidden (docs/ARCHITECTURE.md §7). Inactive zones are left out: a map is
     * a picture of what is being charged today.</p>
     */
    @Query(value = """
            select cast(z.id as varchar) as id, z.code as code, z.name as name,
                   ST_AsGeoJSON(z.geom, 6) as geometry,
                   z.geom_source as source, z.geom_status as status,
                   to_char(z.geom_verified_at at time zone 'UTC',
                           'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "verifiedAt"
              from parking_zones z
             where z.tenant_id = :tenantId and z.active and z.geom is not null
               and z.geom_status in (:statuses)
             order by z.code
             limit :max
            """, nativeQuery = true)
    List<ZoneGeometryRow> findGeometries(@Param("tenantId") UUID tenantId,
                                         @Param("statuses") Collection<String> statuses,
                                         @Param("max") int max);

    /**
     * The same, narrowed to a bounding box.
     *
     * <p>{@code &&} is the bounding-box overlap operator, and it is the one predicate the GiST index
     * of V38_0 can answer. It is intentionally not {@code ST_Intersects}: a map asks "what could be
     * on screen", and refining an envelope hit to exact geometry would cost more than it saves for a
     * picture that is about to be drawn anyway.</p>
     *
     * <p>A separate method rather than nullable parameters on the one above: a native query with
     * {@code :minLon is null or ...} makes PostgreSQL guess the type of a null parameter, and the
     * failure mode is a runtime cast error on an endpoint nobody tested with an empty box.</p>
     */
    @Query(value = """
            select cast(z.id as varchar) as id, z.code as code, z.name as name,
                   ST_AsGeoJSON(z.geom, 6) as geometry,
                   z.geom_source as source, z.geom_status as status,
                   to_char(z.geom_verified_at at time zone 'UTC',
                           'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "verifiedAt"
              from parking_zones z
             where z.tenant_id = :tenantId and z.active and z.geom is not null
               and z.geom_status in (:statuses)
               and z.geom && ST_MakeEnvelope(:minLon, :minLat, :maxLon, :maxLat, 4326)
             order by z.code
             limit :max
            """, nativeQuery = true)
    List<ZoneGeometryRow> findGeometriesInBbox(@Param("tenantId") UUID tenantId,
                                               @Param("statuses") Collection<String> statuses,
                                               @Param("minLon") double minLon,
                                               @Param("minLat") double minLat,
                                               @Param("maxLon") double maxLon,
                                               @Param("maxLat") double maxLat,
                                               @Param("max") int max);

    // --- verificación de la geometría (CONTRACT.md v0.44, ADR 0029) ------------------------------

    /**
     * Procedencia y estado de revisión de una zona, y si llegó a tener polígono.
     *
     * <p>Lo lee el servicio ANTES de aprobar, para poder negarse con un motivo que se entienda en
     * vez de dejar que reviente un CHECK. Acotado por inquilino e id, como todo lo demás de este
     * bloque: un id de otra municipalidad no existe.</p>
     */
    @Query(value = """
            select (z.geom is not null) as drawn, z.geom_source as source, z.geom_status as status
              from parking_zones z
             where z.tenant_id = :tenantId and z.id = :id
            """, nativeQuery = true)
    Optional<ZoneGeometryReviewRow> findGeometryReview(@Param("tenantId") UUID tenantId,
                                                       @Param("id") UUID id);

    /**
     * Asienta la decisión de una persona sobre el perímetro de una zona.
     *
     * <p>Autor y fecha se escriben <b>sólo</b> cuando la decisión es {@code VERIFIED}: las columnas
     * dicen quién APROBÓ, y un rechazo no es una aprobación. Quién rechazó, cuándo y por qué queda
     * en el evento sellado de la bitácora, que es donde vive la evidencia (ADR 0029).</p>
     *
     * <p>{@code :source} viaja con un {@code cast} explícito porque puede ser nulo —«no cambio la
     * procedencia»— y PostgreSQL no puede adivinar el tipo de un parámetro nulo en SQL nativo. Es
     * la misma razón por la que el bbox tiene su propio método en vez de parámetros anulables.</p>
     *
     * <p>No hay acá ninguna defensa contra verificar una DEMO: la impone el CHECK
     * {@code ck_parking_zones_geom_demo_never_verified} de la base, y el servicio se niega antes
     * con un código propio. Repetirla en este WHERE sólo convertiría una negativa explicable en
     * «cero filas», que es como se informa un conflicto de versión.</p>
     *
     * @return 1 cuando la fila se actualizó, 0 cuando la zona no está o la versión se movió
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Transactional
    @Query(value = """
            update parking_zones
               set geom_status = :status,
                   geom_source = coalesce(cast(:source as varchar), geom_source),
                   geom_verified_by = case when :status = 'VERIFIED'
                                           then cast(:actor as uuid) else null end,
                   geom_verified_at = case when :status = 'VERIFIED'
                                           then cast(:now as timestamptz) else null end,
                   updated_at = :now,
                   version = version + 1
             where id = :id and tenant_id = :tenantId and version = :expectedVersion
            """, nativeQuery = true)
    int reviewGeometry(@Param("tenantId") UUID tenantId,
                       @Param("id") UUID id,
                       @Param("status") String status,
                       @Param("source") String source,
                       @Param("actor") UUID actor,
                       @Param("now") Instant now,
                       @Param("expectedVersion") long expectedVersion);
}
