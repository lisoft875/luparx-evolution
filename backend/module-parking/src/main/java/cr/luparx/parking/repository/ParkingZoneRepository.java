package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingZone;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
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
     * @return 1 when the row was updated, 0 when the zone does not exist or the version moved
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Transactional
    @Query(value = """
            update parking_zones
               set geom = ST_Multi(ST_GeomFromGeoJSON(cast(:geoJson as text))),
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
                   ST_AsGeoJSON(z.geom, 6) as geometry
              from parking_zones z
             where z.tenant_id = :tenantId and z.active and z.geom is not null
             order by z.code
             limit :max
            """, nativeQuery = true)
    List<ZoneGeometryRow> findGeometries(@Param("tenantId") UUID tenantId, @Param("max") int max);

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
                   ST_AsGeoJSON(z.geom, 6) as geometry
              from parking_zones z
             where z.tenant_id = :tenantId and z.active and z.geom is not null
               and z.geom && ST_MakeEnvelope(:minLon, :minLat, :maxLon, :maxLat, 4326)
             order by z.code
             limit :max
            """, nativeQuery = true)
    List<ZoneGeometryRow> findGeometriesInBbox(@Param("tenantId") UUID tenantId,
                                               @Param("minLon") double minLon,
                                               @Param("minLat") double minLat,
                                               @Param("maxLon") double maxLon,
                                               @Param("maxLat") double maxLat,
                                               @Param("max") int max);
}
