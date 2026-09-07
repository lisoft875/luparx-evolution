-- =============================================================================================
-- V3_0 — module-identity: global users, credentials, MFA, federation, tokens.
--
-- Users are global (CONTRACT.md §1): one row per person, whatever number of municipalities they
-- belong to. There is deliberately no tenant_id here — belonging to a tenant is a membership,
-- created in V4_0.
-- =============================================================================================

CREATE TABLE users (
    id                          uuid         PRIMARY KEY,
    -- citext: the email is the natural login key and must be case-insensitively unique.
    email                       citext       NOT NULL,
    email_verified_at           timestamptz,

    -- §2.1 full name
    given_name                  varchar(100) NOT NULL,
    family_name                 varchar(100) NOT NULL,
    second_family_name          varchar(100),

    -- §2.2 identity document
    document_country_code       char(2)      NOT NULL REFERENCES countries (code),
    document_type               varchar(32)  NOT NULL,
    document_number             varchar(64)  NOT NULL,
    document_number_normalized  varchar(64)  NOT NULL,

    -- §2.3 address
    address_country_code        char(2)      NOT NULL REFERENCES countries (code),
    address_level1_id           uuid         REFERENCES administrative_divisions (id),
    address_level2_id           uuid         REFERENCES administrative_divisions (id),
    address_level3_id           uuid         REFERENCES administrative_divisions (id),
    address_line1               varchar(200) NOT NULL,
    address_line2               varchar(200),
    address_postal_code         varchar(32),

    -- §2.4 phone
    phone_e164                  varchar(20)  NOT NULL,
    phone_country_code          char(2)      NOT NULL,

    -- §2.5 nationality
    nationality_code            char(2)      NOT NULL REFERENCES countries (code),

    -- §2.7 birth date
    birth_date                  date         NOT NULL,

    -- account
    locale                      varchar(35)  NOT NULL,
    time_zone                   varchar(64)  NOT NULL,
    status                      varchar(32)  NOT NULL,
    blocked_reason              varchar(500),
    mfa_required                boolean      NOT NULL DEFAULT false,
    accepted_terms_version      varchar(32)  NOT NULL,
    credentials_version         integer      NOT NULL DEFAULT 1,
    created_at                  timestamptz  NOT NULL,
    updated_at                  timestamptz  NOT NULL,
    version                     bigint       NOT NULL DEFAULT 0,

    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT uq_users_document
        UNIQUE (document_country_code, document_type, document_number_normalized),
    CONSTRAINT ck_users_status CHECK (status IN ('ACTIVE', 'PENDING_VERIFICATION', 'BLOCKED')),
    CONSTRAINT ck_users_document_type
        CHECK (document_type IN ('NATIONAL_ID', 'FOREIGN_RESIDENT_ID', 'PASSPORT', 'TAX_ID', 'OTHER')),
    CONSTRAINT ck_users_phone_e164 CHECK (phone_e164 ~ '^\+[1-9][0-9]{6,18}$'),
    CONSTRAINT ck_users_blocked_reason
        CHECK (status <> 'BLOCKED' OR blocked_reason IS NOT NULL),
    CONSTRAINT ck_users_credentials_version CHECK (credentials_version >= 1),
    CONSTRAINT ck_users_birth_date CHECK (birth_date > DATE '1900-01-01')
);

COMMENT ON TABLE users IS
    'One row per person, global to the platform. Tenant scoping lives in tenant_memberships.';
COMMENT ON COLUMN users.document_number IS
    'The number exactly as typed, kept for display.';
COMMENT ON COLUMN users.document_number_normalized IS
    'Canonical form used by the uniqueness constraint: two people cannot share a document.';
COMMENT ON COLUMN users.credentials_version IS
    'Bumped on password change, forced reset or block. Access tokens carry it as `ver`, so a stale '
    'token is rejected on its next request instead of living out its 15 minutes (SECURITY.md §2).';
COMMENT ON COLUMN users.version IS
    'Optimistic locking: a concurrent update fails with a conflict instead of overwriting silently.';

-- No separate index for document lookups: uq_users_document already backs
-- (document_country_code, document_type, document_number_normalized) in that exact order.
CREATE INDEX ix_users_status_created ON users (status, created_at DESC);
CREATE INDEX ix_users_nationality ON users (nationality_code);
CREATE INDEX ix_users_created_at ON users (created_at);

-- ---------------------------------------------------------------------------------------------
CREATE TABLE user_credentials (
    user_id       uuid         PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    password_hash varchar(512) NOT NULL,
    algorithm     varchar(32)  NOT NULL,
    updated_at    timestamptz  NOT NULL,
    must_change   boolean      NOT NULL DEFAULT false
);

COMMENT ON TABLE user_credentials IS
    'Local password, in its own table so reading a profile never loads the hash. A federated-only '
    'account simply has no row here.';
COMMENT ON COLUMN user_credentials.password_hash IS
    'Argon2id in PHC string format; the cost parameters travel with the hash so they can be raised later.';

-- ---------------------------------------------------------------------------------------------
CREATE TABLE user_federated_identities (
    id        uuid         PRIMARY KEY,
    user_id   uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider  varchar(32)  NOT NULL,
    subject   varchar(255) NOT NULL,
    email     varchar(320),
    linked_at timestamptz  NOT NULL,
    CONSTRAINT uq_user_federated_identities UNIQUE (provider, subject),
    CONSTRAINT ck_user_federated_identities_provider
        CHECK (provider IN ('GOOGLE', 'MICROSOFT', 'FACEBOOK'))
);

