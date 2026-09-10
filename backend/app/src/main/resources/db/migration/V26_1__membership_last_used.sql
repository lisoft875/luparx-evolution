-- V26_1 — «¿Este puesto se sigue usando?» (CONTRACT.md v0.27).
--
-- V22_0 puso el último acceso en la PERSONA: users.last_login_at y users.last_login_portal. Para
-- responder «¿esta cuenta se está usando?» alcanzaba, y en ese momento era casi siempre cierto,
-- porque casi nadie tenía dos puestos.
--
-- v0.26 hizo de eso el caso normal: una misma persona es fiscalizadora en la app de calle y lleva
-- finanzas en el portal, y puede además tener puestos en dos municipalidades. Contra ese mundo la
-- columna de la persona miente en el panel de funcionarios, que muestra UNA FILA POR PUESTO:
--
--   * dos puestos de la misma persona muestran la misma fecha, la del último ingreso a cualquiera
--     de los dos, y
--   * una fiscalizadora de San José y de Escazú que sólo entra por Escazú aparece activa en San
--     José, que es exactamente la cuenta que una revisión de accesos tenía que encontrar.
--
-- El puesto es lo que se revisa y lo que se revoca, así que el puesto es lo que tiene que llevar su
-- propio uso. FASE DE EXPANSIÓN (ADR 0010): columna anulable, sin relleno. NULL significa «no se ha
-- usado desde que esto se mide», que es la verdad —no hay dato histórico por puesto que inventar— y
-- la pantalla lo dice con esas palabras en vez de fingir un «nunca».

ALTER TABLE tenant_memberships
    ADD COLUMN last_used_at timestamptz;

COMMENT ON COLUMN tenant_memberships.last_used_at IS
    'Cuándo se usó ESTE puesto por última vez: el momento en que se emitió una sesión con esta '
    'municipalidad y este portal. Distinto de users.last_login_at, que es de la persona y no '
    'distingue entre sus puestos. NULL = sin uso registrado desde v0.27, no «nunca».';

-- Ordenar el panel por «lo que lleva más tiempo sin usarse» es la consulta de una revisión de
-- accesos, y es sobre los puestos de una municipalidad.
CREATE INDEX ix_tenant_memberships_tenant_last_used
    ON tenant_memberships (tenant_id, last_used_at);
