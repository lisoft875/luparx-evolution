-- =============================================================================================
-- V29_0 — Permisos y exoneraciones completos (CONTRACT.md v0.30).
--
-- v0.28 dio la mitad: una placa, un motivo escrito, una vigencia y quién la otorgó. Faltaban cuatro
-- cosas que un permiso de verdad tiene, y cada una arregla un caso concreto:
--
--   * LA CATEGORÍA — discapacidad, vehículo institucional, cortesía, permiso especial. En v0.28
--     argumenté en contra de un enum y ese argumento sigue en pie: qué exonera un país no es lo que
--     exonera otro, y una enumeración en el esquema sería la ley de Costa Rica incrustada aquí. La
--     salida no es renunciar a la categoría: es hacerla CONFIGURACIÓN. Un catálogo por municipalidad,
--     sembrado con las cuatro que el producto pidió y editable.
--
--   * EL BENEFICIARIO — persona u organización. Un permiso de discapacidad es de doña María, no del
--     carro; el institucional es del Ministerio, no de la placa. Sin esto, «¿de quién es este
--     permiso?» se contesta leyendo un campo de texto libre.
--
--   * VARIAS PLACAS POR PERMISO — porque el de discapacidad acompaña a la persona: a veces anda en
--     su carro y a veces en el del hijo que la lleva. Con una placa por permiso hay que registrarlo
--     dos veces, y el día que se revoca uno queda el otro exonerando.
--
--   * APROBADO / RECHAZADO — un estado que se pueda rechazar implica que algo se solicitó. Se separa
--     quién lo pide de quién lo resuelve, que es lo que contesta a un ente contralor cuando pregunta
--     quién autorizó que ese carro no pagara.
--
-- Más los DOCUMENTOS DE RESPALDO como archivos, no como una referencia escrita: el dictamen de
-- discapacidad, el acuerdo municipal, la nota. Es lo que hace defendible una exoneración cuando
-- alguien la cuestiona años después.
--
-- FASE DE EXPANSIÓN (ADR 0010). Nada se borra ni se renombra: las columnas de v0.28 siguen ahí y se
-- siguen escribiendo, y la contracción —soltar `plate`, `plate_raw`, `granted_by`, `granted_at` del
-- padre— es otra versión, cuando no queden instancias que las lean.
-- =============================================================================================


-- ---------------------------------------------------------------------------------------------
-- 1. El catálogo de categorías, por municipalidad.
--
-- Configuración y no enum, por lo dicho arriba. `code` es lo que el código puede reconocer cuando
-- necesita tratar una categoría distinto —hoy nada lo necesita— y `name` es lo que se lee en
-- pantalla, en el idioma de la municipalidad que lo escribió.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE exemption_types (
    id          uuid         PRIMARY KEY,
    tenant_id   uuid         NOT NULL REFERENCES tenants (id),
    code        varchar(32)  NOT NULL,
    name        varchar(120) NOT NULL,
    description varchar(400),
    -- Si esta categoría exige identificar a la persona u organización beneficiaria. Una cortesía de
    -- media hora puede no tener beneficiario; un permiso de discapacidad sin persona no es nada.
    requires_beneficiary boolean NOT NULL DEFAULT true,
    active      boolean      NOT NULL DEFAULT true,
    created_at  timestamptz  NOT NULL,
    updated_at  timestamptz  NOT NULL,
    CONSTRAINT uq_exemption_types_code UNIQUE (tenant_id, code),
    CONSTRAINT ck_exemption_types_code CHECK (code = upper(code) AND code !~ '[^A-Z0-9_]')
);

COMMENT ON TABLE exemption_types IS
    'Categorías de permiso de cada municipalidad. Configuración, no enumeración: qué exonera un país '
    'no es lo que exonera otro. Se siembran cuatro y la municipalidad las edita.';

-- Las cuatro que pidió el producto, para cada municipalidad que ya existe. Sembradas y no fijas: se
-- pueden renombrar, desactivar o acompañar de otras sin tocar una línea de código.
INSERT INTO exemption_types (id, tenant_id, code, name, description, requires_beneficiary, active,
                             created_at, updated_at)
SELECT gen_random_uuid(), t.id, v.code, v.name, v.description, v.requires_beneficiary, true,
       now(), now()
