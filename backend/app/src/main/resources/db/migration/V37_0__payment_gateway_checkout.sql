-- =============================================================================================
-- V37_0 — El borde de la pasarela: checkout alojado, notificaciones y el simulador (ADR 0023).
--
-- El V33_0 dejó el modelo de pagos y el ADR 0019 dijo qué faltaba: «cuando llegue una pasarela real
-- es un adaptador sobre PaymentService.begin / capture / fail, no un rediseño». Esto es ese borde.
--
-- Tres tablas y tres trabajos distintos:
--
--   * PAYMENT_CHECKOUTS — el traspaso. Entre el momento en que se abre el intento y el momento en
--     que el proveedor dice qué pasó, el ciudadano está en otro dominio. Lo que hay que recordar de
--     ese rato es a dónde se fue, bajo cuál referencia, hasta cuándo vale y con cuál token vuelve.
--
--   * PAYMENT_GATEWAY_NOTIFICATIONS — lo que llegó, crudo, antes de interpretarlo. Es evidencia
--     ante el proveedor y es el guardia contra repeticiones. Se escribe SIEMPRE, incluso cuando la
--     firma no cuadra: un intento de falsificación que no deja rastro es un intento que nadie
--     detecta.
--
--   * SIM_GATEWAY_CHARGES — el estado del proveedor simulado. Está en la base y no en memoria a
--     propósito (ADR 0023 §6): un simulador con un HashMap estático miente en cuanto hay dos
--     instancias, y esa es justo la clase de defecto para la que sirve tener un simulador. Queda
--     vacía en producción.
--
-- Nota sobre la numeración: la V36_0 se deja libre a propósito, apartada para la migración de
-- CONTRACCIÓN de la federación que el ADR 0022 dejó pendiente (soltar `user_federated_identities` y
-- quitar `FEDERATED_LINK_CONFIRMATION` de las dos restricciones CHECK que lo nombran). Ese retiro es
-- expand-and-contract igual que cualquier otro cambio de esquema y su número tiene que quedar ANTES
-- de lo que vino después, para que la secuencia se lea en el orden en que pasaron las cosas.
-- =============================================================================================


-- ---------------------------------------------------------------------------------------------
-- 1. payment_checkouts: el rato en que el ciudadano no está aquí.
--
-- Una fila por intento, con llave única sobre payment_id: si un pago pudiera tener dos checkouts
-- abiertos, dos pestañas del ciudadano serían dos cobros a la misma tarjeta.
--
-- Lo que esta tabla NO guarda es el resultado del pago. El estado del dinero vive en `payments` y
-- nada más; aquí `state` es el ciclo de vida del TRASPASO (abierto, terminado, vencido). Dos tablas
-- opinando sobre si un pago se cobró es exactamente lo que el ADR 0019 evitó al construir los
-- totales del tesorero de una sola fuente.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE payment_checkouts (
    id                     uuid         PRIMARY KEY,
    tenant_id              uuid         NOT NULL REFERENCES tenants (id),
    payment_id             uuid         NOT NULL REFERENCES payments (id),
    -- Quién tiene que volver. NOT NULL, al contrario que en `payments`: un checkout existe porque
    -- una persona identificada está pagando ahora, no como asiento contable de una caja.
    user_id                uuid         NOT NULL REFERENCES users (id),

    provider               varchar(64)  NOT NULL,
    -- La referencia del proveedor, que aquí sí es obligatoria: sin ella no hay nada que consultar, y
    -- consultar es lo único que autoriza acreditar (ADR 0023 §3).
    provider_reference     varchar(120) NOT NULL,
    -- A dónde se mandó al ciudadano. Se guarda para poder reenviarlo si vuelve atrás en el navegador
    -- sin abrir un segundo cobro, y para soporte: «¿a cuál página lo mandaron?» es una pregunta real.
    redirect_url           text         NOT NULL,

    state                  varchar(24)  NOT NULL,

    -- El token con el que vuelve, hasheado. Nunca en claro, por lo mismo que los tokens de
    -- invitación (SECURITY.md §11): una fuga de la base no debe entregar tokens usables. Es defensa
    -- en profundidad y no la autorización — la ruta de retorno exige JWT del portal ciudadano y que
    -- el checkout sea de quien vuelve.
    return_token_hash      varchar(64)  NOT NULL,
    -- Un solo uso. Marcado, no borrado: «ya usé ese enlace» y «ese enlace nunca existió» son
    -- respuestas distintas para quien atiende al ciudadano.
    return_token_used_at   timestamptz,

    -- Lo que el ciudadano reconoce de su propia tarjeta, y nada más. Los últimos cuatro dígitos se
    -- pueden almacenar; el PAN completo no entra a esta plataforma en ninguna forma (ADR 0023 §1).
    card_network           varchar(24),
    card_last4             varchar(4),
    -- El código de aprobación del emisor: lo que un banco pide cuando hay una disputa.
    authorization_code     varchar(32),

    -- Cuántas veces se le ha preguntado al proveedor por este checkout, y cuándo la última. Acotan
    -- el job: un proveedor caído no debe convertirse en un ciclo de consultas sin techo.
    poll_attempts          integer      NOT NULL DEFAULT 0,
    last_polled_at         timestamptz,

    expires_at             timestamptz  NOT NULL,
    resolved_at            timestamptz,

    created_at             timestamptz  NOT NULL,
    updated_at             timestamptz  NOT NULL,
    version                bigint       NOT NULL DEFAULT 0,

    CONSTRAINT ck_payment_checkouts_state CHECK (state IN ('OPEN', 'COMPLETED', 'EXPIRED')),
    -- Abierto y resuelto son contradictorios, en los dos sentidos. La base lo dice porque la
    -- validación de aplicación es necesaria y nunca suficiente.
    CONSTRAINT ck_payment_checkouts_resolved CHECK ((state = 'OPEN') = (resolved_at IS NULL)),
    CONSTRAINT ck_payment_checkouts_expiry CHECK (expires_at > created_at),
    CONSTRAINT ck_payment_checkouts_last4 CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'),
    CONSTRAINT ck_payment_checkouts_polls CHECK (poll_attempts >= 0)
);

