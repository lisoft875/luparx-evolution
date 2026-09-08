-- =============================================================================================
-- V12_0 — CONTRACT.md "v0.3 — Cuenta, idiomas y operación de la municipalidad".
--
-- Numbered after V11_0 for the same reason V11_0 came after V10_0: out-of-order migration is off,
-- so a new file must sort AFTER everything an existing database has already applied. Nothing here
-- rewrites or drops a column another running version could still be reading — every change is
-- either a widening (a NOT NULL that becomes nullable, a CHECK that accepts one more value) or a
-- brand new table, so a rolling deployment is safe in both directions.
--
-- What arrives here:
--   refresh_tokens.expires_at         becomes NULLABLE: a session that never expires (v0.3 §2)
--   verification_tokens.new_email     the address a pending email change is moving TO
--   tenant_locales                    the languages a municipality offers, and its default
--   parking_space_formats             the shape of a bay code, per municipality
--   parking_schedules                 the charging timetable header (one row per municipality)
--   parking_schedule_slots            its bands, per weekday
--   parking_schedule_exceptions       dated exceptions (holidays), with or without their own bands
--   parking_schedule_exception_slots  the bands of an exception that charges on its own hours
--
-- No business data is inserted. Development fixtures stay in the `dev` seeders, and a municipality
-- that has configured nothing is answered from `platform.defaults.*` and materialised on first read.
-- =============================================================================================


-- ---------------------------------------------------------------------------------------------
-- A session that does not expire (CONTRACT.md v0.3, "Autenticación y cuenta" §2).
--
-- `expires_at` NULL means "this token has no expiry": the citizen stays signed in until something
-- actually revokes them. What still ends a session is unchanged and deliberate — logging out
-- (revoked_at), changing the password (credentials_version + a full revocation), and an
-- administrator blocking the account. Rotation and reuse detection are untouched: every refresh
-- still consumes its token and still revokes the whole family when a replayed one shows up.
--
-- The old CHECK is replaced rather than dropped: an expiry, when there is one, must still be in the
-- future relative to the moment the token was minted.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE refresh_tokens ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE refresh_tokens DROP CONSTRAINT ck_refresh_tokens_expiry;
ALTER TABLE refresh_tokens ADD CONSTRAINT ck_refresh_tokens_expiry
    CHECK (expires_at IS NULL OR expires_at > issued_at);

COMMENT ON COLUMN refresh_tokens.expires_at IS
    'When this token stops being accepted. NULL means never, which is what luparx.jwt.refresh-token-ttl = 0 '
    'produces. A NULL here is not an unbounded grant: logout, a password change and an administrative '
    'block all revoke, and rotation still replaces the row on every use.';


-- ---------------------------------------------------------------------------------------------
-- Changing the email address is changing the identity of access, so it goes through a token that is
-- sent to the NEW address and carries it (CONTRACT.md v0.3, "Perfil editable").
--
-- The address is held on the token and not on `users` on purpose: until the person proves they can
-- read the new mailbox, the account's address is still the old one, and an abandoned request must
-- leave no trace on the user row.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE verification_tokens ADD COLUMN new_email varchar(320);
ALTER TABLE verification_tokens DROP CONSTRAINT ck_verification_tokens_purpose;
ALTER TABLE verification_tokens ADD CONSTRAINT ck_verification_tokens_purpose
    CHECK (purpose IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'FEDERATED_LINK_CONFIRMATION', 'EMAIL_CHANGE'));
-- An EMAIL_CHANGE token without the address it moves to would be unusable; every other purpose has
-- no business carrying one.
ALTER TABLE verification_tokens ADD CONSTRAINT ck_verification_tokens_new_email
    CHECK ((purpose = 'EMAIL_CHANGE') = (new_email IS NOT NULL));

COMMENT ON COLUMN verification_tokens.new_email IS
    'For EMAIL_CHANGE only: the address the account will move to once this token is confirmed from '
    'that mailbox. NULL for every other purpose.';


-- ---------------------------------------------------------------------------------------------
-- tenant_locales — the languages a municipality offers and which one it defaults to.
--
-- A table and not a JSON setting because there are four independent facts per language (offered,
-- default, order, and the tag itself) and because the login screen reads this list before anybody is
-- authenticated: a queryable, constrained shape is worth more than a blob.
--
-- The resolution order stays deterministic and lives in ONE service: user preference → a locale this
-- municipality has enabled → this municipality's default → the platform default.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE tenant_locales (
    id         uuid        PRIMARY KEY,
    tenant_id  uuid        NOT NULL REFERENCES tenants (id),
    -- BCP 47 language tag ("es-CR", "en", "pt-BR"). Validated in the domain against the JDK's parser.
    locale     varchar(35) NOT NULL,
    enabled    boolean     NOT NULL DEFAULT true,
    is_default boolean     NOT NULL DEFAULT false,
    sort_order integer     NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    version    bigint      NOT NULL DEFAULT 0,
    CONSTRAINT uq_tenant_locales_tag UNIQUE (tenant_id, locale),
    CONSTRAINT ck_tenant_locales_tag CHECK (locale = btrim(locale) AND length(locale) BETWEEN 2 AND 35),
    CONSTRAINT ck_tenant_locales_sort CHECK (sort_order >= 0),
    -- A default nobody can pick would be a dead end for every user of this municipality.
    CONSTRAINT ck_tenant_locales_default_enabled CHECK (enabled OR NOT is_default)
);