COMMENT ON COLUMN user_federated_identities.subject IS
    'Stable provider identifier (OIDC `sub`), never the email: providers let people change addresses.';

CREATE INDEX ix_user_federated_identities_user ON user_federated_identities (user_id);

-- ---------------------------------------------------------------------------------------------
CREATE TABLE user_mfa_totp (
    user_id          uuid         PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    secret_encrypted varchar(512) NOT NULL,
    status           varchar(16)  NOT NULL,
    activated_at     timestamptz,
    updated_at       timestamptz  NOT NULL,
    CONSTRAINT ck_user_mfa_totp_status CHECK (status IN ('PENDING', 'ACTIVE', 'DISABLED')),
    CONSTRAINT ck_user_mfa_totp_activated
        CHECK (status <> 'ACTIVE' OR activated_at IS NOT NULL)
);

COMMENT ON COLUMN user_mfa_totp.secret_encrypted IS
    'AES-256-GCM ciphertext of the Base32 secret. The key lives outside the database, so a dump '
    'alone does not bypass anybody''s second factor (SECURITY.md §5).';

-- ---------------------------------------------------------------------------------------------
CREATE TABLE user_mfa_recovery_codes (
    id         uuid         PRIMARY KEY,
    user_id    uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code_hash  varchar(512) NOT NULL,
    created_at timestamptz  NOT NULL,
    used_at    timestamptz
);

COMMENT ON TABLE user_mfa_recovery_codes IS
    'Single-use codes, stored as Argon2id hashes exactly like passwords. The plaintext is shown once.';

CREATE INDEX ix_user_mfa_recovery_codes_user ON user_mfa_recovery_codes (user_id) WHERE used_at IS NULL;

-- ---------------------------------------------------------------------------------------------
CREATE TABLE refresh_tokens (
    id          uuid         PRIMARY KEY,
    user_id     uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    portal      varchar(16)  NOT NULL,
    tenant_id   uuid,
    token_hash  varchar(128) NOT NULL,
    family_id   uuid         NOT NULL,
    issued_at   timestamptz  NOT NULL,
    expires_at  timestamptz  NOT NULL,
    revoked_at  timestamptz,
    replaced_by uuid,
    user_agent  varchar(400),
    ip_hash     varchar(64),
    CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash),
    CONSTRAINT ck_refresh_tokens_portal
        CHECK (portal IN ('CITIZEN', 'ADMIN', 'INSPECTOR', 'PLATFORM')),
    CONSTRAINT ck_refresh_tokens_expiry CHECK (expires_at > issued_at)
);

COMMENT ON TABLE refresh_tokens IS
    'Opaque refresh tokens, stored hashed. Rotation plus family-wide revocation on reuse (ADR 0005).';
COMMENT ON COLUMN refresh_tokens.family_id IS
    'Shared by every token derived from one login: the unit revoked when a replayed token is detected.';

CREATE INDEX ix_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX ix_refresh_tokens_family ON refresh_tokens (family_id);
CREATE INDEX ix_refresh_tokens_expires ON refresh_tokens (expires_at);

-- ---------------------------------------------------------------------------------------------
CREATE TABLE verification_tokens (
    id          uuid         PRIMARY KEY,
    user_id     uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    purpose     varchar(40)  NOT NULL,
    token_hash  varchar(128) NOT NULL,
    created_at  timestamptz  NOT NULL,
    expires_at  timestamptz  NOT NULL,
    used_at     timestamptz,
    CONSTRAINT uq_verification_tokens_hash UNIQUE (token_hash),
    CONSTRAINT ck_verification_tokens_purpose
        CHECK (purpose IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'FEDERATED_LINK_CONFIRMATION'))
);

CREATE INDEX ix_verification_tokens_user_purpose
    ON verification_tokens (user_id, purpose) WHERE used_at IS NULL;

-- ---------------------------------------------------------------------------------------------
CREATE TABLE auth_attempts (
    id          uuid        PRIMARY KEY,
    email_hash  varchar(64) NOT NULL,
    portal      varchar(16) NOT NULL,
    ip_hash     varchar(64) NOT NULL,
    success     boolean     NOT NULL,
    occurred_at timestamptz NOT NULL,
    CONSTRAINT ck_auth_attempts_portal
        CHECK (portal IN ('CITIZEN', 'ADMIN', 'INSPECTOR', 'PLATFORM'))
);

COMMENT ON TABLE auth_attempts IS
    'Rate limiting and lockout state. Kept in PostgreSQL rather than in memory so the limit holds '
    'across every backend instance behind the load balancer (docs/ARCHITECTURE.md §7).';
COMMENT ON COLUMN auth_attempts.email_hash IS
    'SHA-256 of the lower-cased email: enough to count attempts, useless as a mailing list.';

-- Partial indexes: only failures are counted inside the sliding window.
CREATE INDEX ix_auth_attempts_email_window
    ON auth_attempts (email_hash, portal, occurred_at DESC) WHERE success = false;
CREATE INDEX ix_auth_attempts_ip_window
    ON auth_attempts (ip_hash, portal, occurred_at DESC) WHERE success = false;
CREATE INDEX ix_auth_attempts_occurred ON auth_attempts (occurred_at);
