-- =============================================================================================
-- V35_0 — Notificaciones al ciudadano, y el primer consumidor del outbox (CONTRACT.md v0.38).
--
-- La campanita del portal ciudadano mostraba un 7 quemado en `CitizenShell.tsx` y no llevaba a
-- ninguna parte. Detrás de ese número no había nada: ni tabla, ni endpoint, ni evento.
--
-- Tres cosas que conviene tener claras antes de leer el esquema:
--
--   1. **Una notificación no guarda texto.** Guarda un `type` y sus `params`. El texto lo arma el
--      cliente con su propio diccionario, y el correo con `messages_*.properties`. Es la misma regla
--      que ya obedece `NotificationSender` (clave i18n + modelo, nunca un cuerpo ya renderizado):
--      una fila escrita hoy en español se lee en inglés mañana si la persona cambia de idioma, y una
--      corrección de redacción no obliga a reescribir el historial de nadie.
--
--   2. **La idempotencia vive en el esquema, no en el job.** `uq_notifications_subject` es lo que
--      hace que un job que corre cada minuto sobre «estadías que vencen en quince» no le mande
--      quince avisos a la misma persona. Los jobs de fondo tienen que ser idempotentes
--      (docs/ARCHITECTURE.md §7) y ésta es la forma barata de serlo: el segundo intento choca contra
--      un índice en vez de depender de que el job recuerde algo.
--
--   3. **La campana es estado de esta misma base; el correo no.** Por eso la fila de `notifications`
--      se escribe en la transacción del hecho que la origina, y el correo sale por `outbox_events`
--      (ADR 0012). Esa tabla existe desde la V1_0 y **nunca tuvo consumidor**: se escribían filas y
--      nadie las publicaba. Las tres columnas de reintento de abajo son lo que le faltaba para que
--      un relay pueda hacer su trabajo sin perder correos ni mandarlos dos veces.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- notifications — el buzón del ciudadano, por municipalidad.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE notifications (
    id           uuid        PRIMARY KEY,
    tenant_id    uuid        NOT NULL REFERENCES tenants (id),
    user_id      uuid        NOT NULL REFERENCES users (id),
    type         varchar(64) NOT NULL,
    category     varchar(24) NOT NULL,
    subject_type varchar(32) NOT NULL,
    subject_id   uuid        NOT NULL,
    params       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at   timestamptz NOT NULL,
    read_at      timestamptz
);

COMMENT ON TABLE notifications IS
    'Buzón del ciudadano. Con tenant_id porque una notificación es de una municipalidad: la '
    'estadía, la boleta y la recarga lo son, y la campana se lee dentro de la municipalidad activa.';
COMMENT ON COLUMN notifications.type IS
    'Clave estable del hecho (p. ej. PARKING_SESSION_EXPIRING). El texto NO se guarda: se arma en el '
    'cliente y en el correo a partir de esta clave y de params, para que la misma fila se lea en el '
    'idioma que la persona tenga hoy.';
COMMENT ON COLUMN notifications.category IS
    'PARKING, FINES o WALLET. Copiada de la fila y no derivada del tipo al leer, porque es lo que '
    'decide si esta notificación además sale por correo y esa decisión tiene que poder auditarse '
    'contra lo que la persona tenía marcado.';
COMMENT ON COLUMN notifications.subject_id IS
    'De qué habla: la estadía, la boleta, el movimiento. Sin llave foránea a propósito — apunta a '
    'tres tablas distintas de tres módulos distintos, y una notificación sobrevive a lo que la '
    'originó. Es también la mitad de la clave de idempotencia.';
COMMENT ON COLUMN notifications.params IS
    'Sólo lo que el texto necesita: placa, hora, monto. Nunca identificadores personales completos '
    'ni secretos (SECURITY.md §11).';

-- El mismo hecho no se avisa dos veces. Es lo que permite que los jobs de vencimiento se corran tan
-- seguido como haga falta sin llevar la cuenta de a quién ya le avisaron.
CREATE UNIQUE INDEX uq_notifications_subject ON notifications (user_id, type, subject_id);

