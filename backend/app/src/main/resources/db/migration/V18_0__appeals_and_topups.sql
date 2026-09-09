-- =============================================================================================
-- V18_0 — the citizen's defence, and how money gets into a wallet.
--
-- Three things arrive together because they are what a citizen actually needs after v0.7: a way to
-- challenge a citation with words and photographs, a legal notice that the municipality controls and
-- that we can prove they were shown, and a way to put money in the wallet at a counter.
--
-- Numbered after V17_0 for the usual reason: out-of-order migration is off, so a new file must sort
-- after everything an existing database has already applied. Everything here is additive — new tables
-- and new nullable columns with defaults — so a running instance of the previous version keeps
-- working against this schema (rolling deploy safe).
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- The legal notice shown before writing a defence.
--
-- WHY A TABLE AND NOT A TRANSLATION KEY. This text warns a citizen that insulting a public official
-- can be a crime. It is a legal statement about a specific jurisdiction, it will be rewritten by the
-- municipality's own lawyer, and the day somebody argues "nobody warned me" the only answer that
-- counts is "this exact text, this version, accepted at this moment". A message key in a properties
-- file has no version, no effective date, cannot be edited without a deployment, and leaves no record
-- of what the person actually read.
--
-- WHY TWO SCOPES. A row belongs either to one municipality or to a country. The country row is the
-- default every municipality of that country inherits — the penal code is national, so writing it
-- once is right — and a municipality that has its own counsel overrides it without waiting for us.
-- Resolution is: the municipality's newest effective version for the locale, else the country's.
--
-- VERSIONS ARE NEVER EDITED. A change inserts a new version; `citation_appeals` points at the exact
-- row the citizen accepted, so old defences keep quoting the text that was actually on screen.
CREATE TABLE appeal_notices (
    id             uuid        PRIMARY KEY,
    tenant_id      uuid        REFERENCES tenants (id),
    country_code   varchar(2)  REFERENCES countries (code),
    locale         varchar(35) NOT NULL,
    version        integer     NOT NULL,
    body           text        NOT NULL,
    effective_from timestamptz NOT NULL,
    created_at     timestamptz NOT NULL,
    created_by     uuid        REFERENCES users (id),
    -- Exactly one scope. A row that is both, or neither, has no defined precedence.
    CONSTRAINT ck_appeal_notices_scope CHECK (
        (tenant_id IS NOT NULL AND country_code IS NULL)
        OR (tenant_id IS NULL AND country_code IS NOT NULL)),
    CONSTRAINT ck_appeal_notices_version CHECK (version >= 1),
    CONSTRAINT ck_appeal_notices_body CHECK (length(btrim(body)) > 0)
);

CREATE UNIQUE INDEX uq_appeal_notices_tenant ON appeal_notices (tenant_id, locale, version)
    WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX uq_appeal_notices_country ON appeal_notices (country_code, locale, version)
    WHERE country_code IS NOT NULL;

COMMENT ON TABLE appeal_notices IS
    'Versioned legal notice shown before a citizen writes a defence. Editable by the municipality '
    'from the admin portal; a change is a new version, never an edit, because citation_appeals '
    'records which version the person accepted.';

-- The Costa Rican default, seeded once at country scope so every municipality of the country starts
-- with something legally meaningful instead of an empty screen.
--
-- *** THIS WORDING MUST BE REVIEWED AND APPROVED BY THE CLIENT'S LAWYER BEFORE PRODUCTION. ***
-- We are not their legal counsel. The text lives in this table, and not in the code, precisely so
-- that their lawyer can correct it from the admin portal without a deployment.
INSERT INTO appeal_notices (id, tenant_id, country_code, locale, version, body, effective_from, created_at)
SELECT
    '01a08400-0000-7000-8000-000000000001'::uuid,
    NULL,
    'CR',
    'es-CR',
    1,
    'Al presentar este descargo usted declara que la informacion y las imagenes que aporta son ' ||
    'veraces. Exprese su inconformidad con respeto: las expresiones injuriosas, difamatorias o ' ||
    'calumniosas contra un funcionario publico pueden constituir delito conforme a los articulos ' ||
    '145 a 147 del Codigo Penal de Costa Rica (Ley N.o 4573). Su descargo sera revisado por la ' ||
    'municipalidad y usted recibira la resolucion con su motivo.',
    timestamptz '2026-01-01 00:00:00+00',
    now()
