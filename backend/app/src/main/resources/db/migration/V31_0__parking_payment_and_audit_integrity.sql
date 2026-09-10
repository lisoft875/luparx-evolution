-- =============================================================================================
-- V31_0 — El registro de estacionamiento apunta al pago, y la auditoría deja de poder borrarse en
-- silencio (CONTRACT.md v0.32).
--
-- Dos puntos del producto que se resuelven en la misma migración porque los dos son sobre lo mismo:
-- que lo que pasó quede escrito de una manera que se pueda enseñar.
--
--   7. REGISTRO DE ESTACIONAMIENTO. La estadía ya guardaba placa, zona, inicio, fin y monto. Le
--      faltaban las dos cosas que la unen con la plata: si se pagó, y con cuál movimiento. Sin eso,
--      «fiscalización consulta el mismo origen de datos que genera el pago» era una aspiración: la
--      consulta contestaba si había estadía vigente, no si estaba pagada.
--
--   8. AUDITORÍA. Faltaban el valor anterior y el nuevo —había un `metadata` libre donde cada
--      llamador ponía lo que le pareciera— y, sobre todo, faltaba que la traza no se pudiera borrar.
--      El comentario de V1_0 decía «append-only», pero era una promesa de la aplicación: cualquiera
--      con una consola podía borrar una fila y nadie se enteraba.
-- =============================================================================================


-- ---------------------------------------------------------------------------------------------
-- 1. La estadía apunta al pago.
--
-- `payment_status` es sobre el DINERO y es distinto de `status`, que es sobre la ESTADÍA. Una estadía
-- puede estar vigente y no haberse cobrado —cortesía, minutos a favor, fuera de horario— y una
-- terminada hace un mes sigue estando pagada. Mezclarlos en una columna es lo que obliga después a
-- deducir el cobro a partir del monto, que es exactamente lo que no se debe hacer con plata.
--
-- `no_charge_reason` existe porque «no se cobró» sin motivo es lo que hace que un funcionario en la
-- calle no sepa qué decirle al ciudadano que reclama. Son tres motivos distintos y ninguno es una
-- falta de pago.
--
-- PENDING y FAILED no ocurren hoy: la billetera es de prepago y el cobro pasa en la misma transacción
-- que la estadía, así que un fallo la deshace entera. Están en el CHECK porque el día que entre un
-- proveedor asíncrono —tarjeta, SINPE— eso es un estado real, y descubrirlo entonces sería cambiar el
-- esquema de la tabla más grande del dominio con datos vivos adentro.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE parking_sessions
    ADD COLUMN payment_status         varchar(16),
    ADD COLUMN no_charge_reason       varchar(24),
    ADD COLUMN payment_transaction_id uuid REFERENCES wallet_transactions (id);

COMMENT ON COLUMN parking_sessions.payment_status IS
    'Sobre el DINERO, no sobre la estadía: PAID, NO_CHARGE, PENDING o FAILED. `status` dice si la '
    'estadía corre; ésta dice si se cobró. Deducir el cobro del monto es lo que no se debe hacer.';
COMMENT ON COLUMN parking_sessions.no_charge_reason IS
    'Por qué no se cobró: COURTESY, CREDIT u OUTSIDE_HOURS. Ninguno es una falta de pago, y sin el '
    'motivo el funcionario en la calle no tiene qué contestarle al ciudadano que reclama.';
COMMENT ON COLUMN parking_sessions.payment_transaction_id IS
    'El PRIMER movimiento de billetera que cobró algo por esta estadía —normalmente el del inicio, y '
    'el de la primera extensión cuando el inicio fue de cortesía—. Cada extensión lleva además el '
    'suyo en su propia fila: una sola columna aquí para todos los cobros sería una media verdad.';

-- Lo que ya existe se reconstruye de lo que se puede saber, y de nada más.
UPDATE parking_sessions SET payment_status = CASE WHEN amount_minor > 0 THEN 'PAID' ELSE 'NO_CHARGE' END
 WHERE payment_status IS NULL;

-- El motivo sí se puede reconstruir en dos de los tres casos. El tercero —fuera de horario— no se
-- puede distinguir de aquí, y se deja NULO en vez de adivinarlo: una fila que dice «no sé» es
-- honesta, una que dice el motivo equivocado se lee como un hecho.
UPDATE parking_sessions SET no_charge_reason = 'COURTESY'
 WHERE payment_status = 'NO_CHARGE' AND courtesy;
UPDATE parking_sessions SET no_charge_reason = 'CREDIT'
 WHERE payment_status = 'NO_CHARGE' AND NOT courtesy AND credit_minutes_applied > 0;

