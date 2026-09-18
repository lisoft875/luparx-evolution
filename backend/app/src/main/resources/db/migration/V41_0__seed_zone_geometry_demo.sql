-- =================================================================================================
-- Geometría de demostración para las zonas sembradas (rediseño 360°, mapa en Citizen).
--
-- POR QUÉ EXISTE
-- La V38_0 agregó `parking_zones.geom` y la API ya la sirve como GeoJSON
-- (`GET /citizen/parking/zones/geojson`), pero NINGUNA zona tiene geometría: ese endpoint contesta
-- 200 con cero features, verificado contra staging el 2026-09-18. El mapa del rediseño no tiene
-- nada que dibujar hasta que existan polígonos.
--
-- QUÉ SON ESTOS POLÍGONOS
-- **Rectángulos aproximados sobre barrios reales de San José**, dibujados a mano para que el mapa
-- tenga algo plausible que mostrar en el ambiente de pruebas. Las coordenadas caen donde de verdad
-- están Barrio Amón, Paseo Colón o el Mercado Central, pero los límites NO son catastrales ni
-- oficiales: no sirven para cobrar, fiscalizar ni resolver un reclamo.
--
-- Una municipalidad real dibuja sus zonas desde el portal de administración
-- (`PUT /admin/parking/zones/{id}/geometry`), que es el camino que existe desde la v0.40. Esto es
-- una semilla de demo, no un sustituto de ese trabajo.
--
-- POR QUÉ SÓLO SAN JOSÉ
-- Es la municipalidad de lanzamiento y la que usan las cuentas de prueba y el tutorial del cliente.
-- Las otras cuatro quedan sin geometría a propósito: así el mapa se prueba TAMBIÉN en su estado
-- vacío, que es el que va a ver cualquier municipalidad nueva el primer día.
--
-- IDEMPOTENTE Y NO DESTRUCTIVA
-- El `WHERE geom IS NULL` es lo que hace que esto sea seguro: si alguien ya dibujó una zona —en
-- staging, o una municipalidad de verdad— esta migración no la toca. Sin esa cláusula, un despliegue
-- sobrescribiría el trabajo real con rectángulos de demostración.
-- =================================================================================================

UPDATE parking_zones z
   SET geom = ST_Multi(ST_GeomFromText(g.wkt, 4326))
  FROM (VALUES
    -- Barrio Amón: al norte del centro, entre el Parque Morazán y el río Torres.
    ('SJ-AMON',      'POLYGON((-84.0790 9.9385, -84.0730 9.9385, -84.0730 9.9345, -84.0790 9.9345, -84.0790 9.9385))'),
    -- Barrio Escalante: Calle 33 y alrededores, al este.
    ('SJ-ESCALANTE', 'POLYGON((-84.0640 9.9345, -84.0570 9.9345, -84.0570 9.9300, -84.0640 9.9300, -84.0640 9.9345))'),
    -- Mercado Central: corazón del casco, sobre la Avenida Central.
    ('SJ-MERCADO',   'POLYGON((-84.0830 9.9335, -84.0780 9.9335, -84.0780 9.9300, -84.0830 9.9300, -84.0830 9.9335))'),
    -- Paseo Colón: corredor hacia La Sabana.
    ('SJ-COLON',     'POLYGON((-84.0960 9.9330, -84.0850 9.9330, -84.0850 9.9295, -84.0960 9.9295, -84.0960 9.9330))'),
    -- Hospital San Juan de Dios: suroeste del casco.
    ('SJ-HOSPITAL',  'POLYGON((-84.0900 9.9295, -84.0840 9.9295, -84.0840 9.9255, -84.0900 9.9255, -84.0900 9.9295))'),
    -- Catedral – La Soledad: sureste del casco.
    ('SJ-CATEDRAL',  'POLYGON((-84.0790 9.9315, -84.0720 9.9315, -84.0720 9.9270, -84.0790 9.9270, -84.0790 9.9315))'),
    -- Zapote Centro: al sureste, alrededor de la rotonda.
    ('SJ-ZAPOTE',    'POLYGON((-84.0600 9.9260, -84.0520 9.9260, -84.0520 9.9210, -84.0600 9.9210, -84.0600 9.9260))'),
    -- La Sabana: borde este del parque.
    ('SJ-SABANA',    'POLYGON((-84.1030 9.9360, -84.0960 9.9360, -84.0960 9.9300, -84.1030 9.9300, -84.1030 9.9360))')
  ) AS g(code, wkt)
 WHERE z.code = g.code
   AND z.geom IS NULL;

COMMENT ON COLUMN parking_zones.geom IS
    'Geometría de la zona (MultiPolygon, SRID 4326), nullable: una zona sin geometría cobra igual. '
    'Se lee y se escribe como GeoJSON (RFC 7946) por la API. Las zonas de San José traen polígonos '
    'APROXIMADOS de demostración (V41_0) que no son límites catastrales; los reales los dibuja cada '
    'municipalidad desde su portal.';
