-- =================================================================================================
-- V43_0 — De dónde viene un polígono, y quién lo dio por bueno (CONTRACT.md v0.44, ADR 0029).
--
-- EL PROBLEMA
-- Desde la V38_0 una zona puede tener geometría, y desde la V41_0 ocho zonas de San José tienen
-- rectángulos **de demostración**. El GeoJSON que sirve la API lleva en `properties` exactamente
-- `code` y `name`: ningún cliente —ni el ciudadano, ni QGIS, ni la propia municipalidad— puede
-- distinguir un perímetro oficial de uno dibujado a ojo para que el mapa no saliera vacío.
--
-- Mientras esa distinción no exista en la BASE, cualquier intento de hacerla en el cliente es
-- adivinanza. Se intentó una heurística de «esto parece un rectángulo, será demo»; se retira con
-- esta migración, porque mirar la FORMA de un polígono para decidir si es oficial es exactamente
-- el error que esto viene a corregir.
--
-- LO QUE AGREGA, TODO ADITIVO
--   · `geom_source`       de dónde salió el polígono
--   · `geom_status`       si alguien lo revisó, y con qué resultado
--   · `geom_verified_by`  quién lo aprobó
--   · `geom_verified_at`  cuándo
--
-- Ninguna columna obligatoria nueva sobre datos existentes, ningún valor retirado, ninguna fila
-- reescrita salvo el relleno que se explica abajo. Una versión anterior de la aplicación sigue
-- arrancando contra este esquema: no lee estas columnas y `geom` no cambia.
--
-- LA REGLA QUE NO SE PUEDE SALTAR
-- **Una geometría DEMO no puede quedar VERIFIED.** No es una convención de la capa de servicio que
-- alguien pueda esquivar con un UPDATE: es un CHECK de la base. Volver oficial un rectángulo de
-- demostración exige volver a dibujarlo o importarlo —lo que cambia su procedencia—, nunca
-- únicamente cambiarle el estado. Las ocho DEMO se CONSERVAN para pruebas: esta migración las
-- etiqueta, no las borra.
--
-- POR QUÉ NO SE CORRIGE LA V41_0 EN SU SITIO
-- Ya está aplicada y Flyway valida su suma de verificación. Su defecto —el `WHERE` no filtra por
-- municipalidad, y el código de zona sólo es único DENTRO de una— se corrige acá, que es donde
-- corresponde: el UPDATE de abajo sí lleva la cláusula de inquilino.
-- =================================================================================================

-- --- 1. Las columnas -----------------------------------------------------------------------------
--
-- `varchar` + CHECK y no un tipo `enum` de PostgreSQL, que es la convención que el repositorio ya
-- usa (`parking_spaces.status`, `audit_events.actor_portal`): agregar un valor nuevo a un CHECK es
-- una migración trivial, a un `enum` no lo es.

ALTER TABLE parking_zones
    ADD COLUMN geom_source      varchar(32),
    ADD COLUMN geom_status      varchar(24) NOT NULL DEFAULT 'UNVERIFIED',
    ADD COLUMN geom_verified_by uuid REFERENCES users (id),
    ADD COLUMN geom_verified_at timestamptz;

COMMENT ON COLUMN parking_zones.geom_source IS
    'De dónde salió el perímetro: MUNICIPAL_OFFICIAL (acto o documento oficial), GIS_IMPORT '
    '(archivo catastral), ADMIN_DRAWING (dibujado en el portal) o DEMO (dato de demostración, '
    'NUNCA operativo). NULL cuando la zona no tiene geometría.';

COMMENT ON COLUMN parking_zones.geom_status IS
    'Si una PERSONA revisó el perímetro y con qué resultado: UNVERIFIED (nadie lo ha mirado), '
    'PENDING_REVIEW, VERIFIED o REJECTED. Ninguna regla de este esquema mira vértices para '
    'decidirlo: el estado lo pone alguien que responde por él.';

