-- =============================================================================================
-- V32_0 — De dónde viene una boleta (CONTRACT.md v0.34).
--
-- Punto 9 de la lista: «Preparar el modelo aunque inicialmente una municipalidad siga utilizando
-- otro sistema.»
--
-- Las nueve viñetas del punto —placa, inspector, causal, fecha/hora, ubicación/zona, evidencia,
-- observaciones, número y estado— ya existen desde V17_0. Lo que no cabía en el modelo era la
-- primera frase: una boleta que NACIÓ en otro sistema. Hoy `citations` exige un inspector que sea
-- usuario de LupaRX, exige una causal del catálogo propio, y su número sale de la serie propia. Una
-- municipalidad que sigue emitiendo en su sistema actual no tiene por dónde entrar, y la salida
-- natural —«que el integrador invente un inspector y una causal»— llena la tabla de datos falsos en
-- las tres columnas por las que después va a preguntar un auditor.
--
-- Esta migración agrega el ORIGEN del acto y afloja, SÓLO para lo externo, las tres exigencias que
-- suponían que todo se emitió aquí. Para lo propio no cambia nada: lo que era obligatorio sigue
-- siéndolo, y ahora lo dice un CHECK en vez de un NOT NULL —que es más preciso, porque la regla
-- nunca fue «toda boleta tiene inspector» sino «toda boleta NUESTRA tiene inspector».
-- =============================================================================================


-- ---------------------------------------------------------------------------------------------
-- 1. El origen.
--
-- `source` con DEFAULT 'LUPARX': toda fila existente es nuestra, que es exactamente lo que era. Una
-- instancia vieja corriendo en paralelo no ve estas columnas y sigue funcionando (ADR 0010).
-- ---------------------------------------------------------------------------------------------
ALTER TABLE citations
    ADD COLUMN source                 varchar(16) NOT NULL DEFAULT 'LUPARX',
    -- Quién es «el otro sistema». Texto y no un catálogo: una municipalidad puede tener dos, y
    -- obligar a darlos de alta antes de poder recibir una boleta es exactamente la clase de
    -- configuración faltante que hace que un ingreso se rechace a las 2 de la mañana.
    ADD COLUMN source_system          varchar(64),
    -- El identificador de la boleta EN el otro sistema. Es la llave de la idempotencia: el mismo
    -- valor dos veces es la misma boleta, no una segunda.
    ADD COLUMN external_id            varchar(128),
    -- El estado tal como lo dice el otro sistema, con su propia palabra («EN COBRO JUDICIAL»).
    -- Se guarda además del estado mapeado porque el mapeo pierde matiz, y el ciudadano que llama a
    -- preguntar va a citar la palabra del otro sistema, no la nuestra.
    ADD COLUMN external_status        varchar(64),
    -- Quién levantó el acto allá. Una cédula, un código de funcionario, un nombre: no lo sabemos y
    -- no lo vamos a fingir. Se guarda como venga, y `inspector_name_snapshot` —que ya existía— lleva
    -- el nombre para mostrar.
    ADD COLUMN inspector_external_ref varchar(128),
    ADD COLUMN imported_at            timestamptz,
    -- Cada reingreso lo refresca. Es lo que contesta «¿hace cuánto que el otro sistema no habla?»,
    -- que es la pregunta que se hace cuando una boleta que debería estar pagada sigue apareciendo
    -- pendiente.
    ADD COLUMN last_seen_at           timestamptz;

ALTER TABLE citations
    ADD CONSTRAINT ck_citations_source CHECK (source IN ('LUPARX', 'EXTERNAL'));

-- Una boleta externa sin sistema ni identificador no se puede volver a encontrar, así que tampoco
-- se puede actualizar sin duplicarla. Es el mínimo para que el espejo sea un espejo.
ALTER TABLE citations
    ADD CONSTRAINT ck_citations_external_identified CHECK (
        source <> 'EXTERNAL'
        OR (source_system IS NOT NULL AND external_id IS NOT NULL AND imported_at IS NOT NULL));

-- Y al revés: lo que dice ser nuestro tiene que traer las columnas que sólo puede tener lo nuestro.
-- Esto es lo que reemplaza a los dos NOT NULL que se quitan abajo, y es más exacto que ellos.
ALTER TABLE citations
    ADD CONSTRAINT ck_citations_luparx_authored CHECK (
        source <> 'LUPARX' OR (inspector_user_id IS NOT NULL AND infraction_type_id IS NOT NULL));

ALTER TABLE citations ALTER COLUMN inspector_user_id  DROP NOT NULL;
ALTER TABLE citations ALTER COLUMN infraction_type_id DROP NOT NULL;

-- La idempotencia del ingreso, en la base y no en la aplicación: con dos instancias detrás del
-- balanceador, dos reintentos simultáneos del otro sistema llegan a dos procesos distintos, y lo
-- único que los ordena es un índice único.
CREATE UNIQUE INDEX uq_citations_external ON citations (tenant_id, source_system, external_id)
    WHERE source = 'EXTERNAL';

-- «Todo lo que entró del sistema X», que es la consulta de la conciliación y la de la auditoría.
CREATE INDEX ix_citations_source ON citations (tenant_id, source, occurred_at DESC);

COMMENT ON COLUMN citations.source IS
    'LUPARX: el acto se levantó aquí y la plataforma es dueña de su ciclo de vida. EXTERNAL: la '
    'boleta nació en otro sistema y esta fila es un espejo — se lee, no se cobra ni se mueve aquí.';