-- El movimiento del cobro inicial sí se puede recuperar: la billetera ya apuntaba a la sesión.
UPDATE parking_sessions s
   SET payment_transaction_id = t.id
  FROM wallet_transactions t
 WHERE t.session_id = s.id
   AND t.type = 'SESSION_CHARGE'
   AND s.payment_transaction_id IS NULL;

ALTER TABLE parking_sessions ALTER COLUMN payment_status SET NOT NULL;
ALTER TABLE parking_sessions ADD CONSTRAINT ck_parking_sessions_payment_status
    CHECK (payment_status IN ('PAID', 'NO_CHARGE', 'PENDING', 'FAILED'));
ALTER TABLE parking_sessions ADD CONSTRAINT ck_parking_sessions_no_charge_reason
    CHECK (no_charge_reason IS NULL OR no_charge_reason IN ('COURTESY', 'CREDIT', 'OUTSIDE_HOURS'));
-- Un motivo de no cobro sobre una estadía cobrada es una contradicción, y las contradicciones que la
-- base admite terminan en una pantalla contándole al ciudadano dos cosas distintas.
ALTER TABLE parking_sessions ADD CONSTRAINT ck_parking_sessions_no_charge_coherent
    CHECK (payment_status = 'NO_CHARGE' OR no_charge_reason IS NULL);
ALTER TABLE parking_sessions ADD CONSTRAINT ck_parking_sessions_paid_has_amount
    CHECK (payment_status <> 'PAID' OR amount_minor > 0);

CREATE INDEX ix_parking_sessions_payment ON parking_sessions (tenant_id, payment_status, started_at DESC);


ALTER TABLE parking_session_extensions
    ADD COLUMN payment_transaction_id uuid REFERENCES wallet_transactions (id);

-- Se emparejan por la clave de idempotencia, que las dos filas ya llevaban. Lo que no calce se queda
-- nulo: inventar un enlace en un registro de plata es peor que no tenerlo.
UPDATE parking_session_extensions e
   SET payment_transaction_id = t.id
  FROM wallet_transactions t
 WHERE t.session_id = e.session_id
   AND t.type = 'EXTENSION_CHARGE'
   AND t.idempotency_key IS NOT NULL
   AND t.idempotency_key = e.idempotency_key
   AND e.payment_transaction_id IS NULL;


-- ---------------------------------------------------------------------------------------------
-- 2. El valor anterior y el valor nuevo.
--
-- Como arreglo JSON de {field, old, new} y no como tabla hija: una entrada de auditoría se lee
-- entera o no se lee, y partirla en dos tablas obliga a una unión en la única pantalla que la usa —
-- y a que el sello de más abajo abarque las dos.
--
-- Sólo lo que CAMBIÓ. Guardar la fila entera antes y después duplica datos personales que nadie
-- tocó, en una tabla que no se borra nunca, y obliga a quien audita a comparar dos fotografías para
-- encontrar el campo que importa.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE audit_events ADD COLUMN changes jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN audit_events.changes IS
    'Arreglo de {field, old, new} con ÚNICAMENTE los campos que cambiaron. Los identificadores '
    'personales van enmascarados (a***@x.com): que cambió el correo es lo auditable, cuál era no.';


-- ---------------------------------------------------------------------------------------------
-- 3. Sellos encadenados sobre la auditoría.
--
-- El disparador de más abajo impide borrar. Esto hace que borrar se pueda DEMOSTRAR, que no es lo
-- mismo: un superusuario de PostgreSQL puede desactivar un disparador, y entonces lo único que queda
-- es que las cuentas no cuadren y cualquiera lo pueda comprobar.
--
-- Un sello cubre un rango de tiempo de una municipalidad y lleva el resumen de sus filas más el
-- resumen del sello anterior. Borrar, cambiar o insertar una fila dentro de un rango ya sellado
-- cambia el resumen del rango, y como cada sello encadena al anterior, no se puede arreglar
-- recalculando uno solo: habría que rehacer la cadena entera desde ahí, y el ente contralor tiene su
-- propia copia de los sellos que le entregaron antes.
--
-- SE SELLA EN UNA TABLA APARTE, y ésa es la decisión que hace que todo lo demás funcione: si el
-- resumen viviera en una columna de `audit_events`, sellar sería un UPDATE sobre `audit_events` — y
-- entonces el disparador no podría prohibir el UPDATE, que es justo lo que hay que prohibir.
--
-- La cadena es POR MUNICIPALIDAD porque es por municipalidad que se audita: a un cantón le entregan
-- su cadena y la verifica sin ver la de nadie más. Las acciones de plataforma (tenant_id nulo) tienen
-- la suya, con una llave centinela, porque un nulo no sirve de clave de cadena.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE audit_seals (
    id           uuid        PRIMARY KEY,
    -- El tenant, o la centinela de todo-ceros para lo que no tiene municipalidad.
    tenant_key   uuid        NOT NULL,
    -- Consecutivo dentro de la cadena de esa municipalidad. Un hueco es, por sí solo, una señal.
    seq          bigint      NOT NULL,
    covers_from  timestamptz NOT NULL,
    covers_to    timestamptz NOT NULL,
    row_count    integer     NOT NULL,
    digest       char(64)    NOT NULL,
    -- El resumen del sello anterior de esta cadena. Nulo sólo en el primero.
    prev_digest  char(64),
    created_at   timestamptz NOT NULL,
    CONSTRAINT uq_audit_seals_seq UNIQUE (tenant_key, seq),
    CONSTRAINT ck_audit_seals_window CHECK (covers_to > covers_from),
    CONSTRAINT ck_audit_seals_rows CHECK (row_count >= 0)
);