COMMENT ON COLUMN parking_zones.geom_verified_by IS
    'Quién aprobó o rechazó el perímetro. La EVIDENCIA de la decisión no es esta columna sino el '
    'evento sellado en audit_events (ZONE_GEOMETRY_VERIFIED / ZONE_GEOMETRY_REJECTED); acá queda '
    'sólo lo que hace falta para responder «¿quién?» sin recorrer la bitácora.';

ALTER TABLE parking_zones
    ADD CONSTRAINT ck_parking_zones_geom_source
        CHECK (geom_source IS NULL
               OR geom_source IN ('MUNICIPAL_OFFICIAL', 'GIS_IMPORT', 'ADMIN_DRAWING', 'DEMO')),
    ADD CONSTRAINT ck_parking_zones_geom_status
        CHECK (geom_status IN ('UNVERIFIED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED'));

-- Un VERIFIED sin autor ni fecha es un sello sin firma: no dice nada y nadie responde por él.
ALTER TABLE parking_zones
    ADD CONSTRAINT ck_parking_zones_geom_verified_complete
        CHECK (geom_status <> 'VERIFIED'
               OR (geom_verified_by IS NOT NULL AND geom_verified_at IS NOT NULL));

-- LA REGLA DURA. Un dato de demostración no se vuelve oficial cambiándole el estado. Para que un
-- rectángulo DEMO llegue a VERIFIED hay que volver a dibujarlo o importarlo, y eso cambia
-- `geom_source` antes de que nadie pueda aprobarlo. La prohibición vive en la base —no en la capa
-- de servicio— precisamente para que un UPDATE a mano, un script de soporte o un defecto futuro
-- tampoco puedan saltársela.
ALTER TABLE parking_zones
    ADD CONSTRAINT ck_parking_zones_geom_demo_never_verified
        CHECK (geom_source IS DISTINCT FROM 'DEMO' OR geom_status <> 'VERIFIED');

-- LA MISMA REGLA, SOBRE LA TRANSICIÓN. El CHECK de arriba prohíbe el ESTADO «DEMO y aprobada»,
-- pero un CHECK sólo ve la fila que queda: un UPDATE que en la MISMA sentencia reescribe la
-- procedencia y pone VERIFIED pasa por él sin ruido, porque la fila resultante ya no dice DEMO.
-- Eso se midió contra PostGIS y pasaba. Lo que cierra ese camino es un disparador, que sí ve la
-- fila de antes:
--
--   una geometría DEMO no puede quedar VERIFIED si el POLÍGONO no cambió en esa misma sentencia.
--
-- Es exactamente la regla de negocio: para volver oficial un rectángulo de demostración hay que
-- volver a dibujarlo o importarlo. Cambiarle el adjetivo no es dibujarlo.
--
-- Lo que esto NO pretende: alguien con acceso directo a la tabla puede reescribir la procedencia
-- en una sentencia y aprobar en la siguiente. Ninguna restricción de esquema puede impedirlo —en
-- ese punto ya falsificó el dato— y para eso están los permisos de base y la bitácora. Lo que se
-- cierra acá es el atajo de un solo paso, que es el que alguien da sin darse cuenta.
--
-- Mismo patrón que `luparx_refuse_mutation()` de la V31_0, que es como este esquema ya expresa
-- las reglas que un CHECK no alcanza.
CREATE OR REPLACE FUNCTION luparx_demo_geometry_never_verified() RETURNS trigger AS $$
BEGIN
    IF OLD.geom_source = 'DEMO'
       AND NEW.geom_status = 'VERIFIED'
       AND NEW.geom IS NOT DISTINCT FROM OLD.geom THEN
        RAISE EXCEPTION
            'El perimetro de la zona % es un dato de demostracion: no se aprueba cambiandole el '
            'estado. Hay que volver a dibujarlo desde el portal o importarlo de un archivo GIS, y '
            'aprobar ese (CONTRACT.md v0.44).',
            OLD.code
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION luparx_demo_geometry_never_verified() IS
    'Impide aprobar un perimetro de demostracion sin haberlo redibujado. El CHECK prohibe el estado '
    'final; esto prohibe la transicion, que es lo que un CHECK no puede ver.';