COMMENT ON TABLE tenant_locales IS
    'Languages a municipality offers in its portals. The interface shows this list as a dropdown, '
    'not a two-state pill: a platform serving several countries has more than two languages.';
COMMENT ON COLUMN tenant_locales.is_default IS
    'The language this municipality falls back to. At most one row per tenant, enforced by a partial '
    'unique index; a tenant with no row at all is answered from tenants.locale.';
COMMENT ON COLUMN tenant_locales.sort_order IS
    'Order the dropdown shows them in. Configuration, not alphabetical luck.';

CREATE UNIQUE INDEX uq_tenant_locales_default ON tenant_locales (tenant_id) WHERE is_default;
CREATE INDEX ix_tenant_locales_tenant ON tenant_locales (tenant_id, sort_order);


-- ---------------------------------------------------------------------------------------------
-- parking_space_formats — the shape of a bay code, decided by the municipality that paints it.
--
-- `pattern` is the effective regular expression and is the ONLY thing the server validates against;
-- `prefix`, `digits` and `allow_letters` are the parts an administrator edits in a form, from which
-- the pattern is derived when they do not write one themselves. `example` is what the app shows as a
-- placeholder, and it is verified to match its own pattern before the row is written — an example
-- that its own rule rejects would teach every citizen the wrong code.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE parking_space_formats (
    tenant_id     uuid         PRIMARY KEY REFERENCES tenants (id),
    prefix        varchar(8)   NOT NULL DEFAULT '',
    digits        integer      NOT NULL,
    allow_letters boolean      NOT NULL DEFAULT false,
    pattern       varchar(200) NOT NULL,
    example       varchar(32)  NOT NULL,
    created_at    timestamptz  NOT NULL,
    updated_at    timestamptz  NOT NULL,
    version       bigint       NOT NULL DEFAULT 0,
    -- A code has to fit on a sign and in parking_spaces.code, which is varchar(16).
    CONSTRAINT ck_parking_space_formats_digits CHECK (digits BETWEEN 1 AND 12),
    CONSTRAINT ck_parking_space_formats_prefix CHECK (prefix = btrim(prefix) AND prefix !~ '[^A-Z0-9-]'),
    CONSTRAINT ck_parking_space_formats_pattern CHECK (length(btrim(pattern)) > 0),
    CONSTRAINT ck_parking_space_formats_example CHECK (
        example = btrim(example) AND length(example) BETWEEN 1 AND 16)
);

COMMENT ON TABLE parking_space_formats IS
    'How a bay code looks in ONE municipality. The server validates every code it is given — creating '
    'a bay and starting a session — against this row; the app uses `example` as the placeholder and '
    '`pattern` to validate while the citizen types. San José starts on four plain digits, 0001-5000.';
COMMENT ON COLUMN parking_space_formats.pattern IS
    'Effective regular expression, anchored. Written in the portable subset both Java and JavaScript '
    'read the same way, because the same string validates on the server and in the browser.';


-- ---------------------------------------------------------------------------------------------
-- parking_schedules — WHEN a municipality charges (CONTRACT.md v0.3, "Horario de cobro").
--
-- Three tables and not one: the header carries the flag that overrides everything
-- (`charges_all_day`), the bands are many per weekday, and a dated exception may either suspend
-- charging entirely or replace the bands for that one day.
--
-- Everything is evaluated in the municipality's own time zone (`tenants.time_zone`), never in the
-- device's. A band is stored as LOCAL WALL-CLOCK minutes from midnight, and an exception as a local
-- date, precisely because "we charge from seven to six" is a statement about local time that must
-- survive a change of offset: storing them as instants would move the opening hour every time a
-- country changes its rules.
--
-- Minutes from midnight rather than a `time` column, and the reason is concrete: a band has to be
-- able to end AT midnight. PostgreSQL would take `time '24:00:00'`, but java.time.LocalTime has no
-- such value — its maximum is 23:59:59.999999999 — so a `time` column would quietly lose the last
-- minute of every night on the way into the domain. 0..1440 says it without ceremony.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE parking_schedules (
    tenant_id       uuid        PRIMARY KEY REFERENCES tenants (id),
    charges_all_day boolean     NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL,
    updated_at      timestamptz NOT NULL,
    version         bigint      NOT NULL DEFAULT 0
);