-- El buzón, tal como lo pide la pantalla: de una persona, en una municipalidad, lo más nuevo primero.
CREATE INDEX ix_notifications_inbox ON notifications (user_id, tenant_id, created_at DESC);

-- El número de la campana. Índice parcial: las leídas no se cuentan nunca, así que no se indexan.
CREATE INDEX ix_notifications_unread ON notifications (user_id, tenant_id) WHERE read_at IS NULL;

-- ---------------------------------------------------------------------------------------------
-- notification_preferences — el interruptor maestro del correo, por persona.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE notification_preferences (
    user_id       uuid        PRIMARY KEY REFERENCES users (id),
    email_enabled boolean     NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL,
    updated_at    timestamptz NOT NULL,
    version       bigint      NOT NULL DEFAULT 0
);

COMMENT ON TABLE notification_preferences IS
    'Por persona y no por municipalidad: es una decisión sobre su bandeja de entrada, y alguien que '
    'pertenece a tres municipalidades no quiere tomarla tres veces.';
COMMENT ON COLUMN notification_preferences.email_enabled IS
    'FALSE por defecto. La campana no se pide permiso —es la propia app— pero el correo sí: mandarle '
    'a alguien correo porque sí es la clase de cosa que termina en la carpeta de spam y se lleva por '
    'delante los correos que sí importan, como el de verificación.';

-- ---------------------------------------------------------------------------------------------
-- notification_email_categories — qué se manda por correo. La fila ES el permiso.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE notification_email_categories (
    user_id  uuid        NOT NULL REFERENCES notification_preferences (user_id) ON DELETE CASCADE,
    category varchar(24) NOT NULL,
    PRIMARY KEY (user_id, category)
);

COMMENT ON TABLE notification_email_categories IS
    'Una fila por categoría habilitada. Tabla hija y no tres columnas booleanas: la próxima '
    'categoría es una fila, no una migración, y "sin fila" es inequívocamente "no lo quiero" sin '
    'tener que decidir qué significa NULL.';

-- ---------------------------------------------------------------------------------------------
-- outbox_events — lo que le faltaba para tener un relay de verdad.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE outbox_events
    ADD COLUMN attempts        integer     NOT NULL DEFAULT 0,
    ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN last_error      varchar(500),
    ADD COLUMN failed_at       timestamptz;

COMMENT ON COLUMN outbox_events.next_attempt_at IS
    'Cuándo vuelve a intentarse. Con backoff exponencial: un SMTP caído no se martilla cada minuto, '
    'y un correo no se pierde porque el primer intento cayó en el peor momento.';
COMMENT ON COLUMN outbox_events.failed_at IS
    'Se agotaron los reintentos. Distinto de published_at a propósito: marcar como publicado algo '
    'que nunca salió sería mentirle a quien después pregunte por qué no le llegó el aviso. La fila '
    'se queda, con su last_error, para que alguien pueda contestar esa pregunta.';
COMMENT ON COLUMN outbox_events.last_error IS
    'Truncado a 500 caracteres, y sin la dirección del destinatario: un stack trace completo en una '
    'columna es una tabla que crece sin techo, y el mensaje de la excepción es lo que se lee.';

-- La cola del relay. Sustituye a ix_outbox_events_pending, que ordenaba por created_at y por lo
-- tanto no sabía nada de reintentos: una fila que falló hace un segundo seguía apareciendo primera.
DROP INDEX ix_outbox_events_pending;
CREATE INDEX ix_outbox_events_due ON outbox_events (next_attempt_at)
    WHERE published_at IS NULL AND failed_at IS NULL;

COMMENT ON INDEX ix_outbox_events_due IS
    'La cola: pendientes, no fracasadas, ordenadas por cuándo toca. El relay nunca recorre lo ya '
    'publicado, así que el índice se mantiene pequeño para siempre por más que crezca la tabla.';
