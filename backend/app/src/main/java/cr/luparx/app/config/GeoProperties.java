package cr.luparx.app.config;

import cr.luparx.parking.model.ZoneGeometryStatus;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Limits on the geometry this deployment accepts and serves ({@code luparx.geo.*}, ADR 0024).
 *
 * <p>Configuration and not constants because the right numbers depend on what a municipality
 * actually draws: a zone traced block by block from a cadastral export has a different vertex count
 * than one sketched by hand, and a deployment serving a capital city has more zones on screen than
 * one serving a town. Both are guardrails against a single request producing a response nobody can
 * use, not business rules.</p>
 *
 * @param maxZoneVertices ceiling on the vertices of one zone's geometry. A polygon with tens of
 *                        thousands of points is almost always an accidental import of a whole
 *                        cadastre, and it would travel in every response that carries that zone
 * @param maxZonesPerMap  ceiling on how many zones one map request returns
 * @param citizenGeometryStatuses qué estados de verificación llegan al mapa del CIUDADANO. Esto no
 *                        es una baranda: es la regla que impide publicar como límite de cobro un
 *                        polígono que nadie revisó. Por omisión, sólo {@code VERIFIED}
 * @see cr.luparx.parking.model.ZoneGeometryStatus
 */
@ConfigurationProperties(prefix = "luparx.geo")
public record GeoProperties(Integer maxZoneVertices,
                            Integer maxZonesPerMap,
                            List<String> citizenGeometryStatuses) {

    /**
     * Lo que el ciudadano recibe cuando la propiedad no dice nada: nada más lo verificado.
     *
     * <p>Falla CERRADO a propósito. Una instalación mal configurada —o una propiedad con una errata—
     * tiene que mostrar de MENOS, nunca de más: un polígono sin revisar publicado como si fuera el
     * límite de cobro es exactamente el daño que este campo evita.</p>
     */
    private static final Set<String> POR_OMISION = Set.of(ZoneGeometryStatus.VERIFIED.name());

    public int effectiveMaxZoneVertices() {
        return maxZoneVertices == null || maxZoneVertices <= 0 ? 10_000 : maxZoneVertices;
    }

    public int effectiveMaxZonesPerMap() {
        return maxZonesPerMap == null || maxZonesPerMap <= 0 ? 500 : maxZonesPerMap;
    }

    /**
     * Los estados que el mapa del ciudadano puede devolver, ya saneados.
     *
     * <p>Se descarta en silencio cualquier valor que no sea un {@link ZoneGeometryStatus}: la
     * alternativa —pasarlo tal cual al {@code IN} de la consulta— convertiría una errata de
     * configuración en una lista que no empareja con nada, o peor, en un estado inventado que
     * algún día signifique algo. Si no queda ninguno válido, se cae a {@code VERIFIED}, que es el
     * valor seguro.</p>
     */
    public Set<String> effectiveCitizenGeometryStatuses() {
        if (citizenGeometryStatuses == null || citizenGeometryStatuses.isEmpty()) {
            return POR_OMISION;
        }
        Set<String> validos = citizenGeometryStatuses.stream()
                .filter(Objects::nonNull)
                .map(valor -> valor.trim().toUpperCase(Locale.ROOT))
                .filter(GeoProperties::esEstadoConocido)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        return validos.isEmpty() ? POR_OMISION : Set.copyOf(validos);
    }

    private static boolean esEstadoConocido(String valor) {
        for (ZoneGeometryStatus estado : ZoneGeometryStatus.values()) {
            if (estado.name().equals(valor)) {
                return true;
            }
        }
        return false;
    }
}
