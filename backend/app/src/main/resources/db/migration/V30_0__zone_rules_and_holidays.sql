-- =============================================================================================
-- V30_0 — Zonas y tarifas configurables: reglas propias por zona, feriados que se repiten solos y
-- minutos de cortesía (CONTRACT.md v0.31).
--
-- Lo que había estaba al revés. La TARIFA era lo único configurable por zona, y el horario, los días
-- de cobro, las fracciones y el tiempo máximo eran de toda la municipalidad. Pero la tarifa es la
-- palanca que la gente nombra y el HORARIO y el TIEMPO MÁXIMO son las que de verdad manejan la
-- rotación: el centro histórico necesita dos horas de máximo y el hospital veinticuatro, y hasta hoy
-- tenían que compartir el mismo número.
--
-- Y los feriados se digitaban fecha por fecha, sin repetición: alguien tenía que volver a escribir
-- los once feriados del país cada diciembre, para cada municipalidad. El día que se le olvidara, la
-- plataforma cobraba el 15 de setiembre.
--
-- TRES DECISIONES QUE SE SOSTIENEN EN TODO EL ARCHIVO:
--
--   1. Lo de la zona es una EXCEPCIÓN, no una copia. Una columna nula significa «lo que diga la
--      municipalidad», así que cambiar el número de la municipalidad sigue moviendo a todas las zonas
--      que no se apartaron. Copiar los valores al crear la zona habría dejado a cada una congelada en
--      lo que era cierto el día que se creó, y nadie se entera de eso hasta que audita.
--
--   2. Los FERIADOS son de la municipalidad, no de la zona. Un feriado es un feriado en todo el
--      cantón; una zona puede tener horario propio de lunes a domingo, pero el 15 de setiembre no se
--      cobra en ninguna. Darle excepciones propias a cada zona sería multiplicar por zona el trabajo
--      que esta versión existe para quitar.
--
--   3. La REPETICIÓN se guarda como regla, no como fechas expandidas. Guardar los próximos veinte
--      años de cada feriado sería veinte veces la misma decisión, y cambiar la ley obligaría a
--      reescribir filas históricas. La fila dice «el 15 de setiembre» o «Jueves Santo» y la fecha se
--      calcula para el año que se está preguntando.
-- =============================================================================================


-- ---------------------------------------------------------------------------------------------
-- 1. Minutos de cortesía de la municipalidad.
--
-- Los primeros minutos no se cobran: el que se baja a dejar algo no paga. Cero por omisión, que es lo
-- que todas las municipalidades tienen hoy, así que la columna no cambia el comportamiento de nadie
-- hasta que alguien la suba.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE parking_policies
    ADD COLUMN free_minutes integer NOT NULL DEFAULT 0,
    ADD CONSTRAINT ck_parking_policies_free_minutes CHECK (free_minutes >= 0);

COMMENT ON COLUMN parking_policies.free_minutes IS
    'Minutos de cortesía al inicio. Una estadía que no los pase no se cobra, y sólo se concede UNA vez '
    'por placa y día natural en la municipalidad: sin ese límite, salirse y volver a entrar cada quince '
    'minutos sería parqueo gratis indefinido.';