-- Un pago, un checkout. Es la barrera contra el doble cobro por doble pestaña.
CREATE UNIQUE INDEX uq_payment_checkouts_payment ON payment_checkouts (payment_id);
-- La referencia del proveedor identifica el checkout al recibir una notificación, y la notificación
-- llega SIN tenant: por eso el índice no lo lleva. Resolver el tenant desde algo que mandó un
-- llamador no autenticado sería el error.
CREATE UNIQUE INDEX uq_payment_checkouts_reference ON payment_checkouts (provider, provider_reference);
CREATE UNIQUE INDEX uq_payment_checkouts_return_token ON payment_checkouts (return_token_hash);
-- Los que el job tiene que revisar. Parcial: la lista de pendientes es corta y la tabla no.
CREATE INDEX ix_payment_checkouts_open ON payment_checkouts (expires_at, last_polled_at)
    WHERE state = 'OPEN';
CREATE INDEX ix_payment_checkouts_user ON payment_checkouts (tenant_id, user_id, created_at DESC);

COMMENT ON TABLE payment_checkouts IS
    'Traspaso a la página de cobro del proveedor (ADR 0023). El resultado del dinero vive en payments; aquí sólo el ciclo de vida del traspaso.';
COMMENT ON COLUMN payment_checkouts.return_token_hash IS
    'SHA-256 del token de retorno. Defensa en profundidad sobre la autorización por JWT, nunca en su lugar.';
COMMENT ON COLUMN payment_checkouts.card_last4 IS
    'Últimos cuatro dígitos: lo que el ciudadano reconoce de su estado de cuenta. El PAN completo nunca entra a la plataforma.';


-- ---------------------------------------------------------------------------------------------
-- 2. payment_gateway_notifications: lo que llegó, tal como llegó.
--
-- Se guarda ANTES de interpretarlo y se guarda aunque la firma no cuadre. Dos razones, las dos de
-- evidencia: cuando un proveedor discuta lo que mandó, aquí está el cuerpo exacto; y cuando alguien
-- intente falsificar una notificación, aquí está el intento.
--
-- La idempotencia es de la base y no del código, porque con varias instancias el código no puede:
-- dos notificaciones del mismo evento pueden llegar a dos instancias al mismo milisegundo.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE payment_gateway_notifications (
    id                     uuid         PRIMARY KEY,
    provider               varchar(64)  NOT NULL,
    -- El id del evento del proveedor, cuando tiene uno. Nullable porque hay proveedores que no lo
    -- dan —ONVO Pay entre ellos— y de ahí viene la necesidad del hash de abajo.
    provider_event_id      varchar(200),
    -- La referencia del pago que el proveedor dice que cambió. Nullable: un cuerpo que no se pudo
    -- ni parsear igual se guarda.
    provider_reference     varchar(120),

    -- SHA-256 del cuerpo crudo. Es la idempotencia de último recurso para el proveedor sin id de
    -- evento, y es la huella que prueba que lo guardado es lo recibido.
    body_sha256            varchar(64)  NOT NULL,
    payload                text         NOT NULL,

    -- ¿Se pudo verificar quién lo mandó? Booleano y no descarte: una notificación no verificada se
    -- guarda y NO se procesa, y queda para que alguien la vea.
    signature_verified     boolean      NOT NULL,
    -- Lo que el proveedor CLAMA. No es lo que se acredita: acreditar sale de consultarle (ADR 0023
    -- §3). Se guarda para poder comparar después lo que avisó con lo que contestó.
    claimed_outcome        varchar(24),

    -- Se resuelven después de autenticar y buscar el pago, nunca desde el cuerpo.
    tenant_id              uuid         REFERENCES tenants (id),
    payment_id             uuid         REFERENCES payments (id),

    received_at            timestamptz  NOT NULL,
    processed_at           timestamptz,
    -- Por qué no se pudo procesar, en una línea. Sin traza: una traza de excepción en una tabla que
    -- se lee desde una pantalla de soporte es ruido que nadie lee.
    processing_error       varchar(500),

    created_at             timestamptz  NOT NULL,

    CONSTRAINT ck_gateway_notifications_outcome CHECK (claimed_outcome IS NULL OR claimed_outcome IN (
        'PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'REFUNDED', 'CHARGED_BACK',
        'UNKNOWN')),
    -- Lo no verificado no se procesa. Es una invariante de seguridad, así que la dice la base.
    CONSTRAINT ck_gateway_notifications_unverified_unprocessed CHECK (
        signature_verified OR processed_at IS NULL)
);

