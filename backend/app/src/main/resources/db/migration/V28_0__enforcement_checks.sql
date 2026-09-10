-- =============================================================================================
-- V28_0 — El registro de consultas de fiscalización (CONTRACT.md v0.29).
--
-- EL HUECO
--
-- Hasta ahora la boleta quedaba registrada de tres formas —su propio historial, la bitácora de la
-- plataforma y la evidencia— pero la CONSULTA no dejaba rastro alguno. Un fiscalizador podía correr
-- el padrón de placas un turno entero y el sistema no guardaba nada: ni que consultó, ni qué placa,
-- ni qué le contestó el sistema. Eso deja tres preguntas sin respuesta, y las tres se hacen:
--
--   * «me multaron sin ir a ver el carro» — no había con qué contestarla;
--   * «este funcionario consultó la placa de un conocido» — invisible;
--   * «¿qué hizo este funcionario el martes?» — sólo se sabía si emitió boletas.
--
-- POR QUÉ UNA TABLA PROPIA Y NO `audit_events`
--
-- Volumen. Un fiscalizador consulta cientos de placas por turno; meter eso en la bitácora
-- administrativa la ahogaría —y esa bitácora existe para que se puedan encontrar los actos de
-- administración, que son decenas al día—. Además esta tabla tiene su propia retención, sus propios
-- índices y su propia pantalla, que es exactamente la definición de otra tabla.
--
-- SÓLO SE AGREGA
--
-- Nunca se actualiza ni se borra desde la aplicación. Por eso el enlace con la boleta que salió de
-- una consulta vive en `citations.enforcement_check_id` y no aquí: la boleta se escribe después, y
-- ponerle una columna a esta tabla para llenarla más tarde la convertiría en algo que se modifica.
-- El único borrado es la depuración por retención, que es un trabajo explícito y auditado.
-- =============================================================================================

CREATE TABLE enforcement_checks (
    id                 uuid         PRIMARY KEY,
    tenant_id          uuid         NOT NULL REFERENCES tenants (id),
    inspector_user_id  uuid         NOT NULL REFERENCES users (id),

    -- Como la tecleó y como se comparó. Las dos, porque la impugnación se hace sobre lo que el
    -- funcionario escribió y la búsqueda se hace sobre la forma canónica.
    plate_raw          varchar(32)  NOT NULL,
    plate              varchar(16)  NOT NULL,

    zone_id            uuid         REFERENCES parking_zones (id),
    space_code         varchar(32),

    -- El resultado. Exactamente uno de los dos: el veredicto cuando el servidor contestó, o el
    -- código de rechazo cuando se negó a contestar. Los rechazos también son resultados y hasta
    -- ahora tampoco dejaban rastro: una consulta a una zona no asignada no se sabía que ocurrió.
    verdict            varchar(16),
    refusal_code       varchar(64),

    -- Ubicación. Nunca se inventa, y desde v0.29 se dice CUÁL de los tres casos fue: hasta ahora
    -- «no dio permiso», «se venció el intento» y «no hay señal» terminaban los tres en coordenadas
    -- nulas y eran indistinguibles, tanto aquí como en la boleta.
    location_state     varchar(16)  NOT NULL,
    latitude           numeric(9,6),
    longitude          numeric(9,6),
    location_accuracy_m numeric(7,1),

    -- El dispositivo, con lo que el navegador ya manda. Es poco: en una aplicación de Capacitor
    -- todos los teléfonos Android se parecen. Contesta «fue un teléfono o un escritorio» y poco
    -- más, y está anotado como lo que es para que nadie construya sobre ello creyendo que
    -- identifica un aparato.
    user_agent         varchar(400),
    ip_hash            varchar(64),

    occurred_at        timestamptz  NOT NULL,

    CONSTRAINT ck_enforcement_checks_result CHECK (
        (verdict IS NOT NULL AND refusal_code IS NULL)
        OR (verdict IS NULL AND refusal_code IS NOT NULL)),
    CONSTRAINT ck_enforcement_checks_verdict CHECK (verdict IS NULL OR verdict IN (
        'EXEMPT', 'COVERED', 'EXPIRED', 'BAY_MISMATCH', 'NOT_COVERED', 'AMBIGUOUS')),
    CONSTRAINT ck_enforcement_checks_location_state CHECK (
        location_state IN ('FIX', 'NO_FIX', 'NOT_GRANTED')),
    -- Coordenadas sólo cuando hubo fijación, y las dos juntas o ninguna: media coordenada no ubica
    -- nada y una fijación sin coordenadas no es una fijación.
    CONSTRAINT ck_enforcement_checks_location CHECK (
        (location_state = 'FIX' AND latitude IS NOT NULL AND longitude IS NOT NULL)
        OR (location_state <> 'FIX' AND latitude IS NULL AND longitude IS NULL)),
    CONSTRAINT ck_enforcement_checks_lat CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
    CONSTRAINT ck_enforcement_checks_lon CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
    CONSTRAINT ck_enforcement_checks_accuracy CHECK (
        location_accuracy_m IS NULL OR location_accuracy_m >= 0),
    CONSTRAINT ck_enforcement_checks_plate CHECK (plate = upper(plate) AND plate !~ '[^A-Z0-9]')
);