-- ---------------------------------------------------------------------------------------------
-- 2. Las reglas propias de una zona.
--
-- Toda columna es NULA = heredar. No hay fila = la zona no se aparta en nada, que es el estado de
-- todas las zonas que existen hoy.
--
-- Lo que NO está aquí es tan deliberado como lo que sí. `extension_enabled`, `early_finish_enabled`,
-- el crédito por terminar antes y la tolerancia del fiscalizador siguen siendo de la municipalidad:
-- son cómo se comporta el producto y qué le promete al ciudadano, no palancas de rotación de una
-- zona. Una municipalidad donde una zona devuelve minutos y la de al lado no, sin que el ciudadano
-- pueda saberlo antes de parquear, es una promesa rota, no una configuración.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE parking_zone_policies (
    zone_id                      uuid        PRIMARY KEY REFERENCES parking_zones (id) ON DELETE CASCADE,
    tenant_id                    uuid        NOT NULL REFERENCES tenants (id),
    session_increments_minutes   varchar(200),
    session_min_minutes          integer,
    session_max_minutes          integer,
    extension_increments_minutes varchar(200),
    extension_max_total_minutes  integer,
    free_minutes                 integer,
    created_at                   timestamptz NOT NULL,
    updated_at                   timestamptz NOT NULL,
    version                      bigint      NOT NULL DEFAULT 0,
    CONSTRAINT ck_parking_zone_policies_session_min  CHECK (session_min_minutes IS NULL OR session_min_minutes > 0),
    CONSTRAINT ck_parking_zone_policies_session_max  CHECK (session_max_minutes IS NULL OR session_max_minutes > 0),
    CONSTRAINT ck_parking_zone_policies_window       CHECK (
        session_min_minutes IS NULL OR session_max_minutes IS NULL OR session_max_minutes >= session_min_minutes),
    CONSTRAINT ck_parking_zone_policies_extension    CHECK (
        extension_max_total_minutes IS NULL OR extension_max_total_minutes > 0),
    CONSTRAINT ck_parking_zone_policies_free_minutes CHECK (free_minutes IS NULL OR free_minutes >= 0)
);

COMMENT ON TABLE parking_zone_policies IS
    'En qué se aparta una zona de las reglas de su municipalidad. Nulo es heredar, no cero: cambiar el '
    'número de la municipalidad sigue moviendo a toda zona que no se haya apartado.';

CREATE INDEX ix_parking_zone_policies_tenant ON parking_zone_policies (tenant_id);


-- ---------------------------------------------------------------------------------------------
-- 3. El horario propio de una zona.
--
-- Aquí la herencia es por TABLA y no por columna, porque un horario no se hereda a medias: o la zona
-- tiene sus franjas o usa las de la municipalidad. Que exista la fila de encabezado es lo que dice
-- cuál de las dos cosas es.
--
-- Un encabezado con `charges_all_day = false` y NINGUNA franja es una zona que no cobra nunca: una
-- zona gratuita, que es configuración legítima y hasta hoy no se podía expresar. Se distingue de
-- «hereda» justamente porque la fila existe.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE parking_zone_schedules (
    zone_id         uuid        PRIMARY KEY REFERENCES parking_zones (id) ON DELETE CASCADE,
    tenant_id       uuid        NOT NULL REFERENCES tenants (id),
    charges_all_day boolean     NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL,
    updated_at      timestamptz NOT NULL,
    version         bigint      NOT NULL DEFAULT 0
);

COMMENT ON TABLE parking_zone_schedules IS
    'Que exista esta fila significa que la zona tiene horario propio. Sin fila hereda el de la '
    'municipalidad; con fila y sin franjas, es una zona que no cobra nunca.';

CREATE INDEX ix_parking_zone_schedules_tenant ON parking_zone_schedules (tenant_id);

CREATE TABLE parking_zone_schedule_slots (
    id           uuid        PRIMARY KEY,
    zone_id      uuid        NOT NULL REFERENCES parking_zone_schedules (zone_id) ON DELETE CASCADE,
    tenant_id    uuid        NOT NULL REFERENCES tenants (id),
    -- ISO-8601: 1 = lunes .. 7 = domingo, la misma numeración de java.time.DayOfWeek.
    weekday      smallint    NOT NULL,
    start_minute integer     NOT NULL,
    end_minute   integer     NOT NULL,
    created_at   timestamptz NOT NULL,
    CONSTRAINT ck_parking_zone_schedule_slots_weekday CHECK (weekday BETWEEN 1 AND 7),
    -- Igual que las de la municipalidad: una franja nunca cruza la medianoche; un horario nocturno
    -- son dos franjas, una por día, y así la aritmética de intersección se mantiene honesta.
    CONSTRAINT ck_parking_zone_schedule_slots_window CHECK (
        start_minute >= 0 AND end_minute <= 1440 AND end_minute > start_minute),
    CONSTRAINT uq_parking_zone_schedule_slots UNIQUE (zone_id, weekday, start_minute, end_minute)
);

