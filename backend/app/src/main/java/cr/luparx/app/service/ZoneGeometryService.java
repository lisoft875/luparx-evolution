package cr.luparx.app.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import cr.luparx.app.config.GeoProperties;
import cr.luparx.app.geo.BoundingBox;
import cr.luparx.app.geo.GeoJson;
import cr.luparx.app.geo.GeoJsonGeometryValidator;
import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.UnprocessableEntityException;
import cr.luparx.core.id.TenantId;
import cr.luparx.parking.repository.ParkingZoneRepository;
import cr.luparx.parking.repository.ZoneGeometryRow;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Reading and writing the geometry of a zone as GeoJSON (CONTRACT.md v0.40, ADR 0024).
 *
 * <h2>Deliberately not {@code @Transactional}</h2>
 *
 * <p>Each repository call opens its own transaction, and that is the point. When a write is refused
 * by {@code ck_parking_zones_geom_valid}, PostgreSQL has aborted that transaction: nothing else can
 * run inside it. Asking PostGIS <em>why</em> it refused — which is the difference between a client
 * that can fix its polygon and one that gets "invalid" — is therefore a second transaction, and it
 * can only exist if this method is not holding the first one.</p>
 *
 * <p>Nothing is lost by that: a geometry write touches one row, so there is no multi-statement
 * invariant to protect, and the failed statement leaves the row exactly as it was.</p>
 */
@Service
public class ZoneGeometryService {

    /**
     * The one constraint whose violation this class translates. Matched by name so that any other
     * integrity failure keeps travelling to the generic handler instead of being mislabelled as a
     * geometry problem.
     */
    private static final String GEOMETRY_VALID_CONSTRAINT = "ck_parking_zones_geom_valid";

    private static final String POSTGIS_VALID = "Valid Geometry";

    private final ParkingZoneRepository zoneRepository;
    private final GeoJsonGeometryValidator validator;
    private final GeoProperties properties;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public ZoneGeometryService(ParkingZoneRepository zoneRepository,
                               GeoJsonGeometryValidator validator,
                               GeoProperties properties,
                               ObjectMapper objectMapper,
                               Clock clock) {
        this.zoneRepository = zoneRepository;
        this.validator = validator;
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    /** @return the zone's geometry as an RFC 7946 geometry object, or empty when it has none */
    public Optional<JsonNode> find(TenantId tenantId, UUID zoneId) {
        return zoneRepository.findGeometryGeoJson(tenantId.value(), zoneId).map(this::parse);
    }

    /**
     * Replaces the geometry of one zone.
     *
     * @param expectedVersion the {@code version} of the zone as the caller just read it
     * @return how many positions were stored
     * @throws ConflictException            when the zone moved under the caller
     * @throws UnprocessableEntityException when PostGIS refuses the polygon, carrying its reason
     */
    public int replace(TenantId tenantId, UUID zoneId, long expectedVersion, JsonNode geometry) {
        int positions = validator.validate("geometry", geometry);
        String geoJson = write(geometry);
        int updated;
        try {
            updated = zoneRepository.replaceGeometry(
                    tenantId.value(), zoneId, geoJson, clock.instant(), expectedVersion);
        } catch (DataIntegrityViolationException violation) {
            throw refused(geoJson, violation);
        }
        requireUpdated(updated);
        return positions;
    }

    /** Removes the geometry, leaving the zone charging exactly as it did before it had one. */
    public void clear(TenantId tenantId, UUID zoneId, long expectedVersion) {
        requireUpdated(zoneRepository.clearGeometry(
                tenantId.value(), zoneId, clock.instant(), expectedVersion));
    }

    /**
     * The zones of this municipality that have been drawn, as a FeatureCollection.
     *
     * @param box the viewport, or null for every drawn zone of the municipality
     */
    public GeoJson.FeatureCollection featureCollection(TenantId tenantId, BoundingBox box) {
        int max = properties.effectiveMaxZonesPerMap();
        List<ZoneGeometryRow> rows = box == null
                ? zoneRepository.findGeometries(tenantId.value(), max)
                : zoneRepository.findGeometriesInBbox(tenantId.value(), box.minLon(), box.minLat(),
                        box.maxLon(), box.maxLat(), max);
        List<GeoJson.Feature> features = new ArrayList<>(rows.size());
        for (ZoneGeometryRow row : rows) {
            Map<String, Object> attributes = new LinkedHashMap<>();
            attributes.put("code", row.getCode());
            attributes.put("name", row.getName());
            features.add(new GeoJson.Feature(row.getId(), parse(row.getGeometry()), attributes));
        }
        return new GeoJson.FeatureCollection(features);
    }

    // --- internals -------------------------------------------------------------------------------

    private void requireUpdated(int updated) {
        if (updated == 0) {
            // The zone's existence was already checked by the caller, so nothing else can explain
            // zero rows: somebody else edited this zone between that read and this write.
            throw ConflictException.of(ErrorCode.OPTIMISTIC_LOCK_CONFLICT, "error.conflict.optimisticLock");
        }
    }

    private UnprocessableEntityException refused(String geoJson, DataIntegrityViolationException violation) {
        String cause = violation.getMostSpecificCause().getMessage();
        if (cause == null || !cause.contains(GEOMETRY_VALID_CONSTRAINT)) {
            throw violation;
        }
        // PostGIS's own words about the client's own input: "Self-intersection at or near point
        // ...". The constraint name is never part of what travels back — that would leak schema.
        String reason = zoneRepository.explainGeometry(geoJson)
                .filter(value -> !POSTGIS_VALID.equalsIgnoreCase(value))
                .orElse("");
        return UnprocessableEntityException.of(ErrorCode.INVALID_GEOMETRY, "error.geo.geometry.invalid", reason);
    }

    private JsonNode parse(String geoJson) {
        try {
            return objectMapper.readTree(geoJson);
        } catch (JsonProcessingException exception) {
            // Unreachable in practice: this text came from ST_AsGeoJSON. If it ever happens, it is a
            // defect on our side and must not be reported as the client's bad request.
            throw new IllegalStateException("PostGIS produced GeoJSON that cannot be parsed", exception);
        }
    }

    private String write(JsonNode geometry) {
        try {
            return objectMapper.writeValueAsString(geometry);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("a parsed geometry cannot be serialised back", exception);
        }
    }
}
