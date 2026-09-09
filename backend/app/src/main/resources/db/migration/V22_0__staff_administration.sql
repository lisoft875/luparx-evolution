-- =============================================================================================
-- V22_0 — Administración de funcionarios (CONTRACT.md v0.15).
--
-- Cuatro cosas que el panel de funcionarios necesita y que el esquema no tenía:
--
--   1. SUSPENDED como estado de membresía. Desactivar a un funcionario le quita el acceso a ESA
--      municipalidad; no le toca la cuenta. La persona sigue siendo una persona —puede estacionar
--      y pagar como ciudadana en cualquier cantón— porque eso no es asunto de su patrono.
--      Suspender es reversible; revocar es el final del vínculo. Bloquear a la persona entera
--      sigue existiendo aparte (users.status), y es una acción de otra gravedad.
--
--   2. membership_zones. Qué sectores cubre un fiscalizador, y —desde v0.15— dónde puede actuar:
--      el servidor rechaza una boleta fuera de sus zonas.
--
--   3. users.last_login_at / last_login_portal. «¿Esta cuenta se está usando?» es la primera
--      pregunta de cualquier revisión de accesos, y no se podía contestar.
--
--   4. citations.inspector_name_snapshot. La boleta guardaba sólo el id del funcionario. El resto
--      de la boleta ya guarda copias de lo que era cierto en el momento (el código y el nombre de
--      la infracción, el monto, la placa); el nombre de quien la levantó faltaba, y es el dato por
--      el que se pregunta cuando alguien impugna un acto administrativo años después.
--
-- Nada aquí borra ni desactiva una boleta. Es explícito porque es un requisito: desactivar a un
-- funcionario no toca su historial de actuaciones, ni una fila.
-- =============================================================================================


-- ---------------------------------------------------------------------------------------------
-- 1. Suspensión de una membresía.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE tenant_memberships DROP CONSTRAINT ck_tenant_memberships_status;
ALTER TABLE tenant_memberships ADD CONSTRAINT ck_tenant_memberships_status CHECK (
    status IN ('ACTIVE', 'PENDING_APPROVAL', 'REJECTED', 'REVOKED', 'SUSPENDED'));

ALTER TABLE tenant_memberships ADD COLUMN suspended_at timestamptz;

ALTER TABLE tenant_memberships ADD CONSTRAINT ck_tenant_memberships_suspended CHECK (
    status <> 'SUSPENDED' OR suspended_at IS NOT NULL);

COMMENT ON COLUMN tenant_memberships.suspended_at IS
    'Cuándo se suspendió el acceso a esta municipalidad. SUSPENDED es reversible y no toca la '
    'cuenta de la persona: sigue pudiendo usar la aplicación como ciudadana. REVOKED es el final '
    'del vínculo, y la fila se conserva igual porque de ella cuelga la bitácora.';


-- ---------------------------------------------------------------------------------------------
-- 2. Zonas asignadas a un funcionario.
--
-- La asignación cuelga de la MEMBRESÍA y no de la persona: es su puesto en esta municipalidad lo
-- que cubre esos sectores, y la misma persona puede ser fiscalizadora en dos municipalidades con
-- zonas distintas. ON DELETE CASCADE no borra historial: una membresía no se borra nunca (se
-- revoca), así que la cascada sólo cubre el caso de una limpieza administrativa deliberada.
--
-- Que la zona pertenezca a la misma municipalidad que la membresía no se puede escribir como CHECK
-- —son dos tablas— y lo valida el servicio antes de insertar. Queda anotado como lo que es: una
-- invariante que el esquema no puede sostener solo.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE membership_zones (
    membership_id uuid        NOT NULL REFERENCES tenant_memberships (id) ON DELETE CASCADE,
    zone_id       uuid        NOT NULL REFERENCES parking_zones (id),
    assigned_at   timestamptz NOT NULL,
    PRIMARY KEY (membership_id, zone_id)
);

CREATE INDEX ix_membership_zones_zone ON membership_zones (zone_id);

COMMENT ON TABLE membership_zones IS
    'Los sectores que cubre un funcionario. Sin filas para una membresía significa SIN RESTRICCIÓN '
    '—puede actuar en todas las zonas de su municipalidad— y no «en ninguna»: lo segundo sólo se '
    'alcanza por descuido y su único efecto sería impedirle trabajar a alguien.';


-- ---------------------------------------------------------------------------------------------
-- 3. Último acceso.
--
-- Se guarda en la persona y no en la membresía porque es lo que la sesión sabe: se ingresa a un
-- portal, y la municipalidad se elige después. Para el panel alcanza —la pregunta es si la cuenta
-- se está usando— y el portal queda al lado para no confundir a un fiscalizador que entra todos
-- los días con alguien que sólo abre la app de ciudadano.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN last_login_at     timestamptz;
ALTER TABLE users ADD COLUMN last_login_portal varchar(16);

ALTER TABLE users ADD CONSTRAINT ck_users_last_login_portal CHECK (
    last_login_portal IS NULL OR last_login_portal IN ('citizen', 'admin', 'inspector', 'platform'));


-- ---------------------------------------------------------------------------------------------
-- 4. Quién levantó la boleta, con nombre.
--
-- Copia, no join, por la misma razón que plate_snapshot y que infraction_name: es lo que era cierto
-- cuando se levantó el acto. Un funcionario puede casarse y cambiar de apellido, y la boleta de
-- 2026 tiene que seguir diciendo quién la firmó en 2026.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE citations ADD COLUMN inspector_name_snapshot varchar(200);

UPDATE citations c
   SET inspector_name_snapshot = trim(
           u.given_name || ' ' || u.family_name
           || coalesce(' ' || u.second_family_name, ''))
  FROM users u
 WHERE u.id = c.inspector_user_id;

COMMENT ON COLUMN citations.inspector_name_snapshot IS
    'El nombre del funcionario tal como era al levantar la boleta. Nullable sólo por las filas '
    'anteriores a V22_0, que se rellenaron con el nombre actual por ser lo más cercano disponible.';