COMMENT ON TABLE enforcement_checks IS
    'Cada consulta de placa hecha por un fiscalizador. Sólo se agrega: nunca se actualiza ni se '
    'borra desde la aplicación, y el único borrado es la depuración por retención, que es un '
    'trabajo explícito y auditado (ADR 0013).';
COMMENT ON COLUMN enforcement_checks.refusal_code IS
    'Cuando el servidor se negó a contestar: zona no asignada, bahía inexistente, placa ilegible. '
    'Un rechazo también es un resultado y hasta v0.29 no quedaba registrado en ninguna parte.';
COMMENT ON COLUMN enforcement_checks.location_state IS
    'FIX = hubo coordenadas; NO_FIX = el permiso estaba dado y no se logró fijación; NOT_GRANTED = '
    'el funcionario no ha concedido la ubicación en este dispositivo. Se distinguen porque «sin '
    'coordenadas» por las tres razones distintas no es el mismo hecho.';
COMMENT ON COLUMN enforcement_checks.user_agent IS
    'Lo que manda el navegador, sin más. NO identifica un aparato: dos teléfonos Android iguales '
    'son indistinguibles aquí. Sirve para «teléfono o escritorio» y para poco más.';

-- La consulta de la pantalla y la de la depuración: por municipalidad y por momento.
CREATE INDEX ix_enforcement_checks_tenant_occurred
    ON enforcement_checks (tenant_id, occurred_at DESC);
-- «¿Qué hizo este funcionario el martes?»
CREATE INDEX ix_enforcement_checks_inspector
    ON enforcement_checks (tenant_id, inspector_user_id, occurred_at DESC);
-- «¿Alguien consultó esta placa, y cuándo?» — la pregunta de quien impugna.
CREATE INDEX ix_enforcement_checks_plate
    ON enforcement_checks (tenant_id, plate, occurred_at DESC);


-- ---------------------------------------------------------------------------------------------
-- La boleta apunta a la consulta de la que salió.
--
-- En la BOLETA y no en la consulta, a propósito: la boleta se escribe después —a veces horas
-- después, desde la cola sin conexión— y ponerle a `enforcement_checks` una columna que se llena
-- más tarde la convertiría en una tabla que se modifica, que es justo lo que no puede ser.
--
-- Es lo que contesta «acción realizada» de la lista: la consulta sola dice que miró; ésta dice si
-- después multó. Y contesta al revés la pregunta del ciudadano —«me multaron sin ir a ver»—, que
-- hasta ahora no tenía con qué contestarse.
--
-- Anulable siempre: una boleta puede escribirse sin consulta previa (el funcionario ya vio el carro
-- ayer, la aplicación estaba sin señal), y exigir la consulta convertiría un dato de trazabilidad
-- en un impedimento para hacer el trabajo.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE citations
    ADD COLUMN enforcement_check_id uuid REFERENCES enforcement_checks (id);

COMMENT ON COLUMN citations.enforcement_check_id IS
    'La consulta de placa de la que salió esta boleta, cuando salió de una. Anulable: se puede '
    'multar sin consultar antes, y exigirlo sería convertir la trazabilidad en un obstáculo.';

CREATE INDEX ix_citations_check ON citations (enforcement_check_id)
    WHERE enforcement_check_id IS NOT NULL;