CREATE INDEX ix_parking_zone_schedule_slots ON parking_zone_schedule_slots (zone_id, weekday, start_minute);


-- ---------------------------------------------------------------------------------------------
-- 4. Excepciones que se repiten solas.
--
-- Tres formas de decir cuándo cae una excepción:
--
--   ONCE   — una fecha concreta. Es lo único que existía y es lo que sigue significando toda fila
--            que ya está en la tabla.
--   ANNUAL — un día del año: el 15 de setiembre, todos los años. Dos números en vez de una fila por
--            año hasta 2045.
--   EASTER — un desplazamiento en días respecto al Domingo de Resurrección, que es como se definen
--            Jueves y Viernes Santo. No hay forma de escribirlos como día del año: se mueven.
--
-- `observance` es aparte de la regla a propósito. En Costa Rica varios feriados se trasladan al lunes
-- siguiente por ley, y esa es una decisión sobre CUÁNDO SE OBSERVA una fecha que ya sabemos calcular,
-- no sobre cómo se calcula. Separarlas deja que un país que no traslada nada use las mismas filas.
--
-- `holiday_code` recuerda de qué feriado del catálogo salió la fila, para que la pantalla pueda decir
-- «este ya lo tiene» y no ofrecerlo dos veces. Nulo en lo que la municipalidad escribió por su cuenta.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE parking_schedule_exceptions
    ADD COLUMN recurrence         varchar(8)  NOT NULL DEFAULT 'ONCE',
    ADD COLUMN month              smallint,
    ADD COLUMN day                smallint,
    ADD COLUMN easter_offset_days smallint,
    ADD COLUMN observance         varchar(8)  NOT NULL DEFAULT 'EXACT',
    ADD COLUMN holiday_code       varchar(48);

-- La fecha deja de ser obligatoria: sólo la lleva ONCE. Las otras dos la calculan por año.
ALTER TABLE parking_schedule_exceptions ALTER COLUMN exception_date DROP NOT NULL;

ALTER TABLE parking_schedule_exceptions ADD CONSTRAINT ck_parking_schedule_exceptions_recurrence
    CHECK (recurrence IN ('ONCE', 'ANNUAL', 'EASTER'));
ALTER TABLE parking_schedule_exceptions ADD CONSTRAINT ck_parking_schedule_exceptions_observance
    CHECK (observance IN ('EXACT', 'MONDAY'));
-- Cada forma exige exactamente sus propios datos. Sin esto, una fila ANNUAL sin mes sería una
-- excepción que no cae ningún día y que nadie descubriría hasta que un feriado se cobrara.
ALTER TABLE parking_schedule_exceptions ADD CONSTRAINT ck_parking_schedule_exceptions_shape CHECK (
    (recurrence = 'ONCE'   AND exception_date IS NOT NULL AND month IS NULL AND day IS NULL
                           AND easter_offset_days IS NULL)
 OR (recurrence = 'ANNUAL' AND month IS NOT NULL AND day IS NOT NULL AND easter_offset_days IS NULL)
 OR (recurrence = 'EASTER' AND easter_offset_days IS NOT NULL AND month IS NULL AND day IS NULL));
ALTER TABLE parking_schedule_exceptions ADD CONSTRAINT ck_parking_schedule_exceptions_month
    CHECK (month IS NULL OR month BETWEEN 1 AND 12);
ALTER TABLE parking_schedule_exceptions ADD CONSTRAINT ck_parking_schedule_exceptions_day
    CHECK (day IS NULL OR day BETWEEN 1 AND 31);
-- Un año litúrgico entero de margen a cada lado; más que eso no es un desplazamiento, es un error.
ALTER TABLE parking_schedule_exceptions ADD CONSTRAINT ck_parking_schedule_exceptions_easter
    CHECK (easter_offset_days IS NULL OR easter_offset_days BETWEEN -180 AND 180);

