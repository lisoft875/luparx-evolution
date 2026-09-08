-- =============================================================================================
-- V11_0 — module-parking: the parking domain of CONTRACT.md "v0.2 — Dominio de parqueo".
--
-- Numbered after V10_0 on purpose. Out-of-order migration is off, so a new file must sort AFTER
-- everything an existing database has already applied; numbering by layer would force every
-- developer and every environment to recreate their database (backend/README.md, "Migration
-- numbering").
--
-- What arrives here:
--   vehicles                      the cars a citizen registers, with the plate normalised
--   parking_policies              one row per municipality: every rule of the flow, as data
--   parking_sessions              a paid stay on one bay, by one vehicle
--   parking_session_extensions    each extension of a session, with what it cost
--   wallet_accounts               per-tenant balance of a citizen (money is per municipality)
--   wallet_transactions           the ledger behind that balance
--   parking_time_credits          per-tenant minutes a citizen has to their favour
--   parking_time_credit_entries   the lots those minutes come in, and their expiry
--
-- Conventions this file keeps, all of them already fixed by earlier migrations:
--   * money is amount_minor bigint + currency_code char(3) — never a floating-point type (ADR 0009)
--   * every tenant-owned table carries tenant_id NOT NULL with a foreign key (docs/DATA_MODEL.md §3)
--   * timestamps are timestamptz and always UTC (CONTRACT.md §7)
--   * a CHECK exists wherever an invariant can be stated in the schema: application validation is
--     necessary and never sufficient, because a job, a console or a future service also writes here
--
-- No business data is inserted. Development fixtures are written by DevParkingSeeder under the
-- `dev` profile.
-- =============================================================================================


-- ---------------------------------------------------------------------------------------------
-- vehicles — a car a citizen registered.
--
-- A vehicle belongs to a PERSON, not to a municipality: users are global (CONTRACT.md §1) and the
-- same car is driven to two municipalities on the same day. That is why there is no tenant_id here.
-- What is per tenant is the session, the money and the minutes.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE vehicles (
    id               uuid        PRIMARY KEY,
    user_id          uuid        NOT NULL REFERENCES users (id),
    -- As the citizen typed it, so the app can show it back the way they wrote it.
    plate            varchar(16) NOT NULL,
    -- Upper case, no spaces, no hyphens. This is what is compared and indexed.
    plate_normalized varchar(16) NOT NULL,
    -- The nickname the owner gives the car ("el carro de mamá"); optional, like everything but the plate.
    name             varchar(80),
    brand            varchar(80),
    model            varchar(80),
    year             integer,
    is_owner         boolean     NOT NULL DEFAULT true,
    is_primary       boolean     NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL,
    updated_at       timestamptz NOT NULL,
    version          bigint      NOT NULL DEFAULT 0,
    -- THE uniqueness rule of this table. See the table comment below: it is per user, never global.
    CONSTRAINT uq_vehicles_user_plate UNIQUE (user_id, plate_normalized),
    CONSTRAINT ck_vehicles_plate CHECK (plate = btrim(plate) AND length(plate) BETWEEN 1 AND 16),
    CONSTRAINT ck_vehicles_plate_normalized CHECK (
        plate_normalized = upper(plate_normalized)
        AND plate_normalized !~ '[^A-Z0-9]'
        AND length(plate_normalized) BETWEEN 1 AND 16),
    -- A plausible model year, not a validation of the vehicle registry. 1885 is the Benz Patent-Motorwagen.
    CONSTRAINT ck_vehicles_year CHECK (year IS NULL OR year BETWEEN 1885 AND 2200)
);

COMMENT ON TABLE vehicles IS
    'Vehicles registered by a citizen. Uniqueness is (user_id, plate_normalized) and NOT the plate '
    'alone: two different people registering the same plate is a LEGITIMATE and expected case — a '
    'shared family car, a company car driven by several employees, a plate reused after a transfer. '
    'A global unique index here would lock the first registrant in and lock everyone else out, so it '
    'must never be added. The consequence is that a lookup by plate can return several people; that '
    'ambiguity is resolved in the parking session (zone + space), not in this table.';
COMMENT ON COLUMN vehicles.plate_normalized IS
    'Upper case with every separator removed. Normalising on write is what makes "SJ-1234", '
    '"sj 1234" and "SJ1234" the same plate for lookup while vehicles.plate keeps what was typed.';
COMMENT ON COLUMN vehicles.is_owner IS
    'The citizen declares whether they own the car. It is a declaration, not a verified fact: the '
    'platform does not read a vehicle registry, and a driver who is not the owner still parks.';
COMMENT ON COLUMN vehicles.is_primary IS
    'The car offered first when starting a session. At most one per user, enforced by a partial '
    'unique index rather than by application code alone.';

-- The inspector types a plate and needs every match, across users. Its own index, because the query
-- does not carry a user_id — see the TODO in ParkingSessionRepository about the ambiguity this
-- creates and who is expected to resolve it.
CREATE INDEX ix_vehicles_plate_normalized ON vehicles (plate_normalized);
CREATE INDEX ix_vehicles_user ON vehicles (user_id);
CREATE UNIQUE INDEX uq_vehicles_primary ON vehicles (user_id) WHERE is_primary;


-- ---------------------------------------------------------------------------------------------
-- parking_policies — one row per municipality. Every rule of the citizen flow lives here as DATA.
--
-- The increments are stored as a canonical comma-separated list of positive integers ("30,60,120")
-- rather than as an array or a child table. The reasons, in order: the value is read as a whole and
-- never queried by element; a text column maps to the same Java type on every JPA provider without a
-- vendor-specific array type; and a CHECK can state the whole format. If a future requirement needs
-- per-increment metadata (a label, a discount), it becomes a child table then, through an
-- expand-and-contract migration.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE parking_policies (
    tenant_id                      uuid         PRIMARY KEY REFERENCES tenants (id),
    session_increments_minutes     varchar(200) NOT NULL,
    session_min_minutes            integer      NOT NULL,
    session_max_minutes            integer      NOT NULL,
    extension_enabled              boolean      NOT NULL DEFAULT true,
    extension_increments_minutes   varchar(200) NOT NULL DEFAULT '',
    extension_max_total_minutes    integer      NOT NULL,
    early_finish_enabled           boolean      NOT NULL DEFAULT true,
    credit_on_early_finish_enabled boolean      NOT NULL DEFAULT true,
    credit_min_remaining_minutes   integer      NOT NULL DEFAULT 0,
    credit_expiry_days             integer      NOT NULL DEFAULT 0,
    grace_minutes                  integer      NOT NULL DEFAULT 0,
    created_at                     timestamptz  NOT NULL,
    updated_at                     timestamptz  NOT NULL,
    version                        bigint       NOT NULL DEFAULT 0,
    CONSTRAINT ck_parking_policies_session_increments CHECK (
        session_increments_minutes ~ '^[1-9][0-9]{0,3}(,[1-9][0-9]{0,3})*$'),
    -- Empty is legitimate: a municipality that does not offer extensions has no list to offer.
    CONSTRAINT ck_parking_policies_extension_increments CHECK (
        extension_increments_minutes = ''
        OR extension_increments_minutes ~ '^[1-9][0-9]{0,3}(,[1-9][0-9]{0,3})*$'),
    CONSTRAINT ck_parking_policies_session_bounds CHECK (
        session_min_minutes > 0 AND session_max_minutes >= session_min_minutes),
    CONSTRAINT ck_parking_policies_extension_total CHECK (
        extension_max_total_minutes >= session_max_minutes),
    CONSTRAINT ck_parking_policies_credit_min CHECK (credit_min_remaining_minutes >= 0),
    CONSTRAINT ck_parking_policies_credit_expiry CHECK (credit_expiry_days >= 0),
    CONSTRAINT ck_parking_policies_grace CHECK (grace_minutes >= 0),
    -- Offering to credit minutes while extensions are the only way to use them would be incoherent
    -- only if early finish were off; that is the one combination that cannot mean anything.
    CONSTRAINT ck_parking_policies_credit_requires_early_finish CHECK (
        early_finish_enabled OR NOT credit_on_early_finish_enabled)
);

COMMENT ON TABLE parking_policies IS
    'The parking rules of one municipality, as configuration. Nothing in this table has a constant '
    'counterpart in Java: the offered increments, the caps, whether time may be extended or finished '
    'early and what happens to the remaining minutes are decisions of the municipality, and a second '
    'municipality with different rules is a row, not a branch in the code.';
COMMENT ON COLUMN parking_policies.session_increments_minutes IS
    'Canonical comma-separated list of positive minute options offered when starting, e.g. '
    '"30,60,120". A value outside this list is refused with INVALID_INCREMENT — never rounded to the '
    'nearest offered one, because silently charging for something other than what was asked for is '
    'worse than an error.';
COMMENT ON COLUMN parking_policies.extension_max_total_minutes IS
    'Cap on session minutes + every extension. Never below session_max_minutes, or a session started '
    'at the maximum would be born over the cap.';
COMMENT ON COLUMN parking_policies.credit_expiry_days IS
    'Days a credited minute stays usable. 0 means it never expires.';
COMMENT ON COLUMN parking_policies.grace_minutes IS
    'Tolerance after expires_at before a session counts as expired, for the inspector and for the '
    'lazy expiry that frees a bay.';


-- ---------------------------------------------------------------------------------------------
-- parking_sessions — one paid stay, one vehicle, one bay.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE parking_sessions (
    id                     uuid        PRIMARY KEY,
    tenant_id              uuid        NOT NULL REFERENCES tenants (id),
    user_id                uuid        NOT NULL REFERENCES users (id),
    vehicle_id             uuid        NOT NULL REFERENCES vehicles (id),
    -- A copy, not a join: see the column comment.
    plate_snapshot         varchar(16) NOT NULL,
    zone_id                uuid        NOT NULL REFERENCES parking_zones (id),
    space_id               uuid        NOT NULL REFERENCES parking_spaces (id),
    started_at             timestamptz NOT NULL,
    expires_at             timestamptz NOT NULL,
    ended_at               timestamptz,
    status                 varchar(32) NOT NULL,
    -- What the citizen actually paid in money, across the start and every extension.
    amount_minor           bigint      NOT NULL DEFAULT 0,
    currency_code          char(3)     NOT NULL,
    -- Minutes taken from the citizen's credit instead of being charged, across the whole session.
    credit_minutes_applied integer     NOT NULL DEFAULT 0,
    created_at             timestamptz NOT NULL,
    updated_at             timestamptz NOT NULL,
    version                bigint      NOT NULL DEFAULT 0,
    CONSTRAINT ck_parking_sessions_status CHECK (status IN ('ACTIVE', 'FINISHED', 'EXPIRED')),
    -- A session always covers a positive stretch of time, at the start and after every extension.
    CONSTRAINT ck_parking_sessions_window CHECK (expires_at > started_at),
    CONSTRAINT ck_parking_sessions_ended CHECK (ended_at IS NULL OR ended_at >= started_at),
    -- An ACTIVE session has not ended; a FINISHED one has. EXPIRED is reached by the clock, so it
    -- may carry the moment it was observed or nothing at all.
    CONSTRAINT ck_parking_sessions_active_open CHECK (status <> 'ACTIVE' OR ended_at IS NULL),
    CONSTRAINT ck_parking_sessions_finished_closed CHECK (status <> 'FINISHED' OR ended_at IS NOT NULL),
    CONSTRAINT ck_parking_sessions_amount CHECK (amount_minor >= 0),
    CONSTRAINT ck_parking_sessions_credit CHECK (credit_minutes_applied >= 0),
    CONSTRAINT ck_parking_sessions_currency CHECK (currency_code = upper(currency_code)),
    CONSTRAINT ck_parking_sessions_plate CHECK (
        plate_snapshot = upper(plate_snapshot) AND plate_snapshot !~ '[^A-Z0-9]')
);

COMMENT ON TABLE parking_sessions IS
    'A paid stay of one vehicle on one bay of one municipality. Money and minutes are per tenant: '
    'what one municipality charged, another one cannot spend.';
COMMENT ON COLUMN parking_sessions.plate_snapshot IS
    'The normalised plate AS IT WAS when the session started. Copied on purpose rather than joined: '
    'the inspector verifies against what was painted on the car at that moment, not against what the '
    'citizen edited afterwards. Correcting a typo in a vehicle must never rewrite history.';
COMMENT ON COLUMN parking_sessions.status IS
    'ACTIVE while the stay is running, FINISHED when the citizen closed it, EXPIRED when the clock '
    'ran out past the policy grace. Only ACTIVE holds the bay.';
COMMENT ON COLUMN parking_sessions.amount_minor IS
    'Total money charged for this session, start plus extensions, in minor units. Never negative: '
    'money is not refunded, remaining minutes come back as credit (CONTRACT.md v0.2, rule 5).';

-- THE two invariants of the domain, stated where they cannot be worked around. Partial indexes:
-- a bay may hold any number of finished sessions and only ever one running one.
CREATE UNIQUE INDEX uq_parking_sessions_active_space ON parking_sessions (space_id)
    WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX uq_parking_sessions_active_vehicle ON parking_sessions (vehicle_id)
    WHERE status = 'ACTIVE';

COMMENT ON INDEX uq_parking_sessions_active_space IS
    'One running session per bay. A second one is SPACE_OCCUPIED, and two replicas racing on the '
    'same bay lose the race here rather than in application memory.';
COMMENT ON INDEX uq_parking_sessions_active_vehicle IS
    'One running session per vehicle, across municipalities: a car is in one place at a time. A '
    'citizen may still have several sessions at once, one per vehicle (CONTRACT.md v0.2, rule 1).';

CREATE INDEX ix_parking_sessions_tenant_user ON parking_sessions (tenant_id, user_id, started_at DESC);
CREATE INDEX ix_parking_sessions_tenant_status ON parking_sessions (tenant_id, status, expires_at);
-- The inspector's lookup: plate, inside this municipality, running now.
CREATE INDEX ix_parking_sessions_tenant_plate ON parking_sessions (tenant_id, plate_snapshot, status);
CREATE INDEX ix_parking_sessions_space ON parking_sessions (space_id, started_at DESC);


-- ---------------------------------------------------------------------------------------------
-- parking_session_extensions — each extension, with what it cost and which request created it.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE parking_session_extensions (
    id                     uuid         PRIMARY KEY,
    tenant_id              uuid         NOT NULL REFERENCES tenants (id),
    session_id             uuid         NOT NULL REFERENCES parking_sessions (id),
    minutes                integer      NOT NULL,
    amount_minor           bigint       NOT NULL DEFAULT 0,
    currency_code          char(3)      NOT NULL,
    credit_minutes_applied integer      NOT NULL DEFAULT 0,
    extended_at            timestamptz  NOT NULL,
    -- The Idempotency-Key of the request that created this row (ADR 0012). Kept for the audit trail:
    -- replay protection itself is the filter's job, not this column's.
    idempotency_key        varchar(200),
    CONSTRAINT ck_parking_session_extensions_minutes CHECK (minutes > 0),
    CONSTRAINT ck_parking_session_extensions_amount CHECK (amount_minor >= 0),
    CONSTRAINT ck_parking_session_extensions_credit CHECK (credit_minutes_applied >= 0),
    CONSTRAINT ck_parking_session_extensions_currency CHECK (currency_code = upper(currency_code))
);

COMMENT ON TABLE parking_session_extensions IS
    'One row per extension of a session. The session keeps the totals; this is where the individual '
    'charges can be read back when a citizen asks what they paid for.';

CREATE INDEX ix_parking_session_extensions_session
    ON parking_session_extensions (session_id, extended_at);
CREATE UNIQUE INDEX uq_parking_session_extensions_key
    ON parking_session_extensions (session_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;


-- ---------------------------------------------------------------------------------------------
-- wallet_accounts / wallet_transactions — the citizen's money, per municipality.
--
-- There is no global balance by contract (CONTRACT.md v0.2, rule 6): finance is per tenant, so the
-- account is keyed by (tenant_id, user_id) and carries the municipality's currency.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE wallet_accounts (
    id            uuid        PRIMARY KEY,
    tenant_id     uuid        NOT NULL REFERENCES tenants (id),
    user_id       uuid        NOT NULL REFERENCES users (id),
    balance_minor bigint      NOT NULL DEFAULT 0,
    currency_code char(3)     NOT NULL,
    created_at    timestamptz NOT NULL,
    updated_at    timestamptz NOT NULL,
    version       bigint      NOT NULL DEFAULT 0,
    CONSTRAINT uq_wallet_accounts_tenant_user UNIQUE (tenant_id, user_id),
    -- A prepaid balance never goes negative. Overdraft would be a credit product with its own rules.
    CONSTRAINT ck_wallet_accounts_balance CHECK (balance_minor >= 0),
    CONSTRAINT ck_wallet_accounts_currency CHECK (currency_code = upper(currency_code))
);

COMMENT ON TABLE wallet_accounts IS
    'Prepaid balance of one citizen in one municipality. The balance is the authoritative figure and '
    'is written in the same transaction as the movement that changed it; wallet_transactions is the '
    'ledger that explains it.';

CREATE TABLE wallet_transactions (
    id                  uuid         PRIMARY KEY,
    tenant_id           uuid         NOT NULL REFERENCES tenants (id),
    account_id          uuid         NOT NULL REFERENCES wallet_accounts (id),
    user_id             uuid         NOT NULL REFERENCES users (id),
    type                varchar(32)  NOT NULL,
    -- SIGNED: negative is money leaving the wallet. There is no ck_..._amount >= 0 here, and that
    -- asymmetry with parking_rates is deliberate.
    amount_minor        bigint       NOT NULL,
    currency_code       char(3)      NOT NULL,
    balance_after_minor bigint       NOT NULL,
    session_id          uuid         REFERENCES parking_sessions (id),
    idempotency_key     varchar(200),
    created_at          timestamptz  NOT NULL,
    CONSTRAINT ck_wallet_transactions_type CHECK (
        type IN ('TOP_UP', 'SESSION_CHARGE', 'EXTENSION_CHARGE', 'ADJUSTMENT')),
    CONSTRAINT ck_wallet_transactions_amount CHECK (amount_minor <> 0),
    CONSTRAINT ck_wallet_transactions_sign CHECK (
        (type = 'TOP_UP' AND amount_minor > 0)
        OR (type IN ('SESSION_CHARGE', 'EXTENSION_CHARGE') AND amount_minor < 0)
        OR type = 'ADJUSTMENT'),
    CONSTRAINT ck_wallet_transactions_balance_after CHECK (balance_after_minor >= 0),
    CONSTRAINT ck_wallet_transactions_currency CHECK (currency_code = upper(currency_code))
);

COMMENT ON TABLE wallet_transactions IS
    'Append-only ledger of the wallet. A row is never updated or deleted; a mistake is corrected by '
    'an ADJUSTMENT that says so.';
COMMENT ON COLUMN wallet_transactions.balance_after_minor IS
    'Balance right after this movement. Redundant with wallet_accounts by design: it is what makes a '
    'statement readable and a reconciliation possible without replaying the whole ledger.';

CREATE INDEX ix_wallet_transactions_account ON wallet_transactions (account_id, created_at DESC);
CREATE INDEX ix_wallet_transactions_tenant_user
    ON wallet_transactions (tenant_id, user_id, created_at DESC);
CREATE INDEX ix_wallet_transactions_session ON wallet_transactions (session_id);


-- ---------------------------------------------------------------------------------------------
-- parking_time_credits / parking_time_credit_entries — minutes to the citizen's favour.
--
-- Minutes are NOT money: they are earned by finishing early, they are spent first on the next
-- session in the SAME municipality, they expire, and they are never converted back into a balance
-- (CONTRACT.md v0.2, rule 5).
--
-- The entries are lots, not just movements: a positive entry carries how many of its minutes are
-- still unspent, so minutes can be consumed oldest-expiry-first and an expiry can be applied to the
-- exact minutes that expired instead of to an undifferentiated pool.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE parking_time_credits (
    id              uuid        PRIMARY KEY,
    tenant_id       uuid        NOT NULL REFERENCES tenants (id),
    user_id         uuid        NOT NULL REFERENCES users (id),
    balance_minutes integer     NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL,
    updated_at      timestamptz NOT NULL,
    version         bigint      NOT NULL DEFAULT 0,
    CONSTRAINT uq_parking_time_credits_tenant_user UNIQUE (tenant_id, user_id),
    CONSTRAINT ck_parking_time_credits_balance CHECK (balance_minutes >= 0)
);

COMMENT ON TABLE parking_time_credits IS
    'Minutes a citizen has to their favour in ONE municipality. Per tenant by contract: what one '
    'municipality charged, another one cannot let you spend.';

CREATE TABLE parking_time_credit_entries (
    id                uuid        PRIMARY KEY,
    tenant_id         uuid        NOT NULL REFERENCES tenants (id),
    credit_id         uuid        NOT NULL REFERENCES parking_time_credits (id),
    user_id           uuid        NOT NULL REFERENCES users (id),
    source            varchar(32) NOT NULL,
    -- SIGNED: positive is a lot of minutes granted, negative is minutes spent or expired.
    minutes           integer     NOT NULL,
    -- How much of a positive lot is still unspent. Always 0 on a negative entry.
    remaining_minutes integer     NOT NULL DEFAULT 0,
    session_id        uuid        REFERENCES parking_sessions (id),
    -- NULL means these minutes never expire (policy credit_expiry_days = 0).
    expires_at        timestamptz,
    created_at        timestamptz NOT NULL,
    CONSTRAINT ck_parking_time_credit_entries_source CHECK (
        source IN ('EARLY_FINISH', 'SESSION_START', 'EXTENSION', 'EXPIRY', 'ADJUSTMENT')),
    CONSTRAINT ck_parking_time_credit_entries_minutes CHECK (minutes <> 0),
    CONSTRAINT ck_parking_time_credit_entries_remaining CHECK (
        remaining_minutes >= 0 AND remaining_minutes <= greatest(minutes, 0))
);

COMMENT ON TABLE parking_time_credit_entries IS
    'Movements of the minute balance. A positive row is a lot with its own expiry and its own '
    'remaining_minutes; a negative row records minutes spent on a session or swept by expiry.';
COMMENT ON COLUMN parking_time_credit_entries.expires_at IS
    'When this lot stops being usable. NULL means never, which is what a policy with '
    'credit_expiry_days = 0 produces.';

CREATE INDEX ix_parking_time_credit_entries_credit
    ON parking_time_credit_entries (credit_id, created_at DESC);
-- The consumption query: live lots of this citizen, soonest expiry first.
CREATE INDEX ix_parking_time_credit_entries_open
    ON parking_time_credit_entries (credit_id, expires_at)
    WHERE remaining_minutes > 0;
