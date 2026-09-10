-- =============================================================================================
-- V26_0 — Invitación de funcionarios (CONTRACT.md v0.27).
--
-- Hasta ahora dar de alta a un funcionario nuevo era: el administrador transcribe el expediente de
-- personal entero —nombre, cédula, dirección, teléfono, fecha de nacimiento— y la persona sólo
-- recibe un enlace para poner su contraseña. Funciona, pero pone a una tercera persona a teclear
-- datos que sólo el interesado sabe deletrear, sobre campos que son ÚNICOS EN TODA LA PLATAFORMA:
-- una errata en la cédula no es un error de forma, es una identidad equivocada que después nadie
-- puede corregir sin tocar la unicidad.
--
-- La invitación invierte eso: el administrador pone lo único que le consta —el correo y el puesto—
-- y la persona completa sus propios datos.
--
-- Esta tabla NO es una membresía todavía. Es una promesa: alguien con autoridad en esta
-- municipalidad ofreció este puesto a esta dirección. La membresía nace cuando la invitación se
-- acepta, y de ahí en adelante manda `tenant_memberships` como siempre.
-- =============================================================================================

CREATE TABLE staff_invitations (
    id               uuid         PRIMARY KEY,
    tenant_id        uuid         NOT NULL REFERENCES tenants (id),
    -- Normalizado igual que en users.email: es la misma dirección o no es la misma persona.
    email            varchar(320) NOT NULL,
    portal           varchar(16)  NOT NULL,
    role             varchar(32)  NOT NULL,
    -- SHA-256 del token, nunca el token. Quien lea esta tabla no puede aceptar la invitación de
    -- nadie: el enlace vive en el buzón del invitado y en ningún otro lado (SECURITY.md §11).
    token_hash       varchar(64)  NOT NULL,
    status           varchar(16)  NOT NULL,
    invited_by       uuid         REFERENCES users (id),
    created_at       timestamptz  NOT NULL,
    expires_at       timestamptz  NOT NULL,
    accepted_at      timestamptz,
    accepted_user_id uuid         REFERENCES users (id),
    revoked_at       timestamptz,
    version          bigint       NOT NULL DEFAULT 0,

    CONSTRAINT ck_staff_invitations_status
        CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED')),
    -- El mismo par rol/portal que las membresías. Un rol pertenece a un portal y sólo a uno; que la
    -- invitación pudiera prometer una combinación que la membresía no admite sería una promesa
    -- imposible de cumplir, descubierta al aceptarla.
    CONSTRAINT ck_staff_invitations_role_portal CHECK (
        (portal = 'ADMIN'     AND role IN ('TENANT_ADMIN', 'TENANT_FINANCE', 'TENANT_SUPPORT')) OR
        (portal = 'INSPECTOR' AND role IN ('INSPECTOR', 'INSPECTOR_LEAD'))
    ),
    CONSTRAINT ck_staff_invitations_window CHECK (expires_at > created_at),
    -- Aceptada quiere decir aceptada POR ALGUIEN: sin la persona, la fila no dice nada.
    CONSTRAINT ck_staff_invitations_accepted CHECK (
        status <> 'ACCEPTED' OR (accepted_at IS NOT NULL AND accepted_user_id IS NOT NULL)),
    CONSTRAINT ck_staff_invitations_revoked CHECK (status <> 'REVOKED' OR revoked_at IS NOT NULL)
);

COMMENT ON TABLE staff_invitations IS
    'Un puesto ofrecido a una dirección de correo que todavía no tiene cuenta. No es una membresía: '
    'la membresía nace al aceptarla. La fila se conserva aceptada o revocada, porque de ella cuelga '
    'la respuesta a «quién le dio acceso a esta persona, y cuándo».';
COMMENT ON COLUMN staff_invitations.token_hash IS
    'SHA-256 del token del enlace. El token en claro sólo existe en el correo del invitado.';

-- Una sola invitación viva por (municipalidad, correo). Sin esto, dos administradores invitando a
-- la misma persona el mismo día crean dos enlaces válidos y el segundo en aceptarse choca contra la
-- unicidad del correo en `users` — un 409 en la cara del invitado, por un descuido de la oficina.
-- Reinvitar es reemplazar el token de la fila viva, no agregar otra.
CREATE UNIQUE INDEX uq_staff_invitations_pending
    ON staff_invitations (tenant_id, email) WHERE status = 'PENDING';

-- El token se busca por su hash en cada visita al enlace, sin saber de qué municipalidad es.
CREATE UNIQUE INDEX uq_staff_invitations_token ON staff_invitations (token_hash);

CREATE INDEX ix_staff_invitations_tenant_status ON staff_invitations (tenant_id, status, created_at DESC);

COMMENT ON INDEX uq_staff_invitations_pending IS
    'Una invitación viva por dirección y municipalidad. Reinvitar reemplaza el token; no acumula '
    'enlaces válidos, que además serían varias formas simultáneas de entrar.';
