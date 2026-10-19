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
import cr.luparx.parking.model.ZoneGeometrySource;
import cr.luparx.parking.model.ZoneGeometryStatus;
import cr.luparx.parking.repository.ParkingZoneRepository;
import cr.luparx.parking.repository.ZoneGeometryReviewRow;
import cr.luparx.parking.repository.ZoneGeometryRow;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
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
        // El filtro por estado va en el WHERE y no acá: una geometría que esta instalación no
        // publica sencillamente no se trae, así que no hay nada que un cliente pueda rotular mal
        // ni mostrar de más. Por omisión eso significa que sólo salen las verificadas.
        Set<String> estados = properties.effectiveCitizenGeometryStatuses();
        List<ZoneGeometryRow> rows = box == null
                ? zoneRepository.findGeometries(tenantId.value(), estados, max)
                : zoneRepository.findGeometriesInBbox(tenantId.value(), estados, box.minLon(),
                        box.minLat(), box.maxLon(), box.maxLat(), max);
        List<GeoJson.Feature> features = new ArrayList<>(rows.size());
        for (ZoneGeometryRow row : rows) {
            Map<String, Object> attributes = new LinkedHashMap<>();
            attributes.put("code", row.getCode());
            attributes.put("name", row.getName());
            // La procedencia y el estado viajan SIEMPRE, también cuando la instalación sólo
            // publica verificadas: un consumidor que guarda el GeoJSON —QGIS, un respaldo— se
            // queda con el dato que dice qué es ese polígono, en vez de con un perímetro mudo.
            attributes.put("source", row.getSource());
            attributes.put("status", row.getStatus());
            attributes.put("verifiedAt", row.getVerifiedAt());
            // `verifiedBy` NO sale: el nombre de un funcionario municipal no le aporta nada a un
            // ciudadano y es dato personal. Vive en el portal de administración y en la bitácora.
            features.add(new GeoJson.Feature(row.getId(), parse(row.getGeometry()), attributes));
        }
        return new GeoJson.FeatureCollection(features);
    }

    /**
     * Asienta la decisión de una persona sobre el perímetro de una zona (CONTRACT.md v0.44).
     *
     * <h2>Lo que esto NO hace</h2>
     *
     * <p>No mira el polígono. Ni sus vértices, ni su área, ni si parece un rectángulo. Que una
     * geometría sea el límite oficial de una zona de cobro es un hecho administrativo, y ningún
     * cálculo sobre coordenadas puede establecerlo; por eso el estado lo pone alguien que responde
     * por él y queda asentado en la bitácora sellada.</p>
     *
     * <h2>La demostración no asciende</h2>
     *
     * <p>Un perímetro cuya procedencia es {@link ZoneGeometrySource#DEMO} no se puede aprobar. Para
     * volverlo oficial hay que dibujarlo de nuevo o importarlo, lo que cambia la procedencia antes
     * de que nadie lo apruebe. Acá se rechaza con un motivo que se entiende.</p>
     *
     * <p>Debajo hay dos defensas más, y son distintas a propósito: el CHECK
     * {@code ck_parking_zones_geom_demo_never_verified} prohíbe el ESTADO «DEMO y aprobada», y el
     * disparador {@code trg_parking_zones_demo_never_verified} prohíbe la TRANSICIÓN —aprobar una
     * DEMO sin que el polígono haya cambiado en esa misma sentencia—, que es lo que un CHECK no
     * puede ver y que, medido contra PostGIS, se le colaba.</p>
     *
     * @param decision {@code VERIFIED} o {@code REJECTED}. Una revisión termina en una de las dos
     * @param source   la procedencia que declara quien revisa, o null para dejar la que había
     * @param actor    quién decide. Se guarda en la zona sólo cuando aprueba
     * @return el estado y la procedencia de antes y de después, para la bitácora
     */
    public ReviewOutcome review(TenantId tenantId,
                                UUID zoneId,
                                long expectedVersion,
                                ZoneGeometryStatus decision,
                                ZoneGeometrySource source,
                                UUID actor) {
        ZoneGeometryReviewRow antes = zoneRepository.findGeometryReview(tenantId.value(), zoneId)
                // La existencia de la zona ya la comprobó quien llama; llegar acá sin fila
                // significaría que desapareció entre una lectura y la otra.
                .orElseThrow(() -> ConflictException.of(
                        ErrorCode.OPTIMISTIC_LOCK_CONFLICT, "error.conflict.optimisticLock"));

        if (!Boolean.TRUE.equals(antes.getDrawn())) {
            throw UnprocessableEntityException.of(
                    ErrorCode.ZONE_GEOMETRY_MISSING, "error.geo.geometry.notDrawn");
        }
        // Lo que decide es la procedencia que la fila TIENE, no la que la petición declara. Si
        // bastara con declarar otra, «no asciende cambiándole el estado» se esquivaría mandando
        // `source: MUNICIPAL_OFFICIAL` en la misma llamada, que es cambiarle el estado con un
        // adjetivo al lado. Cambiar la procedencia de verdad exige volver a dibujar o importar, y
        // eso es otro extremo —el que escribe el polígono— que además deja el sello en cero.
        boolean esDemo = ZoneGeometrySource.DEMO.name().equals(antes.getSource());
        boolean declaraDemo = source == ZoneGeometrySource.DEMO;
        if (decision == ZoneGeometryStatus.VERIFIED && (esDemo || declaraDemo)) {
            throw UnprocessableEntityException.of(
                    ErrorCode.ZONE_GEOMETRY_DEMO_NOT_VERIFIABLE, "error.geo.geometry.demoNotVerifiable");
        }

        requireUpdated(zoneRepository.reviewGeometry(
                tenantId.value(), zoneId, decision.name(),
                source == null ? null : source.name(),
                actor, clock.instant(), expectedVersion));

        return new ReviewOutcome(antes.getStatus(), antes.getSource(), decision.name(),
                source == null ? antes.getSource() : source.name());
    }

    /**
     * Lo que cambió al revisar, para que la bitácora pueda decir de dónde a dónde.
     *
     * <p>Un evento que dijera sólo «verificada» obliga a reconstruir el antes recorriendo la
     * historia. Dos pares de valores cuestan nada y contestan la pregunta de una vez.</p>
     */
    public record ReviewOutcome(String previousStatus, String previousSource,
                                String status, String source) {
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
