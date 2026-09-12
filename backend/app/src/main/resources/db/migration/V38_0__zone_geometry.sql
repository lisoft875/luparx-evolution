-- =============================================================================================
-- Nota sobre la numeración: esta migración se escribió primero como V36_0 y se movió a V38_0 por dos
-- razones que apuntaban al mismo lado. La V36_0 está APARTADA para la migración de contracción de la
-- federación (ADR 0022), y una migración con número menor al último ya aplicado hace fallar el
-- arranque de Flyway, porque `out-of-order` no está activado y no debería estarlo.
--
-- V38_0 — La zona deja de ser un código y pasa a ser un lugar (CONTRACT.md v0.40, ADR 0024).
--
-- Hasta ahora una zona de cobro era un código, un nombre y —opcionalmente— el id de un distrito.
-- Eso alcanza para cobrar, pero no para responder ninguna de las preguntas que una municipalidad
-- hace en cuanto mira un mapa: qué calles cubre esta zona, si esta bahía quedó dentro o fuera, o
-- cuántas boletas se levantaron en esta cuadra. Y no alcanza para entregarle nada a su GIS.
--
-- Esta migración agrega la geometría de la zona. Cuatro decisiones que conviene no volver a
-- discutir:
--
--   1. **PostGIS, no dos columnas numéricas.** Un par lat/lon describe un punto; una zona es un
--      área, y las preguntas útiles son de contención e intersección. Sin tipo geométrico e índice
--      espacial, «¿qué zona contiene este punto?» se convierte en traer todas las zonas del
--      inquilino y calcular en Java — es decir, el modelo que habría que rehacer después.
--
--   2. **`MultiPolygon` y no `Polygon`.** Una zona de cobro discontinua —dos cuadras que no se
--      tocan— es lo normal, no la excepción. Elegir `Polygon` obliga a una migración el día que
--      aparezca la segunda pieza. La API acepta `Polygon` y el servidor lo promueve con `ST_Multi`,
--      así que quien dibuja una sola pieza no paga esta decisión.
--
--   3. **SRID 4326 (WGS84), grados lon/lat.** Es lo que emite un GPS, lo que exige RFC 7946 para
--      GeoJSON y lo que ArcGIS y QGIS leen sin traducción. Para medir metros —áreas, distancias— se
--      castea a `geography` en la consulta que lo necesite; guardar en 4326 mantiene gratis la
--      interoperabilidad, que es el objetivo del punto 13 del plan.
--
--   4. **Nullable.** Ya existen zonas en producción y en desarrollo sin geometría, y una zona sin
--      dibujar sigue cobrando perfectamente. `NOT NULL` obligaría a inventar un polígono para cada
--      fila existente, que es exactamente el tipo de dato falso que después nadie distingue de uno
--      real.
--
-- La columna se llama `geom` por convención de GIS —es el nombre que toda herramienta espera— y en
-- la API el campo se llama `geometry`, por RFC 7946. El mapeo entre los dos nombres está en un solo
-- lugar y es deliberado.
-- =============================================================================================

-- Requiere privilegio de superusuario (o `rds_superuser` y equivalentes). En un Postgres
-- administrado donde el usuario de la aplicación no lo tenga, un operador la crea una vez a mano y
-- esta sentencia queda en no-op: para eso está el IF NOT EXISTS. Ver docs/RUNBOOK.md.
CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE parking_zones
    ADD COLUMN geom geometry(MultiPolygon, 4326);

COMMENT ON COLUMN parking_zones.geom IS
    'Perímetro de la zona de cobro en WGS84 (SRID 4326), siempre MultiPolygon para que una zona '
    'discontinua no exija cambiar el tipo. NULL mientras nadie la haya dibujado: una zona sin '
    'geometría cobra igual. Se lee y se escribe como GeoJSON (RFC 7946) por la API.';

-- La validez la exige la base y no sólo la aplicación (docs/ARCHITECTURE.md §7). Un polígono
-- autointersectado se acepta sin chistar en un INSERT ingenuo y después hace que ST_Contains
-- devuelva respuestas sin sentido: el momento de rechazarlo es al escribirlo, no al consultarlo.
-- `ST_IsValid` y `ST_IsEmpty` son IMMUTABLE, que es lo que un CHECK requiere.
ALTER TABLE parking_zones
    ADD CONSTRAINT ck_parking_zones_geom_valid
        CHECK (geom IS NULL OR (ST_IsValid(geom) AND NOT ST_IsEmpty(geom)));

-- El SRID y el tipo ya los fija el typmod de la columna, pero el SRID 4326 NO acota los valores:
-- una longitud de 500 grados es una geometría válida para PostGIS y un error de captura para
-- cualquiera. Se comprueba sobre la caja envolvente, que PostGIS ya tiene calculada, así que cuesta
-- O(1) por fila y no recorre vértices. Es la misma costumbre que ya tienen `citations` y
-- `enforcement_checks` con sus CHECK de rango sobre latitude/longitude (V17_0, V28_0).
ALTER TABLE parking_zones
    ADD CONSTRAINT ck_parking_zones_geom_bounds
        CHECK (geom IS NULL
               OR (ST_XMin(geom) >= -180 AND ST_XMax(geom) <= 180
                   AND ST_YMin(geom) >= -90 AND ST_YMax(geom) <= 90));

-- Índice espacial parcial. Parcial porque hoy TODAS las filas tienen geom NULL y porque una zona
-- sin dibujar nunca es respuesta de una consulta geométrica: indexarla sería pagar por filas que
-- jamás participan.
--
-- GiST sobre `geom` a secas y no sobre `(tenant_id, geom)`: un índice compuesto de ese tipo exige
-- la extensión btree_gist, y con decenas de zonas por municipalidad el planificador combina este
-- índice con `ix_parking_zones_tenant` sin ayuda. Si algún día una municipalidad tiene miles de
-- zonas, ese es el momento de medirlo y no antes.
CREATE INDEX ix_parking_zones_geom
    ON parking_zones USING GIST (geom)
    WHERE geom IS NOT NULL;
