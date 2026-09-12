-- =============================================================================================
-- V33_0 — Conciliación de pagos: Payment y Settlement (CONTRACT.md v0.35).
--
-- Punto 10 de la lista: «Separar claramente ParkingSession → Payment → Transaction →
-- Settlement/Reconciliation. LUPARX necesita poder demostrar qué se cobró, qué confirmó la
-- pasarela/banco y qué corresponde a la Municipalidad.»
--
-- De esa cadena existían dos eslabones: la estadía (V11_0) y el movimiento de billetera
-- (`wallet_transactions`, V11_0, apéndice puro con el signo atado al tipo por CHECK). Desde la v0.32
-- la estadía apunta a su movimiento. Faltaban los dos extremos, y son justo los dos que miran hacia
-- afuera de la plataforma:
--
--   * PAYMENT — el intento de mover plata de verdad. Hoy `wallet_transactions` tiene
--     `source` y `external_reference`, que es un muñón de esto: no hay intento, no hay estado, no
--     hay comisión, no hay fallo, no hay reintento. Un cobro que falló no deja rastro en ninguna
--     parte, y «qué se cobró» no se puede contestar con una tabla donde sólo están los que salieron
--     bien.
--
--   * SETTLEMENT — lo que el proveedor dice que liquidó y el banco depositó. Sin esto, «qué
--     confirmó la pasarela» es una hoja de cálculo que alguien cuadra a mano una vez al mes.
--
-- Decisión de negocio de Javier (2026-09-10): el ingreso de la municipalidad se reconoce AL
-- RECARGAR, y cada municipalidad recauda en su propia cuenta —LupaRX concilia y demuestra, nunca
-- tiene la plata. Por eso no hay aquí liquidaciones salientes ni comisiones de plataforma: el
-- Settlement es del proveedor HACIA la municipalidad.
--
-- El saldo sin consumir se sigue pudiendo calcular del libro de billetera, que no se toca. Es
-- barato dejarlo así y significa que si algún día un auditor pregunta por el otro momento —cuánto de
-- lo recaudado todavía no se ha prestado como servicio— la respuesta existe en los datos en vez de
-- tener que reconstruirse.
-- =============================================================================================