COMMENT ON TABLE audit_seals IS
    'Cadena de sellos sobre audit_events, una por municipalidad. No impide borrar —eso lo hace el '
    'disparador— sino que lo hace demostrable, que es lo que un ente contralor puede verificar solo.';

CREATE INDEX ix_audit_seals_chain ON audit_seals (tenant_key, seq DESC);


-- ---------------------------------------------------------------------------------------------
-- 4. Las tablas de sólo anexado dejan de serlo por promesa y pasan a serlo por candado.
--
-- V1_0 dice «Append-only audit trail. Never updated or deleted by the application». Era cierto y era
-- insuficiente: describía lo que la aplicación hace, no lo que la base permite. Cualquiera con
-- acceso a una consola —y un administrador de municipalidad con una integración lo tiene— podía
-- borrar la fila que lo incriminaba y no quedaba nada.
--
-- Se protege también el libro de la billetera y el historial de una boleta, por la misma razón y con
-- el mismo disparador: son los otros dos registros donde borrar una fila cambia lo que pasó.
--
-- `enforcement_checks` NO lleva disparador a propósito: tiene una política de retención que lo
-- depura (v0.29, ADR 0013), y prohibir el DELETE ahí rompería el trabajo que cumple esa política. Que
-- una tabla se pueda depurar y otra no es una decisión distinta para cada una, no un descuido.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION luparx_refuse_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION
        'La tabla % es de solo anexado: no admite % (CONTRACT.md v0.32). Un error se corrige '
        'agregando una fila que lo diga, nunca cambiando la que ya esta.',
        TG_TABLE_NAME, TG_OP
        USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION luparx_refuse_mutation() IS
    'Rechaza UPDATE, DELETE y TRUNCATE. El mensaje dice qué hacer en su lugar, porque quien se topa '
    'con esto casi siempre está tratando de arreglar algo de buena fe.';

CREATE TRIGGER trg_audit_events_immutable
    BEFORE UPDATE OR DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION luparx_refuse_mutation();
-- TRUNCATE no dispara por fila, así que necesita el suyo — y es justamente la forma rápida de vaciar
-- una tabla entera, o sea la que más importa cerrar.
CREATE TRIGGER trg_audit_events_no_truncate
    BEFORE TRUNCATE ON audit_events
    FOR EACH STATEMENT EXECUTE FUNCTION luparx_refuse_mutation();

CREATE TRIGGER trg_audit_seals_immutable
    BEFORE UPDATE OR DELETE ON audit_seals
    FOR EACH ROW EXECUTE FUNCTION luparx_refuse_mutation();
CREATE TRIGGER trg_audit_seals_no_truncate
    BEFORE TRUNCATE ON audit_seals
    FOR EACH STATEMENT EXECUTE FUNCTION luparx_refuse_mutation();

CREATE TRIGGER trg_wallet_transactions_immutable
    BEFORE UPDATE OR DELETE ON wallet_transactions
    FOR EACH ROW EXECUTE FUNCTION luparx_refuse_mutation();
CREATE TRIGGER trg_wallet_transactions_no_truncate
    BEFORE TRUNCATE ON wallet_transactions
    FOR EACH STATEMENT EXECUTE FUNCTION luparx_refuse_mutation();

CREATE TRIGGER trg_citation_events_immutable
    BEFORE UPDATE OR DELETE ON citation_events
    FOR EACH ROW EXECUTE FUNCTION luparx_refuse_mutation();
CREATE TRIGGER trg_citation_events_no_truncate
    BEFORE TRUNCATE ON citation_events
    FOR EACH STATEMENT EXECUTE FUNCTION luparx_refuse_mutation();