COMMENT ON COLUMN citations.external_id IS
    'Identificador de la boleta en el otro sistema. Llave de idempotencia del ingreso: el mismo '
    'valor dos veces actualiza la misma fila, nunca crea una segunda.';
COMMENT ON COLUMN citations.last_seen_at IS
    'Último ingreso que confirmó esta boleta. Contesta hace cuánto que el otro sistema no habla, '
    'que es lo primero que se pregunta cuando un estado se ve viejo.';


-- ---------------------------------------------------------------------------------------------
-- 2. El número.
--
-- `number` es lo que el ciudadano cita por teléfono, y para una boleta externa eso es el número del
-- OTRO sistema, tal cual. Sigue siendo único por municipalidad —dos boletas con el mismo número es
-- una municipalidad que no puede contestar «¿cuál de las dos?»— pero `series_year` y
-- `sequence_number` son de NUESTRA serie y una boleta externa no los tiene.
--
-- Por eso la restricción de «boleta emitida completa» se vuelve consciente del origen. La regla no
-- cambió: una boleta emitida tiene que poderse citar y poderse pagar. Lo que cambió es que ahora
-- distingue entre poderse citar con nuestro consecutivo y poderse citar con el de otro.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE citations DROP CONSTRAINT ck_citations_issued_complete;

ALTER TABLE citations
    ADD CONSTRAINT ck_citations_issued_complete CHECK (
        status = 'DRAFT'
        OR (number IS NOT NULL AND issued_at IS NOT NULL
            AND (source = 'EXTERNAL'
                 OR (series_year IS NOT NULL AND sequence_number IS NOT NULL AND due_at IS NOT NULL))));

-- Una boleta externa nunca es un borrador: llegó ya emitida por otro. Un borrador es un acto a
-- medio levantar en el teléfono de un inspector nuestro, y eso no puede venir de afuera.
ALTER TABLE citations
    ADD CONSTRAINT ck_citations_external_not_draft CHECK (source <> 'EXTERNAL' OR status <> 'DRAFT');


-- ---------------------------------------------------------------------------------------------
-- 3. La causal del otro sistema.
--
-- El código y el nombre de la infracción ya se copian dentro de la boleta desde V17_0 —porque el
-- catálogo es configuración y se edita, y subir una multa el año que viene no puede cambiar por
-- cuánto multaron a alguien el año pasado. Ese snapshot es justo lo que hace que una causal ajena
-- quepa sin tocar nada: entra con el código y el nombre del otro sistema, y ya está guardada.
--
-- Lo que falta es que los reportes puedan sumar. Esta tabla enlaza «el código X del sistema Y» con
-- una infracción del catálogo, DESPUÉS y sin bloquear: un ingreso nunca se rechaza porque falte el
-- mapeo, y cuando el mapeo aparece se aplica hacia adelante y hacia atrás.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE external_infraction_mappings (
    id                 uuid         PRIMARY KEY,
    tenant_id          uuid         NOT NULL REFERENCES tenants (id),
    source_system      varchar(64)  NOT NULL,
    external_code      varchar(64)  NOT NULL,
    -- El nombre con el que llegó la última vez. No se usa para decidir nada: está para que el
    -- administrador que abre la pantalla de mapeo vea qué es «ART-142-B» sin tener que adivinarlo.
    external_name      varchar(160),
    infraction_type_id uuid         NOT NULL REFERENCES infraction_types (id),
    created_at         timestamptz  NOT NULL,
    updated_at         timestamptz  NOT NULL,
    created_by         uuid         REFERENCES users (id),
    version            bigint       NOT NULL DEFAULT 0
);

-- Un código de un sistema se mapea a una sola infracción. Al revés no: varias causales ajenas
-- pueden caer en la misma nuestra, y eso es normal —dos sistemas nunca parten el mundo igual.
CREATE UNIQUE INDEX uq_external_infraction_mappings
    ON external_infraction_mappings (tenant_id, source_system, external_code);

CREATE INDEX ix_external_infraction_mappings_type
    ON external_infraction_mappings (tenant_id, infraction_type_id);

COMMENT ON TABLE external_infraction_mappings IS
    'Enlaza la causal de otro sistema con una del catálogo, para que los reportes sumen. Opcional '
    'y posterior a propósito: ningún ingreso se rechaza por falta de mapeo.';


-- ---------------------------------------------------------------------------------------------
-- 4. Lo que el espejo NO hace.
--
-- «Sólo espejo» se decide en el servicio, que es donde están las transiciones y donde hay un
-- mensaje que darle a una persona. Pero la aplicación no es suficiente: un job, una migración de
-- datos o una consola pueden mover un estado sin pasar por ahí, y entonces la municipalidad tendría
-- en LupaRX una boleta pagada que en su sistema sigue debiéndose. Eso no es un error de pantalla,
-- es plata.
--
-- Así que la base también lo dice. Una boleta externa no puede quedar PAID: en LupaRX no se le cobró
-- a nadie, y si el otro sistema la reporta pagada, eso viaja en `external_status` y en el estado
-- mapeado que el ingreso escribe — no en un pago que aquí nunca ocurrió.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE citations
    ADD CONSTRAINT ck_citations_external_not_settled_here CHECK (
        source <> 'EXTERNAL' OR status <> 'PAID' OR external_status IS NOT NULL);

COMMENT ON CONSTRAINT ck_citations_external_not_settled_here ON citations IS
    'Una boleta espejo sólo puede figurar pagada si el otro sistema lo dijo. LupaRX no cobra lo que '
    'no emitió, y un PAID sin palabra del otro sistema sería un cobro inventado.';
