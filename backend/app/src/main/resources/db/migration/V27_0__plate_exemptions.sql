-- =============================================================================================
-- V27_0 — Exoneración por placa (CONTRACT.md v0.28).
--
-- Hasta ahora la plataforma sólo sabía de una forma de no ser multado: haber pagado. Un vehículo
-- que la ley exonera —la flotilla municipal, una ambulancia, un cuerpo diplomático, una placa de
-- discapacidad— era indistinguible de uno que no pagó, y la app del fiscalizador le mostraba
-- «sin pago» junto a un botón para emitir la boleta.
--
-- POR QUÉ CUELGA DE LA PLACA Y NO DE UNA PERSONA NI DE UN VEHÍCULO REGISTRADO
--
-- Porque la placa es lo que el fiscalizador consulta y lo que está pintado en el carro. Los casos
-- que de verdad importan —la ambulancia, el carro del municipio— casi nunca tienen cuenta en la
-- aplicación y no la van a tener: exigir un vehículo registrado dejaría fuera precisamente a los
-- que no se pueden multar. La contrapartida está asumida: una placa exonerada lo está aunque el
-- carro se venda, y por eso la vigencia y el motivo son obligatorios de leer, y revocar es una
-- operación de un clic con su propia bitácora.
--
-- POR QUÉ VIVE EN FISCALIZACIÓN Y NO EN PARQUEO
--
-- Una exoneración dice «a este vehículo no se le multa», no «a este vehículo se le cobra cero». El
-- dominio de parqueo sigue cobrando exactamente igual y no sabe que esto existe: el exonerado
-- simplemente no inicia una estadía. Si esto viviera en parqueo habría que meterle una excepción a
-- la cotización —el lugar donde una excepción silenciosa es una pérdida de recaudación que nadie
-- nota— y ganaríamos un acoplamiento entre dos dominios que hoy sólo se hablan por un puerto de
-- lectura.
-- =============================================================================================

CREATE TABLE plate_exemptions (
    id              uuid         PRIMARY KEY,
    tenant_id       uuid         NOT NULL REFERENCES tenants (id),
    -- Normalizada igual que en el resto de la plataforma: mayúsculas, sin separadores. Es la forma
    -- que compara el fiscalizador cuando teclea, y comparar otra cosa sería no comparar nada.
    plate           varchar(16)  NOT NULL,
    -- Como la escribió quien la registró, para que el expediente se parezca al papel que lo originó.
    plate_raw       varchar(32)  NOT NULL,
    -- Obligatorio y en palabras. Deliberadamente NO es un catálogo de categorías: qué exonera un
    -- país no es lo que exonera otro, y un enum aquí sería una regla de negocio de Costa Rica
    -- incrustada en el esquema. Lo que sí es invariante es que alguien tenga que escribir por qué.
    reason          varchar(300) NOT NULL,
    -- El papel que la respalda: número de acuerdo municipal, oficio, resolución. Opcional porque no
    -- toda municipalidad trabaja igual, pero es lo primero que se pide cuando alguien impugna.
    document_ref    varchar(120),
    status          varchar(16)  NOT NULL,
    valid_from      timestamptz  NOT NULL,
    -- NULL = sin vencimiento. Se permite porque una flotilla municipal no vence, y se muestra en
    -- pantalla con esas palabras: una exoneración que nadie revisa es cómo un carro vendido sigue
    -- parqueando gratis, y esconderlo detrás de una celda vacía sería peor.
    valid_to        timestamptz,
    granted_by      uuid         REFERENCES users (id),
    granted_at      timestamptz  NOT NULL,
    revoked_by      uuid         REFERENCES users (id),
    revoked_at      timestamptz,
    revoke_reason   varchar(300),
    version         bigint       NOT NULL DEFAULT 0,

    CONSTRAINT ck_plate_exemptions_status CHECK (status IN ('ACTIVE', 'REVOKED')),
    CONSTRAINT ck_plate_exemptions_window CHECK (valid_to IS NULL OR valid_to > valid_from),
    CONSTRAINT ck_plate_exemptions_plate CHECK (
        plate = upper(plate) AND plate !~ '[^A-Z0-9]'),
    CONSTRAINT ck_plate_exemptions_revoked CHECK (
        status <> 'REVOKED' OR revoked_at IS NOT NULL)
);

COMMENT ON TABLE plate_exemptions IS
    'Placas que esta municipalidad no multa por falta de pago, con su motivo y su vigencia. No es '
    'un descuento: el dominio de parqueo cobra igual y no sabe que esto existe. Una exoneración '
    'revocada conserva su fila, porque de ella depende explicar por qué no se multó en su momento.';
COMMENT ON COLUMN plate_exemptions.plate IS
    'Normalizada: mayúsculas y sin separadores, la misma forma que compara la consulta de placa.';
COMMENT ON COLUMN plate_exemptions.valid_to IS
    'NULL significa sin vencimiento, y la pantalla lo dice así. No es lo mismo que vacío.';

-- Una exoneración viva por placa y municipalidad. Sin esto, dos funcionarios registrando la misma
-- placa el mismo día dejan dos filas y revocar la que se ve deja la otra exonerando.
CREATE UNIQUE INDEX uq_plate_exemptions_active
    ON plate_exemptions (tenant_id, plate) WHERE status = 'ACTIVE';

-- La consulta del fiscalizador: esta placa, en esta municipalidad, ahora.
CREATE INDEX ix_plate_exemptions_lookup ON plate_exemptions (tenant_id, plate, status);

COMMENT ON INDEX uq_plate_exemptions_active IS
    'Una exoneración viva por placa. Revocar tiene que ser suficiente para que deje de exonerar.';
