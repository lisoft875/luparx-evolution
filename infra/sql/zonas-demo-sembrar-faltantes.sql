-- =================================================================================================
-- SEMBRAR LA GEOMETRÍA DEMO QUE FALTE — sólo si el preflight dice que falta
--
-- CUÁNDO SE USA, Y CUÁNDO NO
--
-- La migración V41_0 ya siembra estos mismos ocho polígonos, emparejando por CÓDIGO de zona
-- (`SJ-AMON`, `SJ-COLON`…). Si en esta base las zonas de San José tienen esos códigos, la
-- migración ya hizo el trabajo y este archivo NO HACE NADA: todas sus actualizaciones están
-- condicionadas a `geom IS NULL`.
--
-- Hace falta sólo en el caso que el preflight destapa: que San José exista con otros códigos —
-- porque sus zonas se crearon a mano desde el portal, por ejemplo— y la migración, al no encontrar
-- esos códigos, no haya actualizado ninguna fila. Entonces el emparejamiento se hace por NOMBRE.
--
-- QUÉ SON ESTOS POLÍGONOS
--
-- Los mismos ocho de la V41_0, sin cambiar una coordenada: rectángulos aproximados sobre barrios
-- reales de San José. NO son límites catastrales ni oficiales. No sirven para cobrar, fiscalizar
-- ni resolver un reclamo. Nacen y se quedan como `geom_source = 'DEMO'` y
-- `geom_status = 'UNVERIFIED'`, que es lo que hace que el portal los pinte en violeta, con borde
-- punteado y la palabra DEMO encima.
--
-- LO QUE ESTE ARCHIVO NO HACE, A PROPÓSITO
--
--   · No convierte nada a VERIFIED. Verificar es un acto de la municipalidad, no de un script.
--   · No toca ninguna zona que YA tenga geometría: `geom IS NULL` en todas las condiciones. Si
--     alguien dibujó sus límites de verdad, acá no se entera de que esto existe.
--   · No borra ni vacía nada. Sin DELETE, sin TRUNCATE, sin DROP.
--   · No sale de San José: todo va filtrado por `tenant_id` de la municipalidad `san-jose`.
--   · No crea zonas. Si una zona no existe, no se inventa: se queda sin geometría y el portal
--     muestra su aviso.
--
-- IDEMPOTENTE: correrlo dos veces deja la base igual que correrlo una.
--
--   ./scripts/staging-zonas-demo.sh sembrar
-- =================================================================================================

BEGIN;

-- Un seguro antes de tocar nada: si la municipalidad no existe, no hay nada que hacer acá y es
-- mejor fallar ruidosamente que escribir en la municipalidad equivocada.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'san-jose') THEN
        RAISE EXCEPTION 'No existe la municipalidad con slug san-jose en esta base. Abortado.';
    END IF;
END
$$;

-- --- Paso 1 · por CÓDIGO, que es lo que hace la V41_0 -------------------------------------------
-- Normalmente esto actualiza cero filas: la migración ya pasó. Se repite porque una base restaurada
-- de un respaldo viejo, o una zona creada después de la migración, sí queda sin geometría.

UPDATE parking_zones z
   SET geom        = ST_Multi(ST_GeomFromText(g.wkt, 4326)),
       geom_source = 'DEMO',
       geom_status = 'UNVERIFIED',
       updated_at  = now(),
       version     = z.version + 1
  FROM (VALUES
    ('SJ-AMON',      'POLYGON((-84.0790 9.9385, -84.0730 9.9385, -84.0730 9.9345, -84.0790 9.9345, -84.0790 9.9385))'),
    ('SJ-ESCALANTE', 'POLYGON((-84.0640 9.9345, -84.0570 9.9345, -84.0570 9.9300, -84.0640 9.9300, -84.0640 9.9345))'),
    ('SJ-MERCADO',   'POLYGON((-84.0830 9.9335, -84.0780 9.9335, -84.0780 9.9300, -84.0830 9.9300, -84.0830 9.9335))'),
    ('SJ-COLON',     'POLYGON((-84.0960 9.9330, -84.0850 9.9330, -84.0850 9.9295, -84.0960 9.9295, -84.0960 9.9330))'),
    ('SJ-HOSPITAL',  'POLYGON((-84.0900 9.9295, -84.0840 9.9295, -84.0840 9.9255, -84.0900 9.9255, -84.0900 9.9295))'),
    ('SJ-CATEDRAL',  'POLYGON((-84.0790 9.9315, -84.0720 9.9315, -84.0720 9.9270, -84.0790 9.9270, -84.0790 9.9315))'),
    ('SJ-ZAPOTE',    'POLYGON((-84.0600 9.9260, -84.0520 9.9260, -84.0520 9.9210, -84.0600 9.9210, -84.0600 9.9260))'),
    ('SJ-SABANA',    'POLYGON((-84.1030 9.9360, -84.0960 9.9360, -84.0960 9.9300, -84.1030 9.9300, -84.1030 9.9360))')
  ) AS g(code, wkt)
 WHERE z.code = g.code
   AND z.geom IS NULL
   AND z.tenant_id = (SELECT t.id FROM tenants t WHERE t.slug = 'san-jose');