COMMENT ON TABLE parking_schedules IS
    'Charging timetable of one municipality. Only the minutes that fall inside a band are charged: a '
    'stay from 17:30 to 19:00 where charging closes at 18:00 pays thirty minutes, not ninety.';
COMMENT ON COLUMN parking_schedules.charges_all_day IS
    'When true the municipality charges around the clock and every band and exception is ignored. It '
    'is a switch, not a shortcut for "a band from 00:00 to 24:00", so an administrator can turn it '
    'off and get their old bands back untouched.';

CREATE TABLE parking_schedule_slots (
    id         uuid        PRIMARY KEY,
    tenant_id  uuid        NOT NULL REFERENCES parking_schedules (tenant_id) ON DELETE CASCADE,
    -- ISO-8601 weekday: 1 = Monday .. 7 = Sunday, the same numbering java.time.DayOfWeek uses.
    weekday      smallint    NOT NULL,
    start_minute integer     NOT NULL,
    end_minute   integer     NOT NULL,
    created_at   timestamptz NOT NULL,
    CONSTRAINT ck_parking_schedule_slots_weekday CHECK (weekday BETWEEN 1 AND 7),
    -- A band that ends when it starts charges nothing; one that ends before it starts is a typo.
    -- Crossing midnight is expressed as two bands, one per day, so a band never wraps.
    CONSTRAINT ck_parking_schedule_slots_window CHECK (
        start_minute >= 0 AND end_minute <= 1440 AND end_minute > start_minute),
    CONSTRAINT uq_parking_schedule_slots UNIQUE (tenant_id, weekday, start_minute, end_minute)
);

COMMENT ON TABLE parking_schedule_slots IS
    'Charging bands per weekday. A weekday with no band is a day this municipality does not charge — '
    'by default Sunday. A band never crosses midnight: a night tariff is two bands, which keeps the '
    'intersection arithmetic honest and every band comparable inside its own day.';

CREATE INDEX ix_parking_schedule_slots_tenant ON parking_schedule_slots (tenant_id, weekday, start_minute);

CREATE TABLE parking_schedule_exceptions (
    id              uuid        PRIMARY KEY,
    tenant_id       uuid        NOT NULL REFERENCES parking_schedules (tenant_id) ON DELETE CASCADE,
    exception_date  date        NOT NULL,
    -- false = a holiday: nothing is charged that day, whatever the weekday bands say.
    charges         boolean     NOT NULL DEFAULT false,
    -- true = that day is charged around the clock; the exception's own bands are then ignored.
    charges_all_day boolean     NOT NULL DEFAULT false,
    label           varchar(120),
    created_at      timestamptz NOT NULL,
    CONSTRAINT uq_parking_schedule_exceptions UNIQUE (tenant_id, exception_date),
    CONSTRAINT ck_parking_schedule_exceptions_all_day CHECK (charges OR NOT charges_all_day)
);

COMMENT ON TABLE parking_schedule_exceptions IS
    'Dated overrides of the weekly timetable: public holidays that suspend charging, and the odd day '
    'that is charged on hours of its own. One row per date per municipality.';
COMMENT ON COLUMN parking_schedule_exceptions.label IS
    'Tenant content shown to operators ("Día de la Independencia"). Never a translated label: the '
    'name of a local holiday is a proper noun, not an i18n key.';

CREATE INDEX ix_parking_schedule_exceptions_tenant
    ON parking_schedule_exceptions (tenant_id, exception_date);

CREATE TABLE parking_schedule_exception_slots (
    id           uuid        PRIMARY KEY,
    tenant_id    uuid        NOT NULL REFERENCES parking_schedules (tenant_id) ON DELETE CASCADE,
    exception_id uuid        NOT NULL REFERENCES parking_schedule_exceptions (id) ON DELETE CASCADE,
    start_minute integer     NOT NULL,
    end_minute   integer     NOT NULL,
    created_at   timestamptz NOT NULL,
    CONSTRAINT ck_parking_schedule_exception_slots_window CHECK (
        start_minute >= 0 AND end_minute <= 1440 AND end_minute > start_minute),
    CONSTRAINT uq_parking_schedule_exception_slots UNIQUE (exception_id, start_minute, end_minute)
);

COMMENT ON TABLE parking_schedule_exception_slots IS
    'Bands of an exception that is charged on its own hours. An exception with charges = true and no '
    'band of its own falls back to the weekday bands.';

CREATE INDEX ix_parking_schedule_exception_slots_exception
    ON parking_schedule_exception_slots (exception_id, start_minute);
