-- =============================================================================================
-- V39_0 — Pagar una multa con el saldo de la billetera (CONTRACT.md v0.41).
--
-- `POST /citizen/fines/{id}/payments` contestaba 501 desde la v0.1 con el contrato ya fijado. Esto
-- lo implementa para el único medio de pago que hoy existe de verdad: el saldo que el ciudadano ya
-- tiene en su billetera de esa municipalidad.
--
-- Tres cambios, y los tres salen de una decisión de producto que conviene dejar escrita:
--
--   **Pagar retira el reclamo.** Se puede pagar una multa que tiene un reclamo sin resolver, y al
--   hacerlo el reclamo queda RETIRADO. La alternativa —prohibirlo mientras el municipio no resuelva—
--   era más simple, pero deja al ciudadano esperando sin poder cerrar el asunto ni aprovechar el
--   descuento por pronto pago, que vence mientras tanto. La otra alternativa —pagar y devolver si
--   después le dan la razón— exige un camino de devolución que esta plataforma no tiene y que su
--   propia regla desaconseja (la plata no se devuelve, CONTRACT.md v0.2 regla 5). Retirar es lo
--   honesto: el ciudadano decide que ya no quiere pelearla, y queda dicho quién lo decidió.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- 1. Un cargo de multa es un movimiento de billetera más.
--
-- Mismo libro que el parqueo y con el mismo signo: sale plata, así que el monto es negativo. No hay
-- tabla nueva ni columna nueva — una multa pagada con saldo NO es un `payment` en el sentido del
-- módulo de billetería: no entra plata a la plataforma, se gasta la que ya estaba. La plata entró
-- antes, en la recarga, que sí tiene su fila en `payments`.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE wallet_transactions DROP CONSTRAINT ck_wallet_transactions_type;
ALTER TABLE wallet_transactions ADD CONSTRAINT ck_wallet_transactions_type CHECK (
    type IN ('TOP_UP', 'SESSION_CHARGE', 'EXTENSION_CHARGE', 'FINE_CHARGE', 'ADJUSTMENT'));

ALTER TABLE wallet_transactions DROP CONSTRAINT ck_wallet_transactions_sign;
ALTER TABLE wallet_transactions ADD CONSTRAINT ck_wallet_transactions_sign CHECK (
    (type = 'TOP_UP' AND amount_minor > 0)
    OR (type IN ('SESSION_CHARGE', 'EXTENSION_CHARGE', 'FINE_CHARGE') AND amount_minor < 0)
    OR type = 'ADJUSTMENT');

-- ---------------------------------------------------------------------------------------------
-- 2. Un reclamo se puede retirar.
--
-- RETIRADO no es ACEPTADO ni RECHAZADO: la municipalidad nunca resolvió. Por eso lleva `resolved_at`
-- —terminó, y cuándo— pero NO lleva `resolved_by` ni motivo: no hubo funcionario que decidiera, y
-- rellenar esos campos con el propio ciudadano diría que alguien resolvió algo que nadie resolvió.
-- Quién lo retiró no se pierde: es `user_id`, quien lo presentó, y es el único que puede.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE citation_appeals DROP CONSTRAINT ck_citation_appeals_status;
ALTER TABLE citation_appeals ADD CONSTRAINT ck_citation_appeals_status CHECK (
    status IN ('SUBMITTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'));

ALTER TABLE citation_appeals DROP CONSTRAINT ck_citation_appeals_resolution;
ALTER TABLE citation_appeals ADD CONSTRAINT ck_citation_appeals_resolution CHECK (
    (status = 'SUBMITTED' AND resolved_at IS NULL AND resolved_by IS NULL AND resolution_reason IS NULL)
    -- Retirado: terminó, sin resolución de nadie.
    OR (status = 'WITHDRAWN' AND resolved_at IS NOT NULL AND resolved_by IS NULL
        AND resolution_reason IS NULL)
    -- Resuelto: una decisión más su motivo. La mitad de una resolución no es una resolución.
    OR (status IN ('ACCEPTED', 'REJECTED') AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL
        AND length(btrim(resolution_reason)) > 0));

COMMENT ON COLUMN citation_appeals.resolved_by IS
    'El funcionario que decidió. NULO cuando el reclamo se retiró: nadie decidio, lo cerró quien lo '
    'presentó al pagar la multa (v0.41).';

-- ---------------------------------------------------------------------------------------------
-- 3. La boleta apunta al movimiento que la pagó.
--
-- `paid_wallet_transaction_id` es un identificador **sin llave foránea**, a propósito y por la misma
-- razón que `payments.target_id` (ADR 0019): `citations` vive en fiscalización y
-- `wallet_transactions` en parqueo, y esos dos módulos no se conocen — el día que fiscalización se
-- extraiga a su propio servicio, una FK aquí sería lo primero que habría que romper.
--
-- Nulo para una boleta pagada en caja o en el otro sistema del municipio. Por eso NO hay un CHECK
-- que exija `paid_at` cuando el estado es PAID: una boleta espejada desde otro sistema (v0.34) llega
-- pagada sin que nadie la haya cobrado aquí, y esa restricción rompería el ingreso externo. La que
-- sí vale siempre es la contraria.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE citations
    ADD COLUMN paid_at                    timestamptz,
    ADD COLUMN paid_wallet_transaction_id uuid;

ALTER TABLE citations ADD CONSTRAINT ck_citations_paid_movement CHECK (
    paid_wallet_transaction_id IS NULL OR (status = 'PAID' AND paid_at IS NOT NULL));

COMMENT ON COLUMN citations.paid_at IS
    'Cuándo se pagó, si se pagó. Nulo en una boleta que nadie ha pagado, y también en una espejada '
    'desde otro sistema que llegó ya pagada sin fecha.';
COMMENT ON COLUMN citations.paid_wallet_transaction_id IS
    'El movimiento de billetera que la pagó, cuando se pagó desde la app. Sin llave foránea a '
    'propósito: apunta a otro contexto acotado (ADR 0014). Nulo si se pagó en caja o en otro sistema.';

-- El corte del tesorero: qué se cobró en esta municipalidad y cuándo. Parcial porque lo no pagado no
-- se consulta nunca por esta vía, así que el índice se queda del tamaño de lo que sí se cobró.
CREATE INDEX ix_citations_paid ON citations (tenant_id, paid_at DESC) WHERE paid_at IS NOT NULL;