-- --- Paso 2 · por NOMBRE, para las zonas que no usan esos códigos -------------------------------
-- El emparejamiento es por nombre normalizado —sin tildes, sin mayúsculas, sin espacios de sobra—
-- porque «Barrio Amón», «barrio amon» y «Barrio  Amón» son la misma zona escrita por tres personas
-- distintas. `unaccent` no se asume instalado: se traducen las cinco vocales a mano, que es todo lo
-- que hace falta en español.

UPDATE parking_zones z
   SET geom        = ST_Multi(ST_GeomFromText(g.wkt, 4326)),
       geom_source = 'DEMO',
       geom_status = 'UNVERIFIED',
       updated_at  = now(),
       version     = z.version + 1
  FROM (VALUES
    ('barrio amon',    'POLYGON((-84.0790 9.9385, -84.0730 9.9385, -84.0730 9.9345, -84.0790 9.9345, -84.0790 9.9385))'),
    ('barrio escalante','POLYGON((-84.0640 9.9345, -84.0570 9.9345, -84.0570 9.9300, -84.0640 9.9300, -84.0640 9.9345))'),
    ('mercado central','POLYGON((-84.0830 9.9335, -84.0780 9.9335, -84.0780 9.9300, -84.0830 9.9300, -84.0830 9.9335))'),
    ('paseo colon',    'POLYGON((-84.0960 9.9330, -84.0850 9.9330, -84.0850 9.9295, -84.0960 9.9295, -84.0960 9.9330))'),
    ('hospital san juan de dios', 'POLYGON((-84.0900 9.9295, -84.0840 9.9295, -84.0840 9.9255, -84.0900 9.9255, -84.0900 9.9295))'),
    ('catedral',       'POLYGON((-84.0790 9.9315, -84.0720 9.9315, -84.0720 9.9270, -84.0790 9.9270, -84.0790 9.9315))'),
    ('zapote',         'POLYGON((-84.0600 9.9260, -84.0520 9.9260, -84.0520 9.9210, -84.0600 9.9210, -84.0600 9.9260))'),
    ('la sabana',      'POLYGON((-84.1030 9.9360, -84.0960 9.9360, -84.0960 9.9300, -84.1030 9.9300, -84.1030 9.9360))')
  ) AS g(nombre, wkt)
 WHERE z.geom IS NULL
   AND z.tenant_id = (SELECT t.id FROM tenants t WHERE t.slug = 'san-jose')
   AND translate(lower(btrim(regexp_replace(z.name, '\s+', ' ', 'g'))),
                 'áéíóúü', 'aeiouu') LIKE '%' || g.nombre || '%';

-- --- Paso 3 · lo que quedó ----------------------------------------------------------------------

\echo ''
\echo 'Zonas de San José después de sembrar:'

SELECT z.code                AS codigo,
       z.name                AS nombre,
       (z.geom IS NOT NULL)  AS tiene_geom,
       z.geom_source         AS procedencia,
       z.geom_status         AS estado
  FROM parking_zones z
  JOIN tenants t ON t.id = z.tenant_id
 WHERE t.slug = 'san-jose'
 ORDER BY z.code;

-- Un último seguro antes de confirmar: nada quedó VERIFIED por culpa de esto, y nada se escribió
-- fuera de San José. Si alguna de las dos cosas fallara, la transacción entera se deshace.
DO $$
DECLARE
    verificadas_demo int;
    fuera           int;
BEGIN
    SELECT count(*) INTO verificadas_demo
      FROM parking_zones
     WHERE geom_source = 'DEMO' AND geom_status = 'VERIFIED';
    IF verificadas_demo > 0 THEN
        RAISE EXCEPTION 'Hay % geometrías DEMO marcadas VERIFIED. No se confirma nada.', verificadas_demo;
    END IF;

    SELECT count(*) INTO fuera
      FROM parking_zones z
      JOIN tenants t ON t.id = z.tenant_id
     WHERE z.geom_source = 'DEMO'
       AND t.slug <> 'san-jose';
    IF fuera > 0 THEN
        RAISE EXCEPTION 'Hay % zonas DEMO fuera de san-jose. No se confirma nada.', fuera;
    END IF;
END
$$;

COMMIT;