FROM tenants t
CROSS JOIN (VALUES
    ('DISABILITY', 'Discapacidad',
     'Persona con discapacidad. El permiso acompaña a la persona, así que suele amparar más de una placa.',
     true),
    ('INSTITUTIONAL', 'Vehículo institucional',
     'Flotilla municipal, emergencias, cuerpos oficiales.', true),
    ('COURTESY', 'Cortesía o autorización',
     'Autorización puntual otorgada por la municipalidad.', false),
    ('SPECIAL', 'Permiso especial',
     'Cualquier otro permiso previsto por la normativa de la municipalidad.', true)
) AS v(code, name, description, requires_beneficiary);


-- ---------------------------------------------------------------------------------------------
-- 2. El permiso: categoría, beneficiario y flujo de aprobación.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE plate_exemptions
    ADD COLUMN exemption_type_id    uuid REFERENCES exemption_types (id),
    ADD COLUMN beneficiary_kind     varchar(16),
    ADD COLUMN beneficiary_name     varchar(200),
    -- Cédula de la persona, o cédula jurídica de la organización. Es un identificador personal, así
    -- que sólo lo lee quien administra fiscalización y nunca sale hacia la app del fiscalizador.
    ADD COLUMN beneficiary_document varchar(64),
    ADD COLUMN requested_by         uuid REFERENCES users (id),
    ADD COLUMN requested_at         timestamptz,
    ADD COLUMN decided_by           uuid REFERENCES users (id),
    ADD COLUMN decided_at           timestamptz,
    ADD COLUMN decision_reason      varchar(300);

COMMENT ON COLUMN plate_exemptions.decided_by IS
    'Quién aprobó o rechazó. Separado de requested_by a propósito: «quién autorizó que ese carro no '
    'pagara» es la pregunta de un ente contralor, y no se contesta con quien digitó la solicitud.';
COMMENT ON COLUMN plate_exemptions.beneficiary_document IS
    'Identificador personal. Sólo para quien administra fiscalización; nunca viaja al fiscalizador.';

-- Cuatro estados. PENDING es nuevo y es el que hace posible RECHAZADO: un estado que se puede
-- rechazar implica que antes algo se solicitó.
ALTER TABLE plate_exemptions DROP CONSTRAINT ck_plate_exemptions_status;
ALTER TABLE plate_exemptions ADD CONSTRAINT ck_plate_exemptions_status
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED', 'ACTIVE'));

-- Lo que v0.28 llamó ACTIVE es lo que v0.30 llama APPROVED: mismo hecho, nombre honesto ahora que
-- existe un estado anterior. 'ACTIVE' se deja en el CHECK durante la expansión para que una
-- instancia vieja pueda seguir escribiéndolo, y sale en la contracción.
UPDATE plate_exemptions SET status = 'APPROVED' WHERE status = 'ACTIVE';
UPDATE plate_exemptions
   SET decided_by = granted_by,
       decided_at = granted_at,
       requested_by = granted_by,
       requested_at = granted_at
 WHERE decided_at IS NULL;

-- Toda fila existente pasa a la categoría genérica de su municipalidad.
UPDATE plate_exemptions e
   SET exemption_type_id = t.id
  FROM exemption_types t
 WHERE t.tenant_id = e.tenant_id AND t.code = 'SPECIAL' AND e.exemption_type_id IS NULL;

ALTER TABLE plate_exemptions ADD CONSTRAINT ck_plate_exemptions_decided CHECK (
    status NOT IN ('APPROVED', 'REJECTED') OR decided_at IS NOT NULL);
ALTER TABLE plate_exemptions ADD CONSTRAINT ck_plate_exemptions_beneficiary CHECK (
    beneficiary_kind IS NULL OR beneficiary_kind IN ('PERSON', 'ORGANISATION'));

-- La placa del padre deja de ser la verdad y pasa a ser una copia de la primera del hijo, escrita
-- durante la expansión para que una instancia vieja siga leyendo algo correcto.
ALTER TABLE plate_exemptions ALTER COLUMN plate DROP NOT NULL;
ALTER TABLE plate_exemptions ALTER COLUMN plate_raw DROP NOT NULL;
COMMENT ON COLUMN plate_exemptions.plate IS
    'OBSOLETA desde v0.30: la verdad son las filas de exemption_plates. Se sigue escribiendo con la '
    'primera de ellas durante la fase de expansión (ADR 0010) y se suelta en la contracción.';


