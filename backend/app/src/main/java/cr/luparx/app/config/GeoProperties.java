package cr.luparx.app.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

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
 */
@ConfigurationProperties(prefix = "luparx.geo")
public record GeoProperties(Integer maxZoneVertices, Integer maxZonesPerMap) {

    public int effectiveMaxZoneVertices() {
        return maxZoneVertices == null || maxZoneVertices <= 0 ? 10_000 : maxZoneVertices;
    }

    public int effectiveMaxZonesPerMap() {
        return maxZonesPerMap == null || maxZonesPerMap <= 0 ? 500 : maxZonesPerMap;
    }
}