-- El mismo evento dos veces es el mismo evento. Parcial porque no todos traen id.
CREATE UNIQUE INDEX uq_gateway_notifications_event
    ON payment_gateway_notifications (provider, provider_event_id)
    WHERE provider_event_id IS NOT NULL;
-- Para el proveedor sin id de evento. Cuerpos idénticos del mismo proveedor son la misma noticia; si
-- alguna vez no lo fueran, el job de checkouts pendientes vuelve a consultar y nada se pierde
-- —que es precisamente por qué se puede permitir esta regla más dura.
CREATE UNIQUE INDEX uq_gateway_notifications_body
    ON payment_gateway_notifications (provider, body_sha256);
CREATE INDEX ix_gateway_notifications_reference
    ON payment_gateway_notifications (provider, provider_reference)
    WHERE provider_reference IS NOT NULL;
-- La lista que alguien debería mirar: lo que llegó y no se procesó.
CREATE INDEX ix_gateway_notifications_unprocessed
    ON payment_gateway_notifications (received_at DESC)
    WHERE processed_at IS NULL;

COMMENT ON TABLE payment_gateway_notifications IS
    'Notificaciones de pasarela tal como llegaron (ADR 0023). Evidencia y guardia contra repetición; se guardan incluso sin firma válida.';
COMMENT ON COLUMN payment_gateway_notifications.claimed_outcome IS
    'Lo que el proveedor dice. No autoriza nada: el crédito sale de consultarle el estado.';


-- ---------------------------------------------------------------------------------------------
-- 3. sim_gateway_charges: el estado del proveedor simulado.
--
-- Existe para que el simulador sea un proveedor y no un atajo (ADR 0023 §6). La tabla queda vacía
-- en producción y el bean que la usa sólo se registra con luparx.payments.provider=simulated.
--
-- Es deliberado que esté aquí y no en una migración de prueba: el simulador tiene que ejercer el
-- mismo esquema y las mismas transacciones que el adaptador real, y un esquema que sólo existe en
-- pruebas es un esquema que se diverge.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE sim_gateway_charges (
    -- La referencia que el simulador entrega como propia. Es la llave primaria porque para un
    -- proveedor su referencia ES la identidad del cobro.
    provider_reference     varchar(120) PRIMARY KEY,
    -- Lo que el simulador sabe del comercio que le pidió cobrar. Sin llave foránea, a propósito:
    -- un proveedor de verdad no tiene integridad referencial contra nuestras tablas, y un simulador
    -- que sí la tuviera esconderían justo los defectos que aparecen cuando no la hay.
    tenant_id              uuid         NOT NULL,
    payment_id             uuid         NOT NULL,
    idempotency_key        varchar(200),

    amount_minor           bigint       NOT NULL,
    currency_code          varchar(3)   NOT NULL,
    description            varchar(200),
    return_url             text         NOT NULL,

    outcome                varchar(24)  NOT NULL,
    card_network           varchar(24),
    card_last4             varchar(4),
    authorization_code     varchar(32),
    failure_code           varchar(64),
    failure_reason         varchar(500),
    -- El reto 3-D Secure: el flujo tiene que aguantar una pantalla intermedia, así que el simulador
    -- la tiene.
    challenge_pending      boolean      NOT NULL DEFAULT false,

    created_at             timestamptz  NOT NULL,
    updated_at             timestamptz  NOT NULL,
    resolved_at            timestamptz,
    expires_at             timestamptz  NOT NULL,

    CONSTRAINT ck_sim_charges_outcome CHECK (outcome IN (
        'PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'REFUNDED', 'CHARGED_BACK',
        'UNKNOWN')),
    CONSTRAINT ck_sim_charges_amount CHECK (amount_minor > 0),
    CONSTRAINT ck_sim_charges_last4 CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$')
);

CREATE UNIQUE INDEX uq_sim_charges_idempotency
    ON sim_gateway_charges (idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX ix_sim_charges_payment ON sim_gateway_charges (payment_id);

COMMENT ON TABLE sim_gateway_charges IS
    'Estado del proveedor SIMULATED (ADR 0023). Vacía en producción; en la base y no en memoria para ser correcta con varias instancias.';