CREATE TRIGGER trg_parking_zones_demo_never_verified
    BEFORE UPDATE ON parking_zones
    FOR EACH ROW EXECUTE FUNCTION luparx_demo_geometry_never_verified();

-- Sin polígono no hay procedencia que declarar ni revisión que sostener. Esto es lo que mantiene
-- coherente el borrado de geometría: al limpiar `geom` se limpia todo lo demás.
ALTER TABLE parking_zones
    ADD CONSTRAINT ck_parking_zones_geom_absent_is_clean
        CHECK (geom IS NOT NULL
               OR (geom_source IS NULL AND geom_status = 'UNVERIFIED'
                   AND geom_verified_by IS NULL AND geom_verified_at IS NULL));

-- --- 2. Relleno de lo que ya existe --------------------------------------------------------------
--
-- Toda zona que YA tiene polígono queda ADMIN_DRAWING / UNVERIFIED. Nadie ha verificado nada
-- todavía y decir lo contrario sería falsear el dato: el objetivo de esta migración es que el
-- estado signifique algo, no que arranque en verde.

UPDATE parking_zones
   SET geom_source = 'ADMIN_DRAWING'
 WHERE geom IS NOT NULL
   AND geom_source IS NULL;

-- --- 3. Las ocho de demostración, marcadas por IDENTIDAD y no por forma ---------------------------
--
-- `ST_Equals` contra el WKT **literal que escribió la V41_0** es igualdad con un valor conocido, no
-- una heurística. Si una municipalidad ya redibujó esa zona, su geometría ya no es igual y no se
-- toca: redibujada deja de ser la semilla.
--
-- Y el filtro por inquilino que a la V41_0 le falta. En producción esto no encuentra nada —las
-- zonas `SJ-*` sólo las crea el sembrador de desarrollo—, lo cual es el resultado correcto.
--
-- REJECTED y no UNVERIFIED a propósito: UNVERIFIED dice «nadie la ha mirado todavía», y a éstas sí
-- las miramos y sabemos que no sirven para cobrar, fiscalizar ni resolver un reclamo. Se conservan
-- en la base, con su polígono intacto, porque el ambiente de pruebas las necesita.

UPDATE parking_zones z
   SET geom_source = 'DEMO',
       geom_status = 'REJECTED',
       geom_verified_by = NULL,
       geom_verified_at = NULL
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
   AND z.geom IS NOT NULL
   AND z.tenant_id = (SELECT t.id FROM tenants t WHERE t.slug = 'san-jose')
   AND ST_Equals(z.geom, ST_Multi(ST_GeomFromText(g.wkt, 4326)));

-- --- 4. Índice -----------------------------------------------------------------------------------
--
-- Parcial por la misma razón que el GiST de la V38_0: una zona sin dibujar nunca es respuesta de
-- una consulta de mapa, e indexarla sería pagar por filas que jamás participan. Sirve a las dos
-- preguntas nuevas: la del ciudadano («las verificadas de esta municipalidad») y la de la
-- municipalidad («cuáles me faltan por verificar»).

CREATE INDEX ix_parking_zones_geom_status
    ON parking_zones (tenant_id, geom_status)
    WHERE geom IS NOT NULL;

COMMENT ON COLUMN parking_zones.geom IS
    'Geometría de la zona (MultiPolygon, SRID 4326), nullable: una zona sin geometría cobra igual. '
    'Se lee y se escribe como GeoJSON (RFC 7946) por la API. Desde la V43_0 su procedencia y su '
    'estado de verificación viven en geom_source y geom_status: un polígono sin VERIFIED no es un '
    'límite oficial y, por omisión, el mapa del ciudadano no lo recibe.';