-- ---------------------------------------------------------------------------------------------
-- 3. Las placas que ampara un permiso.
--
-- Una o varias. El permiso de discapacidad es de la persona y la acompaña: a veces anda en su carro
-- y a veces en el del hijo que la lleva, y con una placa por permiso habría que registrarlo dos
-- veces —con el riesgo de revocar uno y que el otro siga exonerando—.
--
-- `tenant_id` y `status` están duplicados aquí a propósito, y es la única desnormalización de esta
-- versión. Son lo que le permite a la BASE DE DATOS sostener la invariante «una placa no puede tener
-- dos permisos aprobados a la vez en la misma municipalidad»: PostgreSQL no puede poner un índice
-- parcial sobre una condición que vive en otra tabla, y las alternativas eran un disparador —lógica
-- de negocio escondida— o dejar la invariante sólo en el servicio, que es justo lo que este esquema
-- no hace en ninguna otra parte. Se escriben en la misma transacción que el padre y en un solo lugar.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE exemption_plates (
    exemption_id uuid        NOT NULL REFERENCES plate_exemptions (id) ON DELETE CASCADE,
    tenant_id    uuid        NOT NULL REFERENCES tenants (id),
    plate        varchar(16) NOT NULL,
    plate_raw    varchar(32) NOT NULL,
    status       varchar(16) NOT NULL,
    added_at     timestamptz NOT NULL,
    PRIMARY KEY (exemption_id, plate),
    CONSTRAINT ck_exemption_plates_plate CHECK (plate = upper(plate) AND plate !~ '[^A-Z0-9]'),
    CONSTRAINT ck_exemption_plates_status CHECK (
        status IN ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED'))
);

COMMENT ON TABLE exemption_plates IS
    'Las placas que ampara un permiso. `status` es una copia del padre, mantenida en la misma '
    'transacción, y existe únicamente para que el índice único de abajo pueda sostener la invariante.';

-- Un permiso APROBADO por placa y municipalidad. Un permiso aprobado que ya venció sigue ocupando
-- la placa: para dar otro hay que revocar el anterior, que es un acto deliberado y con motivo — y
-- eso es exactamente lo que un registro de exoneraciones debería exigir.
CREATE UNIQUE INDEX uq_exemption_plates_approved
    ON exemption_plates (tenant_id, plate) WHERE status = 'APPROVED';

-- La consulta del fiscalizador: esta placa, en esta municipalidad, ahora.
CREATE INDEX ix_exemption_plates_lookup ON exemption_plates (tenant_id, plate, status);

-- Las placas de v0.28 pasan a ser filas del hijo.
INSERT INTO exemption_plates (exemption_id, tenant_id, plate, plate_raw, status, added_at)
SELECT e.id, e.tenant_id, e.plate, e.plate_raw, e.status, e.granted_at
FROM plate_exemptions e
WHERE e.plate IS NOT NULL;


-- ---------------------------------------------------------------------------------------------
-- 4. Los documentos de respaldo.
--
-- La misma forma que `citation_evidence`, y por la misma razón: quien impugna una exoneración años
-- después tiene derecho a ver en qué se sustentó. El archivo vive donde vive la evidencia de las
-- boletas —el mismo puerto de almacenamiento— y aquí queda su huella.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE exemption_documents (
    id           uuid         PRIMARY KEY,
    tenant_id    uuid         NOT NULL REFERENCES tenants (id),
    exemption_id uuid         NOT NULL REFERENCES plate_exemptions (id),
    -- Lo que el funcionario dice que es: dictamen, acuerdo, nota. Texto y no catálogo, por lo mismo
    -- que la categoría no era un enum antes de ser configuración.
    title        varchar(200) NOT NULL,
    storage_key  varchar(400) NOT NULL,
    content_type varchar(100) NOT NULL,
    byte_size    bigint       NOT NULL,
    sha256       varchar(64)  NOT NULL,
    uploaded_by  uuid         NOT NULL REFERENCES users (id),
    created_at   timestamptz  NOT NULL,
    CONSTRAINT ck_exemption_documents_size CHECK (byte_size > 0)
);

CREATE INDEX ix_exemption_documents_exemption ON exemption_documents (exemption_id, created_at);

COMMENT ON TABLE exemption_documents IS
    'Respaldo de un permiso: el dictamen, el acuerdo, la nota. Nunca se borra desde la aplicación, '
    'porque es en lo que se sustentó no multar a un vehículo.';
