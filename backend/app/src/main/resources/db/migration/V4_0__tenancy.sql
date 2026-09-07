-- =============================================================================================
-- V4_0 — module-tenancy: municipalities, their settings and the memberships that grant access.
--
-- This migration also closes the foreign keys of the append-only ledgers created in V1_0, now that
-- both `tenants` and `users` exist.
-- =============================================================================================

CREATE TABLE tenants (
    id                       uuid         PRIMARY KEY,
    slug                     varchar(64)  NOT NULL,
    legal_name               varchar(200) NOT NULL,
    display_name             varchar(160) NOT NULL,
    country_code             char(2)      NOT NULL REFERENCES countries (code),
    currency_code            char(3)      NOT NULL,
    locale                   varchar(35)  NOT NULL,
    time_zone                varchar(64)  NOT NULL,
    status                   varchar(32)  NOT NULL,
    self_registration_policy varchar(32)  NOT NULL DEFAULT 'APPROVAL_REQUIRED',
    status_reason            varchar(500),
    created_at               timestamptz  NOT NULL,
    updated_at               timestamptz  NOT NULL,
    created_by               uuid,
    updated_by               uuid,
    version                  bigint       NOT NULL DEFAULT 0,
    CONSTRAINT uq_tenants_slug UNIQUE (slug),
    CONSTRAINT ck_tenants_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT ck_tenants_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
    CONSTRAINT ck_tenants_policy
        CHECK (self_registration_policy IN ('OPEN', 'APPROVAL_REQUIRED', 'INVITE_ONLY')),
    CONSTRAINT ck_tenants_currency_upper CHECK (currency_code = upper(currency_code))
);

COMMENT ON TABLE tenants IS
    'A municipality. Country, currency, locale and time zone are per-tenant configuration: the '
    'platform defaults only pre-fill the form (CONTRACT.md §7).';
COMMENT ON COLUMN tenants.slug IS 'Public, URL-safe identifier, unique across the platform.';
COMMENT ON COLUMN tenants.status IS
    'Soft lifecycle. A municipality is never deleted, so audit history stays referentially valid.';

CREATE INDEX ix_tenants_status_country ON tenants (status, country_code);

-- ---------------------------------------------------------------------------------------------
CREATE TABLE tenant_settings (
    tenant_id  uuid         NOT NULL REFERENCES tenants (id),
    key        varchar(128) NOT NULL,
    value      jsonb        NOT NULL,
    updated_at timestamptz  NOT NULL,
    updated_by uuid,
    CONSTRAINT pk_tenant_settings PRIMARY KEY (tenant_id, key)
);

COMMENT ON TABLE tenant_settings IS
    'Typed key/value configuration per municipality. Allowed keys are declared by the '
    'TenantSettingKey enum, so a typo is a 422 rather than dead configuration.';

-- ---------------------------------------------------------------------------------------------
CREATE TABLE tenant_memberships (
    id            uuid        PRIMARY KEY,
    tenant_id     uuid        REFERENCES tenants (id),
    user_id       uuid        NOT NULL REFERENCES users (id),
    portal        varchar(16) NOT NULL,
    role          varchar(32) NOT NULL,
    status        varchar(32) NOT NULL,
    approved_by   uuid        REFERENCES users (id),
    approved_at   timestamptz,
    requested_at  timestamptz NOT NULL,
    revoked_at    timestamptz,
    status_reason varchar(500),
    version       bigint      NOT NULL DEFAULT 0,
    CONSTRAINT ck_tenant_memberships_portal
        CHECK (portal IN ('CITIZEN', 'ADMIN', 'INSPECTOR', 'PLATFORM')),
    CONSTRAINT ck_tenant_memberships_status
        CHECK (status IN ('ACTIVE', 'PENDING_APPROVAL', 'REJECTED', 'REVOKED')),
    CONSTRAINT ck_tenant_memberships_role
        CHECK (role IN ('PLATFORM_ADMIN', 'PLATFORM_SUPPORT', 'TENANT_ADMIN', 'TENANT_FINANCE',
                        'TENANT_SUPPORT', 'INSPECTOR', 'INSPECTOR_LEAD', 'CITIZEN')),
    -- A role belongs to exactly one portal; mixing them would break portal isolation.
    CONSTRAINT ck_tenant_memberships_role_portal CHECK (
        (portal = 'PLATFORM'  AND role IN ('PLATFORM_ADMIN', 'PLATFORM_SUPPORT')) OR
        (portal = 'ADMIN'     AND role IN ('TENANT_ADMIN', 'TENANT_FINANCE', 'TENANT_SUPPORT')) OR
        (portal = 'INSPECTOR' AND role IN ('INSPECTOR', 'INSPECTOR_LEAD')) OR
        (portal = 'CITIZEN'   AND role = 'CITIZEN')
    ),
    -- Platform back-office membership belongs to the product operator, not to a municipality
    -- (CONTRACT.md §0); every other membership is tenant-bound.
    CONSTRAINT ck_tenant_memberships_tenant_scope CHECK (
        (portal =  'PLATFORM' AND tenant_id IS NULL) OR
        (portal <> 'PLATFORM' AND tenant_id IS NOT NULL)
    )
);

COMMENT ON TABLE tenant_memberships IS
    'The authorization source of truth: a role name alone grants nothing, only an ACTIVE membership '
    'for the requested tenant and portal does (SECURITY.md §3).';
COMMENT ON COLUMN tenant_memberships.tenant_id IS
    'NULL only for platform back-office memberships (see ck_tenant_memberships_tenant_scope).';
COMMENT ON COLUMN tenant_memberships.version IS
    'Optimistic locking: two administrators approving the same request concurrently cannot both win.';

-- One membership per (tenant, user, portal). NULL tenant_id would defeat this unique index, so the
-- platform case gets its own partial index.
CREATE UNIQUE INDEX uq_tenant_memberships_tenant_user_portal
    ON tenant_memberships (tenant_id, user_id, portal) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX uq_tenant_memberships_platform_user
    ON tenant_memberships (user_id, portal) WHERE tenant_id IS NULL;

CREATE INDEX ix_tenant_memberships_tenant_status ON tenant_memberships (tenant_id, status);
CREATE INDEX ix_tenant_memberships_user ON tenant_memberships (user_id);
CREATE INDEX ix_tenant_memberships_requested_at ON tenant_memberships (requested_at);

-- ---------------------------------------------------------------------------------------------
-- Deferred foreign keys of the V1_0 ledgers, now that their targets exist.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE audit_events
    ADD CONSTRAINT fk_audit_events_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    ADD CONSTRAINT fk_audit_events_actor  FOREIGN KEY (actor_user_id) REFERENCES users (id);

ALTER TABLE outbox_events
    ADD CONSTRAINT fk_outbox_events_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);

ALTER TABLE idempotency_keys
    ADD CONSTRAINT fk_idempotency_keys_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    ADD CONSTRAINT fk_idempotency_keys_user   FOREIGN KEY (user_id) REFERENCES users (id);

ALTER TABLE refresh_tokens
    ADD CONSTRAINT fk_refresh_tokens_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);

ALTER TABLE tenants
    ADD CONSTRAINT fk_tenants_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    ADD CONSTRAINT fk_tenants_updated_by FOREIGN KEY (updated_by) REFERENCES users (id);