WHERE EXISTS (SELECT 1 FROM countries WHERE code = 'CR');

-- ---------------------------------------------------------------------------------------------
-- Per-municipality enforcement settings. One column today, and a table rather than a constant
-- because "how many photographs a defence may carry" is a decision of the municipality that runs the
-- counter, not of whoever deploys the platform. The hard size limit per image is the opposite: it
-- protects the deployment, so it stays in configuration (luparx.enforcement.*).
CREATE TABLE enforcement_settings (
    tenant_id         uuid        PRIMARY KEY REFERENCES tenants (id),
    appeal_max_images integer     NOT NULL DEFAULT 4,
    created_at        timestamptz NOT NULL,
    updated_at        timestamptz NOT NULL,
    version           bigint      NOT NULL DEFAULT 0,
    CONSTRAINT ck_enforcement_settings_images CHECK (appeal_max_images BETWEEN 0 AND 20)
);

COMMENT ON COLUMN enforcement_settings.appeal_max_images IS
    'How many photographs one defence may carry. Zero is legal and means "text only", which is a '
    'municipality''s decision to make, not ours.';

-- ---------------------------------------------------------------------------------------------
-- The defence itself.
CREATE TABLE citation_appeals (
    id                uuid         PRIMARY KEY,
    tenant_id         uuid         NOT NULL REFERENCES tenants (id),
    citation_id       uuid         NOT NULL REFERENCES citations (id),
    -- Who wrote it. A reference, never a copy of their data.
    user_id           uuid         NOT NULL REFERENCES users (id),
    body              varchar(4000) NOT NULL,
    status            varchar(16)  NOT NULL,
    submitted_at      timestamptz  NOT NULL,
    resolved_at       timestamptz,
    resolved_by       uuid         REFERENCES users (id),
    resolution_reason varchar(1000),
    -- Which exact version of the legal notice was on screen when they pressed send. Without this the
    -- notice is decoration.
    notice_id         uuid         NOT NULL REFERENCES appeal_notices (id),
    notice_version    integer      NOT NULL,
    created_at        timestamptz  NOT NULL,
    updated_at        timestamptz  NOT NULL,
    version           bigint       NOT NULL DEFAULT 0,
    CONSTRAINT ck_citation_appeals_status CHECK (status IN ('SUBMITTED', 'ACCEPTED', 'REJECTED')),
    CONSTRAINT ck_citation_appeals_body CHECK (length(btrim(body)) > 0),
    -- A resolution is a decision plus its reason; half of one is not a resolution.
    CONSTRAINT ck_citation_appeals_resolution CHECK (
        (status = 'SUBMITTED' AND resolved_at IS NULL AND resolved_by IS NULL AND resolution_reason IS NULL)
        OR (status <> 'SUBMITTED' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL
            AND length(btrim(resolution_reason)) > 0))
);

-- One defence per citation. A citizen who wants to add something files nothing new: the municipality
-- resolves what was filed, and a second attempt on a citation already under appeal is a conflict,
-- not a second case with two possible outcomes.
CREATE UNIQUE INDEX uq_citation_appeals_citation ON citation_appeals (citation_id);
CREATE INDEX ix_citation_appeals_pending ON citation_appeals (tenant_id, submitted_at)
    WHERE status = 'SUBMITTED';

COMMENT ON TABLE citation_appeals IS
    'A citizen''s defence against a citation: the text they wrote, the photographs they attached '
    '(citation_evidence with source = CITIZEN), and the municipality''s resolution with its reason.';

-- ---------------------------------------------------------------------------------------------
-- Evidence now has two authors. The officer's photograph and the citizen's are the same kind of
-- proof and belong in the same table — a defence that lived somewhere else would be a second query
-- that can disagree with the first — but who supplied each one is never in doubt.
ALTER TABLE citation_evidence
    ADD COLUMN source    varchar(16) NOT NULL DEFAULT 'OFFICER',
    ADD COLUMN appeal_id uuid REFERENCES citation_appeals (id);