-- El índice único de fecha sólo puede hablar de las que tienen fecha.
ALTER TABLE parking_schedule_exceptions DROP CONSTRAINT uq_parking_schedule_exceptions;
CREATE UNIQUE INDEX uq_parking_schedule_exceptions_once
    ON parking_schedule_exceptions (tenant_id, exception_date) WHERE recurrence = 'ONCE';
CREATE UNIQUE INDEX uq_parking_schedule_exceptions_annual
    ON parking_schedule_exceptions (tenant_id, month, day) WHERE recurrence = 'ANNUAL';
CREATE UNIQUE INDEX uq_parking_schedule_exceptions_easter
    ON parking_schedule_exceptions (tenant_id, easter_offset_days) WHERE recurrence = 'EASTER';

COMMENT ON COLUMN parking_schedule_exceptions.recurrence IS
    'ONCE una fecha concreta; ANNUAL un día del año; EASTER un desplazamiento respecto al Domingo de '
    'Resurrección. La regla se guarda, no las fechas: expandir veinte años sería veinte copias de la '
    'misma decisión, y un cambio de ley obligaría a reescribir filas históricas.';
COMMENT ON COLUMN parking_schedule_exceptions.observance IS
    'EXACT se observa el día que cae; MONDAY se traslada al lunes siguiente, que es lo que hace la ley '
    'costarricense con varios feriados. Es una decisión sobre cuándo se observa una fecha que ya '
    'sabemos calcular, y por eso está aparte de la regla que la calcula.';


-- ---------------------------------------------------------------------------------------------
-- 5. El catálogo de feriados de un país.
--
-- Datos de referencia de la plataforma, como el catálogo de países y el de divisiones
-- administrativas: no pertenece a ninguna municipalidad, y un país nuevo es filas, no código.
--
-- El nombre va como texto y no como clave de traducción, por lo mismo que «Escazú» va como texto: el
-- nombre de un feriado es un nombre propio en el idioma del país, no una etiqueta que se traduce.
-- `code` es lo estable para quien algún día quiera traducirlo.
--
-- NO ES ASESORÍA LEGAL Y LA PANTALLA LO DICE. Es un punto de partida que la municipalidad confirma:
-- las leyes de feriados cambian, y quien responde por el calendario de cobro de un cantón es el
-- cantón. Por eso el catálogo se COPIA a las excepciones de la municipalidad en vez de leerse en
-- vivo: una vez copiadas son suyas, y editarlas o borrarlas no depende de que la plataforma se
-- ponga de acuerdo con ella.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE holiday_catalog (
    id                 uuid         PRIMARY KEY,
    country_code       char(2)      NOT NULL REFERENCES countries (code),
    code               varchar(48)  NOT NULL,
    name               varchar(160) NOT NULL,
    kind               varchar(8)   NOT NULL,
    month              smallint,
    day                smallint,
    easter_offset_days smallint,
    observance         varchar(8)   NOT NULL DEFAULT 'EXACT',
    sort_order         integer      NOT NULL DEFAULT 0,
    active             boolean      NOT NULL DEFAULT true,
    CONSTRAINT uq_holiday_catalog UNIQUE (country_code, code),
    CONSTRAINT ck_holiday_catalog_kind       CHECK (kind IN ('FIXED', 'EASTER')),
    CONSTRAINT ck_holiday_catalog_observance CHECK (observance IN ('EXACT', 'MONDAY')),
    CONSTRAINT ck_holiday_catalog_shape CHECK (
        (kind = 'FIXED'  AND month IS NOT NULL AND day IS NOT NULL AND easter_offset_days IS NULL)
     OR (kind = 'EASTER' AND easter_offset_days IS NOT NULL AND month IS NULL AND day IS NULL)),
    CONSTRAINT ck_holiday_catalog_month CHECK (month IS NULL OR month BETWEEN 1 AND 12),
    CONSTRAINT ck_holiday_catalog_day   CHECK (day IS NULL OR day BETWEEN 1 AND 31)
);

COMMENT ON TABLE holiday_catalog IS
    'Feriados de cada país, como regla de repetición. Punto de partida que la municipalidad confirma y '
    'copia a sus propias excepciones: la ley de feriados cambia y quien responde por el calendario de '
    'cobro de un cantón es el cantón.';