-- ---------------------------------------------------------------------------------------------
-- 1. Payment: cada peso que entra, con su intento.
--
-- Una fila por INTENTO y no por éxito. Un pago que falló es exactamente lo que hay que poder
-- enseñar cuando el ciudadano dice «yo pagué» y el saldo no subió, y una tabla donde sólo están los
-- que salieron bien no contesta esa pregunta —convierte un problema del banco en una discusión
-- sobre la palabra de la municipalidad contra la del ciudadano.
--
-- La caja municipal y el socio también pasan por aquí, no sólo la tarjeta. Si el modelo de pagos
-- sólo cubriera la pasarela, la mitad del dinero de una municipalidad pequeña quedaría fuera del
-- único lugar donde se puede demostrar qué entró.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE payments (
    id                     uuid         PRIMARY KEY,
    tenant_id              uuid         NOT NULL REFERENCES tenants (id),
    -- Quién pagó. Nullable: una recarga de caja puede acreditarse contra una cuenta cuyo dueño
    -- todavía no se resolvió, y un ajuste no lo paga nadie.
    user_id                uuid         REFERENCES users (id),

    method                 varchar(24)  NOT NULL,
    -- Quién procesó: el nombre del proveedor, o de la caja. Texto y no catálogo, por la misma razón
    -- que en V32_0: obligar a dar de alta un proveedor antes de poder recibir plata es configuración
    -- faltante bloqueando dinero.
    provider               varchar(64),
    -- La referencia del proveedor. Es la llave del cotejo con la liquidación y la de la
    -- idempotencia: el mismo valor dos veces es el mismo pago.
    provider_reference     varchar(120),
    -- La nuestra, para que el cliente pueda reintentar sin duplicar aun antes de que el proveedor
    -- haya asignado la suya.
    idempotency_key        varchar(200),

    status                 varchar(24)  NOT NULL,
    -- Por qué falló, en el vocabulario del proveedor. Se guarda tal cual: traducirlo es perder
    -- justo el dato con el que se reclama.
    failure_code           varchar(64),
    failure_reason         varchar(500),

    -- BRUTO: lo que el ciudadano pagó. Es el número que él ve en su estado de cuenta y el único
    -- que puede citar, así que es el que manda.
    gross_amount_minor     bigint       NOT NULL,
    -- COMISIÓN del proveedor. Nullable porque muchos canales no cobran ninguna (la caja no) y
    -- porque en tarjeta suele conocerse hasta la liquidación, no al cobrar.
    fee_amount_minor       bigint,
    -- NETO: lo que efectivamente llega a la cuenta de la municipalidad. Se guarda en vez de
    -- calcularse porque el proveedor lo redondea a su manera, y un neto calculado que difiera del
    -- depositado por un colón convierte cada conciliación en una investigación.
    net_amount_minor       bigint,
    currency_code          varchar(3)   NOT NULL,

    -- Para qué era. Hoy sólo recarga; las multas y los permisos entran por aquí sin migrar nada.
    purpose                varchar(24)  NOT NULL,
    -- Contra qué se aplicó, cuando se aplicó. Sin FK a propósito: es una referencia a otro contexto
    -- (billetera hoy, boletas mañana) y una llave foránea aquí ataría este módulo a los demás,
    -- que es justo lo que module-billing existe para no hacer.
    target_type            varchar(24),
    target_id              uuid,

    requested_at           timestamptz  NOT NULL,
    -- Cuándo el proveedor lo dio por bueno. Distinto de `requested_at` y guardado aparte: la
    -- diferencia entre los dos es lo que se mira cuando un ciudadano reclama que pagó ayer.
    confirmed_at           timestamptz,
    -- Cuándo se recibió de verdad la plata, según la liquidación. Lo escribe la conciliación.
    settled_at             timestamptz,

    reconciliation_status  varchar(24)  NOT NULL DEFAULT 'PENDING',
    settlement_line_id     uuid,

    created_by             uuid         REFERENCES users (id),
    created_at             timestamptz  NOT NULL,
    updated_at             timestamptz  NOT NULL,
    version                bigint       NOT NULL DEFAULT 0,

    CONSTRAINT ck_payments_method CHECK (method IN (
        'CARD', 'SINPE', 'BANK_TRANSFER', 'COUNTER_CASH', 'PARTNER', 'ADJUSTMENT')),
    CONSTRAINT ck_payments_status CHECK (status IN (
        'PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'REFUNDED', 'CHARGED_BACK')),
    CONSTRAINT ck_payments_purpose CHECK (purpose IN ('WALLET_TOPUP', 'FINE', 'PERMIT', 'OTHER')),
    CONSTRAINT ck_payments_reconciliation CHECK (reconciliation_status IN (
        'PENDING', 'MATCHED', 'MISSING_IN_SETTLEMENT', 'AMOUNT_MISMATCH', 'NOT_APPLICABLE')),
    CONSTRAINT ck_payments_gross CHECK (gross_amount_minor > 0),
    CONSTRAINT ck_payments_fee CHECK (fee_amount_minor IS NULL OR fee_amount_minor >= 0),
    -- El neto no puede ser mayor que el bruto. Una comisión negativa disfrazada de neto alto es la
    -- forma silenciosa de que una conciliación cuadre mintiendo.
    CONSTRAINT ck_payments_net CHECK (net_amount_minor IS NULL OR net_amount_minor <= gross_amount_minor),
    -- Un pago cobrado sin momento de confirmación no se puede cotejar contra nada, y uno fallido con
    -- momento de confirmación es una contradicción. La base lo dice porque la validación de
    -- aplicación es necesaria y nunca suficiente.
    CONSTRAINT ck_payments_captured_confirmed CHECK (
        status <> 'CAPTURED' OR confirmed_at IS NOT NULL),
    CONSTRAINT ck_payments_failed_not_confirmed CHECK (
        status NOT IN ('FAILED', 'CANCELLED') OR confirmed_at IS NULL),
    -- Sólo un pago cobrado puede figurar conciliado: cuadrar contra la liquidación algo que nunca
    -- se cobró es exactamente el error que esta tabla existe para hacer imposible.
    CONSTRAINT ck_payments_reconciled_captured CHECK (
        reconciliation_status NOT IN ('MATCHED', 'AMOUNT_MISMATCH') OR status = 'CAPTURED')
);

-- Idempotencia donde tiene que estar con varias instancias: en la base. Parcial porque un pago de
-- caja puede no traer referencia de proveedor.
CREATE UNIQUE INDEX uq_payments_provider_reference
    ON payments (tenant_id, provider, provider_reference)
    WHERE provider_reference IS NOT NULL;
CREATE UNIQUE INDEX uq_payments_idempotency
    ON payments (tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Las tres consultas reales: el estado de cuenta del ciudadano, el corte del tesorero por período,
-- y —la que importa— «qué se cobró y todavía nadie liquidó».
CREATE INDEX ix_payments_user ON payments (tenant_id, user_id, requested_at DESC);
CREATE INDEX ix_payments_period ON payments (tenant_id, confirmed_at DESC) WHERE status = 'CAPTURED';
CREATE INDEX ix_payments_unreconciled ON payments (tenant_id, confirmed_at)
    WHERE status = 'CAPTURED' AND reconciliation_status IN ('PENDING', 'MISSING_IN_SETTLEMENT');

COMMENT ON TABLE payments IS
    'Un intento de recibir plata, salga bien o mal. Los fallidos se guardan a propósito: son la '
    'única forma de contestar «yo pagué y no me subió el saldo» sin que sea la palabra de uno '
    'contra la del otro.';
COMMENT ON COLUMN payments.gross_amount_minor IS
    'Lo que pagó el ciudadano. Es el número que él ve en su estado de cuenta y el único que puede '
    'citar, así que es el que manda sobre el neto y la comisión.';
COMMENT ON COLUMN payments.target_id IS
    'A qué se aplicó (hoy un movimiento de billetera). Sin llave foránea a propósito: apunta a otro '
    'contexto, y una FK aquí ataría module-billing a los módulos que debe poder sobrevivir.';


-- ---------------------------------------------------------------------------------------------
-- 2. El movimiento apunta a su pago.
--
-- Cierra la cadena en los dos sentidos: de la estadía al movimiento (v0.32) y del movimiento al
-- pago. Nullable para siempre: un cargo por estacionar NO tiene pago —es plata que ya estaba en la
-- billetera— y exigirlo obligaría a inventar pagos falsos para cuadrar una columna.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE wallet_transactions ADD COLUMN payment_id uuid REFERENCES payments (id);

CREATE INDEX ix_wallet_transactions_payment ON wallet_transactions (payment_id)
    WHERE payment_id IS NOT NULL;

COMMENT ON COLUMN wallet_transactions.payment_id IS
    'El pago que produjo este movimiento, cuando entró plata de afuera. Nulo en un cargo por '
    'estacionar: eso gasta saldo que ya estaba, no recibe nada.';

-- ---------------------------------------------------------------------------------------------
-- 2.b El único UPDATE que `wallet_transactions` va a admitir jamás.
--
-- La v0.32 declaró esta tabla de solo anexado con `trg_wallet_transactions_immutable`, y tenía toda
-- la razón: es el libro de la billetera, y una fila cambiada ahí cambia cuánta plata dice la
-- plataforma que alguien tuvo. Pero la columna de arriba nace vacía y hay que llenarla — en el
-- relleno de abajo para lo que ya existe, y en cada recarga nueva, donde el pago se abre antes de
-- que el movimiento exista. Con el disparador general, las dos cosas fallan con 42501: el relleno
-- rompe esta migración y la recarga rompe el flujo del ciudadano la primera vez que alguien recargue.
--
-- Se podría apagar el disparador durante el relleno y volverlo a encender. No alcanza: eso arregla
-- la migración y deja rota la recarga, así que la aplicación quedaría dependiendo de que nadie
-- toque la tabla — una promesa, en vez de una garantía.
--
-- Así que la regla se estrecha en vez de apagarse. Se permite exactamente una mutación: **llenar
-- `payment_id` cuando estaba nulo, sin tocar ninguna otra columna**. Eso no es cambiar lo que pasó,
-- es terminar de escribirlo. Sigue prohibido volverlo a nulo, cambiar uno ya puesto, y mover el
-- monto, el saldo o la fecha — que es lo que el disparador existía para impedir. La comparación es
-- de la fila entera y no de una lista de columnas, así que una columna que se agregue el año que
-- viene queda protegida sin que nadie se acuerde de venir a agregarla aquí.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION luparx_refuse_wallet_mutation() RETURNS trigger AS $$
DECLARE
    candidate wallet_transactions%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.payment_id IS NULL AND NEW.payment_id IS NOT NULL THEN
            -- La fila nueva con el puntero devuelto a nulo tiene que ser idéntica a la vieja. Si
            -- cambió cualquier otra cosa, esto no es «llenar el espacio en blanco».
            candidate := NEW;
            candidate.payment_id := NULL;
            IF candidate IS NOT DISTINCT FROM OLD THEN
                RETURN NEW;
            END IF;
        END IF;
    END IF;
    RAISE EXCEPTION
        'La tabla % es de solo anexado: no admite % (CONTRACT.md v0.32). Lo único que se puede '
        'completar despues es payment_id cuando estaba nulo, sin tocar nada mas. Un error se '
        'corrige agregando una fila que lo diga, nunca cambiando la que ya esta.',
        TG_TABLE_NAME, TG_OP
        USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION luparx_refuse_wallet_mutation() IS
    'Como luparx_refuse_mutation, pero deja completar payment_id una sola vez y nada mas. El resto '
    'de las tablas de solo anexado siguen con la funcion general, que no admite ninguna excepcion.';

DROP TRIGGER trg_wallet_transactions_immutable ON wallet_transactions;
CREATE TRIGGER trg_wallet_transactions_immutable
    BEFORE UPDATE OR DELETE ON wallet_transactions
    FOR EACH ROW EXECUTE FUNCTION luparx_refuse_wallet_mutation();
-- El de TRUNCATE se queda con la función general: vaciar la tabla entera no tiene excepción posible.


-- ---------------------------------------------------------------------------------------------
-- 3. Settlement: lo que el proveedor dice que liquidó.
--
-- Es un documento de un tercero, así que se guarda como llegó y no se corrige. Si sus totales no
-- cuadran con la suma de sus propias líneas, eso es un hallazgo sobre el proveedor —y taparlo
-- recalculando el encabezado sería borrar la única evidencia de que mandó algo mal.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE settlements (
    id                    uuid         PRIMARY KEY,
    tenant_id             uuid         NOT NULL REFERENCES tenants (id),
    provider              varchar(64)  NOT NULL,
    -- La referencia del lote en el sistema del proveedor. Con el tenant, la identidad del documento.
    external_reference    varchar(120) NOT NULL,

    period_start          timestamptz  NOT NULL,
    period_end            timestamptz  NOT NULL,
    -- Totales COMO LOS DECLARÓ el proveedor. No se recalculan.
    declared_gross_minor  bigint       NOT NULL,
    declared_fee_minor    bigint       NOT NULL,
    declared_net_minor    bigint       NOT NULL,
    currency_code         varchar(3)   NOT NULL,

    -- El depósito: cuándo y con cuál referencia bancaria. Es el último eslabón, el que convierte
    -- «el proveedor dice que liquidó» en «la municipalidad recibió».
    deposit_expected_on   date,
    deposit_reference     varchar(120),

    status                varchar(24)  NOT NULL,
    imported_at           timestamptz  NOT NULL,
    imported_by           uuid         REFERENCES users (id),
    reconciled_at         timestamptz,
    created_at            timestamptz  NOT NULL,
    updated_at            timestamptz  NOT NULL,
    version               bigint       NOT NULL DEFAULT 0,

    CONSTRAINT ck_settlements_status CHECK (status IN ('IMPORTED', 'RECONCILED', 'DISPUTED')),
    CONSTRAINT ck_settlements_period CHECK (period_end > period_start),
    CONSTRAINT ck_settlements_amounts CHECK (
        declared_gross_minor >= 0 AND declared_fee_minor >= 0 AND declared_net_minor >= 0)
);

CREATE UNIQUE INDEX uq_settlements_reference
    ON settlements (tenant_id, provider, external_reference);
CREATE INDEX ix_settlements_period ON settlements (tenant_id, period_end DESC);

COMMENT ON TABLE settlements IS
    'El corte de un proveedor hacia la municipalidad. Documento de un tercero: se guarda como llegó '
    'y sus totales no se recalculan — que no cuadren con sus propias líneas es un hallazgo.';


-- ---------------------------------------------------------------------------------------------
-- 4. Las líneas del corte, y a qué pago corresponde cada una.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE settlement_lines (
    id                  uuid         PRIMARY KEY,
    tenant_id           uuid         NOT NULL REFERENCES tenants (id),
    settlement_id       uuid         NOT NULL REFERENCES settlements (id),
    -- La referencia del pago SEGÚN el proveedor. Por aquí se cotejan.
    provider_reference  varchar(120) NOT NULL,
    gross_amount_minor  bigint       NOT NULL,
    fee_amount_minor    bigint       NOT NULL,
    net_amount_minor    bigint       NOT NULL,
    currency_code       varchar(3)   NOT NULL,
    occurred_at         timestamptz,

    -- El pago nuestro con el que casó, cuando casó.
    payment_id          uuid         REFERENCES payments (id),
    match_status        varchar(24)  NOT NULL,
    created_at          timestamptz  NOT NULL,

    CONSTRAINT ck_settlement_lines_match CHECK (match_status IN (
        'MATCHED', 'UNKNOWN_PAYMENT', 'AMOUNT_MISMATCH', 'DUPLICATE')),
    -- Una línea casada sin pago, o un pago en una línea que dice no haber casado: las dos son
    -- formas de que un reporte diga que todo cuadra sin que cuadre.
    CONSTRAINT ck_settlement_lines_matched_has_payment CHECK (
        (match_status IN ('MATCHED', 'AMOUNT_MISMATCH')) = (payment_id IS NOT NULL))
);

-- Una referencia del proveedor aparece una sola vez por corte. Dos veces es el duplicado que la
-- conciliación tiene que poder nombrar, y por eso se marca en vez de rechazarse al importar.
CREATE INDEX ix_settlement_lines_settlement ON settlement_lines (settlement_id, provider_reference);
CREATE INDEX ix_settlement_lines_payment ON settlement_lines (payment_id) WHERE payment_id IS NOT NULL;

ALTER TABLE payments ADD CONSTRAINT fk_payments_settlement_line
    FOREIGN KEY (settlement_line_id) REFERENCES settlement_lines (id);

COMMENT ON COLUMN settlement_lines.match_status IS
    'MATCHED: cuadró. UNKNOWN_PAYMENT: el proveedor liquidó algo que aquí no existe. '
    'AMOUNT_MISMATCH: el mismo pago por otro monto. DUPLICATE: la misma referencia dos veces en el '
    'mismo corte. Los cuatro se reportan; ninguno se acomoda.';


-- ---------------------------------------------------------------------------------------------
-- 5. Los pagos que ya existían.
--
-- Las recargas anteriores son plata real que entró, así que tienen que estar en `payments` o el
-- primer corte de conciliación mostraría un hueco que no existe. Se reconstruyen desde el libro de
-- billetera, que es donde quedaron, y se marcan NOT_APPLICABLE: nadie va a poder cotejarlas contra
-- una liquidación que nunca se importó, y dejarlas PENDING las pondría para siempre en la lista de
-- «cobrado y no liquidado» —una alarma permanente por algo que no es un problema.
-- ---------------------------------------------------------------------------------------------
INSERT INTO payments (id, tenant_id, user_id, method, provider, provider_reference, status,
                      gross_amount_minor, net_amount_minor, currency_code, purpose,
                      target_type, target_id, requested_at, confirmed_at,
                      reconciliation_status, created_by, created_at, updated_at)
SELECT gen_random_uuid(), t.tenant_id, t.user_id,
       CASE t.source
           WHEN 'MUNICIPAL_COUNTER' THEN 'COUNTER_CASH'
           WHEN 'PARTNER'           THEN 'PARTNER'
           WHEN 'ADJUSTMENT'        THEN 'ADJUSTMENT'
           ELSE 'CARD'
       END,
       t.source, t.external_reference, 'CAPTURED',
       t.amount_minor, t.amount_minor, t.currency_code, 'WALLET_TOPUP',
       'WALLET_TRANSACTION', t.id, t.created_at, t.created_at,
       'NOT_APPLICABLE', t.created_by, t.created_at, t.created_at
FROM wallet_transactions t
WHERE t.type = 'TOP_UP' AND t.amount_minor > 0;

-- Este UPDATE es el que obligó a estrechar el disparador de arriba: sólo llena `payment_id`, así
-- que pasa; si alguna vez alguien le agrega otra columna al SET, dejará de pasar, y eso es lo que
-- se quiere.
UPDATE wallet_transactions t
SET payment_id = p.id
FROM payments p
WHERE p.target_type = 'WALLET_TRANSACTION' AND p.target_id = t.id;