ALTER TABLE citation_evidence ADD CONSTRAINT ck_citation_evidence_source
    CHECK (source IN ('OFFICER', 'CITIZEN'));
-- A citizen's evidence always belongs to a defence; an officer's never does.
ALTER TABLE citation_evidence ADD CONSTRAINT ck_citation_evidence_appeal
    CHECK ((source = 'CITIZEN' AND appeal_id IS NOT NULL) OR (source = 'OFFICER' AND appeal_id IS NULL));

CREATE INDEX ix_citation_evidence_appeal ON citation_evidence (tenant_id, appeal_id)
    WHERE appeal_id IS NOT NULL;

COMMENT ON COLUMN citation_evidence.source IS
    'Who supplied it: the officer who wrote the citation, or the citizen who challenged it. The '
    'DEFAULT is OFFICER because every row that existed before this migration was theirs.';

-- ---------------------------------------------------------------------------------------------
-- The top-up code: what a citizen dictates at a supermarket till.
--
-- WHY NOT THE ID NUMBER. The obvious design — "identity number + municipality" — is dictated out
-- loud in a queue, so the person behind hears a national identifier, and anybody who knows somebody
-- else's can probe their account. This code is dedicated, per municipality and per person, carries
-- no personal data, is not derived from any, and can be rotated the moment its owner thinks somebody
-- overheard it. The old code is not kept: it must stop working immediately, which is the entire
-- point of rotating it.
CREATE TABLE wallet_topup_codes (
    id         uuid        PRIMARY KEY,
    tenant_id  uuid        NOT NULL REFERENCES tenants (id),
    user_id    uuid        NOT NULL REFERENCES users (id),
    code       varchar(16) NOT NULL,
    created_at timestamptz NOT NULL,
    rotated_at timestamptz,
    version    bigint      NOT NULL DEFAULT 0,
    -- One code per person per municipality: a wallet is per municipality, so the code that credits
    -- it is too. Uniqueness of the code inside the municipality is what makes the till's lookup
    -- unambiguous, and it is enforced here rather than by a check-and-insert in application code.
    CONSTRAINT uq_wallet_topup_codes_owner UNIQUE (tenant_id, user_id),
    CONSTRAINT uq_wallet_topup_codes_code UNIQUE (tenant_id, code)
);

COMMENT ON TABLE wallet_topup_codes IS
    'Short dictatable code, one per (municipality, citizen), used to credit a wallet at a counter. '
    'Random, never derived from personal data, with a check character so a mistyped code fails at '
    'the till instead of crediting somebody else.';

-- ---------------------------------------------------------------------------------------------
-- Where money came from. Until now every top-up looked alike; from here a movement says whether a
-- municipal cashier, an external partner, an operator correction or a development shortcut produced
-- it, and carries the reference that reconciliation is done by.
ALTER TABLE wallet_transactions
    ADD COLUMN source             varchar(32),
    ADD COLUMN external_reference varchar(120),
    ADD COLUMN created_by         uuid REFERENCES users (id);

ALTER TABLE wallet_transactions ADD CONSTRAINT ck_wallet_transactions_source
    CHECK (source IS NULL OR source IN ('CITIZEN', 'MUNICIPAL_COUNTER', 'PARTNER', 'ADJUSTMENT', 'DEV'));

-- The partner's own reference is the second idempotency layer, exactly as device_citation_id is for
-- a citation: an Idempotency-Key protects one HTTP request, this protects the transaction when the
-- retry arrives from another process with a new key. Enforced in the database because that is the
-- only place it holds with several instances.
CREATE UNIQUE INDEX uq_wallet_transactions_reference
    ON wallet_transactions (tenant_id, source, external_reference)
    WHERE external_reference IS NOT NULL;

COMMENT ON COLUMN wallet_transactions.external_reference IS
    'The counter''s or partner''s own reference for the payment. Unique per municipality and source '
    'so a resend credits once; it is what a reconciliation report joins on.';