CREATE INDEX ix_holiday_catalog_country ON holiday_catalog (country_code, sort_order);

-- Costa Rica. Los trasladables van marcados MONDAY porque así los mueve la ley vigente; si eso
-- cambia, cambia una fila y no una línea de código — y de todos modos la municipalidad puede editar
-- la excepción una vez copiada.
INSERT INTO holiday_catalog (id, country_code, code, name, kind, month, day, easter_offset_days,
                             observance, sort_order, active)
VALUES
    (gen_random_uuid(), 'CR', 'CR_ANO_NUEVO',      'Año Nuevo',                       'FIXED',   1,  1, NULL, 'EXACT',  10, true),
    -- Jueves y Viernes Santo se mueven con la Pascua: no hay día del año que los describa.
    (gen_random_uuid(), 'CR', 'CR_JUEVES_SANTO',   'Jueves Santo',                    'EASTER', NULL, NULL, -3, 'EXACT',  20, true),
    (gen_random_uuid(), 'CR', 'CR_VIERNES_SANTO',  'Viernes Santo',                   'EASTER', NULL, NULL, -2, 'EXACT',  30, true),
    (gen_random_uuid(), 'CR', 'CR_JUAN_SANTAMARIA','Día de Juan Santamaría',          'FIXED',   4, 11, NULL, 'MONDAY', 40, true),
    (gen_random_uuid(), 'CR', 'CR_DIA_TRABAJO',    'Día Internacional del Trabajo',   'FIXED',   5,  1, NULL, 'EXACT',  50, true),
    (gen_random_uuid(), 'CR', 'CR_ANEXION_NICOYA', 'Anexión del Partido de Nicoya',   'FIXED',   7, 25, NULL, 'MONDAY', 60, true),
    (gen_random_uuid(), 'CR', 'CR_VIRGEN_ANGELES', 'Virgen de los Ángeles',           'FIXED',   8,  2, NULL, 'EXACT',  70, true),
    (gen_random_uuid(), 'CR', 'CR_DIA_MADRE',      'Día de la Madre',                 'FIXED',   8, 15, NULL, 'MONDAY', 80, true),
    (gen_random_uuid(), 'CR', 'CR_CULTURA_AFRO',   'Día de la Persona Negra y la Cultura Afrocostarricense',
                                                                                      'FIXED',   8, 31, NULL, 'MONDAY', 90, true),
    (gen_random_uuid(), 'CR', 'CR_INDEPENDENCIA',  'Día de la Independencia',         'FIXED',   9, 15, NULL, 'EXACT', 100, true),
    (gen_random_uuid(), 'CR', 'CR_ABOLICION',      'Día de la Abolición del Ejército','FIXED',  12,  1, NULL, 'MONDAY', 110, true),
    (gen_random_uuid(), 'CR', 'CR_NAVIDAD',        'Navidad',                         'FIXED',  12, 25, NULL, 'EXACT', 120, true);


-- ---------------------------------------------------------------------------------------------
-- 6. La estadía de cortesía queda marcada en la sesión.
--
-- En la sesión y no en una tabla aparte, porque «esta placa ya usó su cortesía hoy» es una pregunta
-- sobre las estadías que ya existen y no un hecho nuevo que haya que registrar en otro lado.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE parking_sessions ADD COLUMN courtesy boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN parking_sessions.courtesy IS
    'Esta estadía se otorgó como cortesía y no se cobró. Una por placa y día natural en la zona horaria '
    'de la municipalidad: es lo que evita que salirse y volver a entrar sea parqueo gratis indefinido.';

-- La pregunta exacta que hace el inicio de una sesión: esta placa, esta municipalidad, cortesías de
-- hoy. Parcial porque las de cortesía son una fracción diminuta de la tabla más grande del dominio.
CREATE INDEX ix_parking_sessions_courtesy
    ON parking_sessions (tenant_id, plate_snapshot, started_at) WHERE courtesy;
