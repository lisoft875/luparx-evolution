-- =================================================================================================
-- POSTCHECK · después de activar la vista de demostración en staging
--
-- SÓLO LEE. Comprueba las cuatro cosas que no pueden haber salido mal, y las imprime con un
-- veredicto para no tener que interpretar números a ojo.
--
--   1. San José tiene geometría que publicar.
--   2. Ninguna geometría DEMO quedó marcada como VERIFIED.
--   3. Ninguna otra municipalidad recibió zonas o geometrías de San José.
--   4. Toda la geometría es válida y está en SRID 4326.
--
--   ./scripts/staging-zonas-demo.sh postcheck
-- =================================================================================================

\echo ''
\echo '=== 1 · ¿HAY QUÉ PUBLICAR EN SAN JOSÉ? =========================================='

SELECT count(*) FILTER (WHERE z.geom IS NOT NULL)                       AS con_geom,
       count(*) FILTER (WHERE z.geom_status = 'UNVERIFIED'
                          AND z.geom IS NOT NULL)                       AS demo_publicables,
       CASE WHEN count(*) FILTER (WHERE z.geom IS NOT NULL) > 0
            THEN 'OK · hay geometría que dibujar'
            ELSE 'FALLA · San José sigue sin un solo polígono' END      AS veredicto
  FROM parking_zones z
  JOIN tenants t ON t.id = z.tenant_id
 WHERE t.slug = 'san-jose';

\echo ''
\echo '=== 2 · NINGUNA DEMO SE CONVIRTIÓ EN OFICIAL ===================================='

SELECT count(*)                                                         AS demo_verificadas,
       CASE WHEN count(*) = 0
            THEN 'OK · ninguna geometría de demostración pasa por oficial'
            ELSE 'FALLA · hay DEMO marcadas VERIFIED' END               AS veredicto
  FROM parking_zones
 WHERE geom_source = 'DEMO'
   AND geom_status = 'VERIFIED';

\echo ''
\echo '=== 3 · AISLAMIENTO ENTRE MUNICIPALIDADES ======================================='

SELECT count(*)                                                         AS zonas_demo_fuera_de_sj,
       CASE WHEN count(*) = 0
            THEN 'OK · la demostración no salió de San José'
            ELSE 'FALLA · hay geometría DEMO en otra municipalidad' END  AS veredicto
  FROM parking_zones z
  JOIN tenants t ON t.id = z.tenant_id
 WHERE z.geom_source = 'DEMO'
   AND t.slug <> 'san-jose';

\echo ''
\echo '--- Reparto por municipalidad, para verlo entero --------------------------------'

SELECT t.slug                                            AS municipalidad,
       count(*)                                          AS zonas,
       count(*) FILTER (WHERE z.geom IS NOT NULL)        AS con_geom,
       count(*) FILTER (WHERE z.geom_source = 'DEMO')    AS demo,
       count(*) FILTER (WHERE z.geom_status = 'VERIFIED') AS verificadas
  FROM parking_zones z
  JOIN tenants t ON t.id = z.tenant_id
 GROUP BY t.slug
 ORDER BY t.slug;

\echo ''
\echo '=== 4 · GEOMETRÍA VÁLIDA Y EN 4326 =============================================='

SELECT count(*)                                                          AS poligonos,
       count(*) FILTER (WHERE ST_SRID(geom) <> 4326)                     AS srid_incorrecto,
       count(*) FILTER (WHERE NOT ST_IsValid(geom))                      AS invalidos,
       CASE WHEN count(*) FILTER (WHERE ST_SRID(geom) <> 4326
                                     OR NOT ST_IsValid(geom)) = 0
            THEN 'OK · toda la geometría es válida y está en 4326'
            ELSE 'FALLA · revisar SRID o validez' END                    AS veredicto
  FROM parking_zones
 WHERE geom IS NOT NULL;

\echo ''
