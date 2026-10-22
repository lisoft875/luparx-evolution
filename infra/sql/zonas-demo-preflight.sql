-- =================================================================================================
-- PREFLIGHT · ¿por qué el mapa del ciudadano no dibuja zonas en staging?
--
-- SÓLO LEE. No escribe, no bloquea, no crea nada. Se puede correr en cualquier momento y en
-- cualquier ambiente, incluida producción, sin consecuencias.
--
-- Contesta, en este orden, las cinco preguntas que deciden si hay algo que dibujar:
--
--   1. ¿Se aplicaron las migraciones que siembran y etiquetan la geometría de demostración?
--   2. ¿Cuántas zonas tiene cada municipalidad, y cuántas de ellas tienen polígono?
--   3. ¿Están las ocho zonas de San José que la V41_0 nombra, y con qué código?
--   4. ¿Esa geometría es válida y está en el sistema de coordenadas que el mapa espera?
--   5. ¿Qué publicaría hoy el endpoint del ciudadano, y qué publicaría abriendo UNVERIFIED?
--
--   docker compose -f infra/docker-compose.deploy.yml --env-file infra/.env exec -T postgres \
--     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f - < infra/sql/zonas-demo-preflight.sql
--
-- O, más cómodo: ./scripts/staging-zonas-demo.sh preflight
-- =================================================================================================

\echo ''
\echo '=== 1 · MIGRACIONES ============================================================='
\echo 'V41_0 siembra los polígonos; V43_0 les pone procedencia y estado. Sin las dos, no hay nada.'

SELECT version,
       description,
       success,
       installed_on
  FROM flyway_schema_history
 WHERE version IN ('38.0', '41.0', '43.0')
 ORDER BY installed_rank;

\echo ''
\echo '=== 2 · ZONAS Y GEOMETRÍA, POR MUNICIPALIDAD ===================================='
\echo 'La columna que importa es con_geom: si es 0 para San José, el mapa no tiene qué dibujar.'

SELECT t.slug                                                        AS municipalidad,
       count(*)                                                      AS zonas,
       count(*) FILTER (WHERE z.geom IS NOT NULL)                    AS con_geom,
       count(*) FILTER (WHERE z.geom IS NULL)                        AS sin_geom,
       count(*) FILTER (WHERE z.geom_status = 'VERIFIED')            AS verificadas,
       count(*) FILTER (WHERE z.geom IS NOT NULL
                          AND z.geom_status = 'UNVERIFIED')          AS sin_verificar,
       count(*) FILTER (WHERE z.geom_source = 'DEMO')                AS de_demostracion
  FROM parking_zones z
  JOIN tenants t ON t.id = z.tenant_id
 GROUP BY t.slug
 ORDER BY t.slug;

\echo ''
\echo '=== 3 · LAS OCHO ZONAS QUE NOMBRA LA V41_0 ======================================'
\echo 'La migración empareja por CÓDIGO (SJ-AMON, SJ-COLON…). Si staging usa otros códigos,'
\echo 'la migración corrió y no actualizó ninguna fila: ésa sería la causa.'

SELECT codigo_esperado,
       coalesce(t.slug, '— no existe —')                   AS municipalidad,
       z.name                                              AS nombre,
       (z.geom IS NOT NULL)                                AS tiene_geom,
       z.geom_source                                       AS procedencia,
       z.geom_status                                       AS estado
  FROM (VALUES ('SJ-AMON'), ('SJ-ESCALANTE'), ('SJ-MERCADO'), ('SJ-COLON'),
               ('SJ-HOSPITAL'), ('SJ-CATEDRAL'), ('SJ-ZAPOTE'), ('SJ-SABANA'))
       AS esperadas(codigo_esperado)
  LEFT JOIN parking_zones z ON z.code = esperadas.codigo_esperado
  LEFT JOIN tenants t       ON t.id = z.tenant_id
 ORDER BY codigo_esperado;

\echo ''
\echo '--- Y los códigos que San José tiene de verdad, por si no son ésos ---------------'

SELECT z.code      AS codigo,
       z.name      AS nombre,
       z.active    AS activa,
       (z.geom IS NOT NULL) AS tiene_geom,
       z.geom_status        AS estado
  FROM parking_zones z
  JOIN tenants t ON t.id = z.tenant_id
 WHERE t.slug = 'san-jose'
 ORDER BY z.code;

\echo ''
\echo '=== 4 · ¿LA GEOMETRÍA SIRVE? ===================================================='
\echo 'SRID 4326 y polígono válido. Un SRID distinto sale en otro continente; uno inválido no pinta.'

SELECT t.slug                      AS municipalidad,
       z.code                      AS zona,
       ST_SRID(z.geom)             AS srid,
       ST_GeometryType(z.geom)     AS tipo,
       ST_IsValid(z.geom)          AS valida,
       round(ST_XMin(z.geom::geometry)::numeric, 4) AS oeste,
       round(ST_YMin(z.geom::geometry)::numeric, 4) AS sur,
       round(ST_XMax(z.geom::geometry)::numeric, 4) AS este,
       round(ST_YMax(z.geom::geometry)::numeric, 4) AS norte
  FROM parking_zones z
  JOIN tenants t ON t.id = z.tenant_id
 WHERE z.geom IS NOT NULL
 ORDER BY t.slug, z.code;

\echo ''
\echo '=== 5 · QUÉ PUBLICARÍA EL ENDPOINT DEL CIUDADANO ================================'
\echo 'Primera fila: lo que sale hoy (sólo VERIFIED). Segunda: lo que saldría abriendo UNVERIFIED.'

SELECT t.slug                                                         AS municipalidad,
       count(*) FILTER (WHERE z.geom_status IN ('VERIFIED'))          AS hoy_verified,
       count(*) FILTER (WHERE z.geom_status IN ('VERIFIED',
                                                'UNVERIFIED'))        AS con_unverified
  FROM parking_zones z
  JOIN tenants t ON t.id = z.tenant_id
 WHERE z.geom IS NOT NULL
 GROUP BY t.slug
 ORDER BY t.slug;

\echo ''
\echo '=== 6 · AISLAMIENTO ============================================================='
\echo 'Ninguna municipalidad que no sea san-jose debería tener un código SJ-*.'
\echo 'La V41_0 empareja por código SIN filtrar por municipalidad, y los códigos son únicos'
\echo 'por municipalidad, no globalmente: por eso se comprueba.'

SELECT t.slug AS municipalidad, z.code AS codigo, (z.geom IS NOT NULL) AS tiene_geom
  FROM parking_zones z
  JOIN tenants t ON t.id = z.tenant_id
 WHERE z.code LIKE 'SJ-%'
   AND t.slug <> 'san-jose';

\echo ''
\echo '(sin filas arriba = sin fuga entre municipalidades)'
\echo ''
