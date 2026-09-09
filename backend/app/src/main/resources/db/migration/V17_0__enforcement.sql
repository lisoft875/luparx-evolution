-- =============================================================================================
-- V17_0 — enforcement: the infraction catalogue, the citation, its history and its evidence.
--
-- A citation is an administrative act somebody will challenge months after it was written, not a row
-- that says "did not pay". Everything below exists so that, a year later, the municipality can still
-- answer: which plate, on which bay, at which coordinates, for which infraction, for how much, at
-- what time it happened and at what time it was emitted, by which officer, with what photograph, and
-- what has happened to it since.
--
-- Numbered after V16_0 for the usual reason: out-of-order migration is off, so a new file must sort
-- after everything an existing database has already applied.
--
-- WHY ITS OWN MODULE (and its own tables rather than columns on parking_sessions): the life of a
-- citation is longer than the life of a session and has a different shape. A session is paid, runs
-- and ends the same afternoon; a citation is issued, appealed, upheld, paid late or annulled over
-- months, and must survive the deletion of everything around it. Tying it to a session would also be
-- wrong on the facts: most citations exist precisely because there is no session.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- What this municipality fines, and for how much. Configuration, never code: the second
-- municipality fines different things, and the second country fines them in another currency under
-- another law.
CREATE TABLE infraction_types (
    id                uuid         PRIMARY KEY,
    tenant_id         uuid         NOT NULL REFERENCES tenants (id),
    code              varchar(32)  NOT NULL,
    name              varchar(160) NOT NULL,
    description       varchar(1000),
    fine_amount_minor bigint       NOT NULL,
    currency_code     varchar(3)   NOT NULL,
    requires_photo    boolean      NOT NULL DEFAULT true,
    allows_appeal     boolean      NOT NULL DEFAULT true,
    discount_days     integer,
    discount_percent  integer,
    due_days          integer      NOT NULL,
    active            boolean      NOT NULL DEFAULT true,
    sort_order        integer      NOT NULL DEFAULT 0,
    created_at        timestamptz  NOT NULL,
    updated_at        timestamptz  NOT NULL,
    version           bigint       NOT NULL DEFAULT 0,
    CONSTRAINT uq_infraction_types_code UNIQUE (tenant_id, code),
    -- Money is stored in integer minor units with its currency (ADR 0009); a fine of zero is legal
    -- (a warning), a negative one is not.
    CONSTRAINT ck_infraction_types_amount CHECK (fine_amount_minor >= 0),
    CONSTRAINT ck_infraction_types_due CHECK (due_days BETWEEN 1 AND 365),
    -- Half a discount is not a discount: either both columns are set or neither is, and the window
    -- cannot outlast the deadline it discounts.
    CONSTRAINT ck_infraction_types_discount CHECK (
        (discount_days IS NULL AND discount_percent IS NULL)
        OR (discount_days IS NOT NULL AND discount_percent IS NOT NULL
            AND discount_days BETWEEN 1 AND due_days
            AND discount_percent BETWEEN 1 AND 99))
);

COMMENT ON TABLE infraction_types IS
    'What a municipality fines and for how much. Edited by its administrator; never deleted once '
    'used, only deactivated, because issued citations reference it and reports are built on it.';

-- ---------------------------------------------------------------------------------------------
-- The consecutive series: one per municipality per year. A row that is locked FOR UPDATE, not a
-- sequence: the series has to be per tenant and per year (a sequence would mean DDL at runtime) and
-- it has to be gapless (a sequence deliberately does not roll back, and a municipality must be able
-- to defend its numbering as complete). The lock is what makes two backend instances issuing at the
-- same instant produce two different numbers.
CREATE TABLE citation_number_counters (
    tenant_id     uuid        NOT NULL REFERENCES tenants (id),
    series_year   integer     NOT NULL,
    last_sequence bigint      NOT NULL DEFAULT 0,
    updated_at    timestamptz NOT NULL,
    CONSTRAINT pk_citation_number_counters PRIMARY KEY (tenant_id, series_year),
    CONSTRAINT ck_citation_number_counters_sequence CHECK (last_sequence >= 0)
);

COMMENT ON TABLE citation_number_counters IS
    'Per-municipality, per-year citation series. The year is computed in the municipality''s own '
    'time zone: a citation issued at 22:30 on 31 December in San Jose belongs to that year.';

-- ---------------------------------------------------------------------------------------------
CREATE TABLE citations (
    id                        uuid         PRIMARY KEY,
    tenant_id                 uuid         NOT NULL REFERENCES tenants (id),
    -- Null while the citation is a draft: a capture that is abandoned must not burn a number.
    number                    varchar(40),
    series_year               integer,
    sequence_number           bigint,
    plate                     varchar(32)  NOT NULL,
    plate_normalized          varchar(16)  NOT NULL,
    -- A reference, never a copy of the owner's data, and null whenever the plate is registered by
    -- more than one citizen: linking the wrong person is worse than linking nobody.
    vehicle_id                uuid         REFERENCES vehicles (id),
    zone_id                   uuid         REFERENCES parking_zones (id),
    space_id                  uuid         REFERENCES parking_spaces (id),
    space_code                varchar(32),
    latitude                  numeric(9,6),
    longitude                 numeric(9,6),
    location_accuracy_m       numeric(7,1),
    address_text              varchar(300),
    infraction_type_id        uuid         NOT NULL REFERENCES infraction_types (id),
    -- Snapshots. The catalogue is configuration and will be edited; raising a fine next year must
    -- not change what somebody was fined last year.
    infraction_code           varchar(32)  NOT NULL,
    infraction_name           varchar(160) NOT NULL,
    fine_amount_minor         bigint       NOT NULL,
    currency_code             varchar(3)   NOT NULL,
    discount_amount_minor     bigint,
    discount_until            timestamptz,
    due_at                    timestamptz,
    -- Two clocks, both kept: what the officer's device declared, and when the server accepted it.
    occurred_at               timestamptz  NOT NULL,
    issued_at                 timestamptz,
    device_clock_skew_seconds bigint,
    inspector_user_id         uuid         NOT NULL REFERENCES users (id),
    -- The device's own identifier for the capture. This is what makes a resend after a lost
    -- connection resolve to the same citation even when the retry carries a new Idempotency-Key.
    device_citation_id        varchar(64),
    parking_session_id        uuid         REFERENCES parking_sessions (id),
    status                    varchar(32)  NOT NULL,
    status_reason             varchar(500),
    notes                     varchar(2000),
    created_at                timestamptz  NOT NULL,
    updated_at                timestamptz  NOT NULL,
    version                   bigint       NOT NULL DEFAULT 0,
    CONSTRAINT ck_citations_status CHECK (status IN (
        'DRAFT', 'ISSUED', 'PAID', 'APPEALED', 'UPHELD', 'DISMISSED', 'CANCELLED', 'EXPIRED')),
    CONSTRAINT ck_citations_amount CHECK (fine_amount_minor >= 0),
    CONSTRAINT ck_citations_discount CHECK (
        discount_amount_minor IS NULL OR discount_amount_minor <= fine_amount_minor),
    -- An issued citation without a number, an emission time or a deadline would be an act nobody can
    -- quote or pay. The database says so, because application validation is necessary and never
    -- sufficient.
    CONSTRAINT ck_citations_issued_complete CHECK (
        status = 'DRAFT'
        OR (number IS NOT NULL AND series_year IS NOT NULL AND sequence_number IS NOT NULL
            AND issued_at IS NOT NULL AND due_at IS NOT NULL)),
    CONSTRAINT ck_citations_coordinates CHECK (
        (latitude IS NULL AND longitude IS NULL)
        OR (latitude IS NOT NULL AND longitude IS NOT NULL
            AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)),
    CONSTRAINT ck_citations_accuracy CHECK (location_accuracy_m IS NULL OR location_accuracy_m >= 0)
);

-- The consecutive is unique inside the municipality, in both of the forms it is quoted.
CREATE UNIQUE INDEX uq_citations_number ON citations (tenant_id, number) WHERE number IS NOT NULL;
CREATE UNIQUE INDEX uq_citations_series ON citations (tenant_id, series_year, sequence_number)
    WHERE number IS NOT NULL;

-- Idempotency of the act itself, enforced where it has to be enforced with several instances: in
-- the database. Partial, because most citations are written online and send no device identifier.
CREATE UNIQUE INDEX uq_citations_device_id ON citations (tenant_id, device_citation_id)
    WHERE device_citation_id IS NOT NULL;

-- The three searches this table actually serves: the officer's own work, the municipality's filtered
-- listing (always by date), and "everything for this plate".
CREATE INDEX ix_citations_inspector ON citations (tenant_id, inspector_user_id, occurred_at DESC);
CREATE INDEX ix_citations_tenant_time ON citations (tenant_id, occurred_at DESC);
CREATE INDEX ix_citations_plate ON citations (tenant_id, plate_normalized, occurred_at DESC);
-- The citizen's own fines, and the collection job that looks for what is overdue.
CREATE INDEX ix_citations_vehicle ON citations (tenant_id, vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX ix_citations_due ON citations (tenant_id, due_at) WHERE status = 'ISSUED';

COMMENT ON TABLE citations IS
    'An administrative act, not a payment record. Never edited and never deleted once issued: it '
    'moves through its statuses and every move is written into citation_events.';
COMMENT ON COLUMN citations.occurred_at IS
    'When the officer says the infraction happened, as their device declared it. Never overwritten '
    'by the server: the difference from issued_at is exactly what a defence is built on.';
COMMENT ON COLUMN citations.device_citation_id IS
    'Identifier generated on the officer''s device. Unique per municipality so that a queue flushed '
    'twice, or an app reinstalled mid-shift, produces one citation and not two.';

-- ---------------------------------------------------------------------------------------------
-- The history is part of the citation, not a log. audit_events also records every one of these, but
-- that table is the platform's security trail — filtered by permission, retained on the platform's
-- schedule. The person who challenges a citation is entitled to read what happened to it, in the
-- same response as the citation, for as long as the citation exists.
CREATE TABLE citation_events (
    id            uuid        PRIMARY KEY,
    tenant_id     uuid        NOT NULL REFERENCES tenants (id),
    citation_id   uuid        NOT NULL REFERENCES citations (id),
    action        varchar(32) NOT NULL,
    from_status   varchar(32),
    to_status     varchar(32) NOT NULL,
    actor_user_id uuid        REFERENCES users (id),
    actor_portal  varchar(16),
    reason        varchar(500),
    actor_ip_hash varchar(64),
    occurred_at   timestamptz NOT NULL,
    CONSTRAINT ck_citation_events_action CHECK (action IN (
        'DRAFTED', 'ISSUED', 'EVIDENCE_ATTACHED', 'PAID', 'APPEALED', 'APPEAL_UPHELD',
        'APPEAL_DISMISSED', 'CANCELLED', 'EXPIRED'))
);

CREATE INDEX ix_citation_events_citation ON citation_events (tenant_id, citation_id, occurred_at);

COMMENT ON COLUMN citation_events.actor_ip_hash IS
    'The actor''s IP, hashed with the platform pepper exactly as audit_events does it: enough to '
    'correlate two records, never enough to profile a person.';

-- ---------------------------------------------------------------------------------------------
-- Evidence. The bytes live in the evidence store (a directory in development, an object store in
-- production — see the EvidenceStorage port); what lives here is how to find them again and how to
-- prove they are the same bytes.
CREATE TABLE citation_evidence (
    id           uuid        PRIMARY KEY,
    tenant_id    uuid        NOT NULL REFERENCES tenants (id),
    citation_id  uuid        NOT NULL REFERENCES citations (id),
    kind         varchar(16) NOT NULL,
    storage_key  varchar(400),
    content_type varchar(100),
    byte_size    bigint,
    sha256       varchar(64),
    note         varchar(2000),
    captured_at  timestamptz,
    latitude     numeric(9,6),
    longitude    numeric(9,6),
    uploaded_by  uuid        NOT NULL REFERENCES users (id),
    created_at   timestamptz NOT NULL,
    CONSTRAINT ck_citation_evidence_kind CHECK (kind IN ('PHOTO', 'NOTE')),
    -- A photograph without a key, a size or a digest is not evidence; a note without text is not one
    -- either. Stated here so no future writer can create half a record.
    CONSTRAINT ck_citation_evidence_shape CHECK (
        (kind = 'PHOTO' AND storage_key IS NOT NULL AND content_type IS NOT NULL
            AND byte_size IS NOT NULL AND byte_size > 0 AND sha256 IS NOT NULL)
        OR (kind = 'NOTE' AND note IS NOT NULL)),
    CONSTRAINT ck_citation_evidence_coordinates CHECK (
        (latitude IS NULL AND longitude IS NULL)
        OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
);

CREATE INDEX ix_citation_evidence_citation ON citation_evidence (tenant_id, citation_id, created_at);

COMMENT ON COLUMN citation_evidence.sha256 IS
    'Digest of the stored bytes, computed at upload. Months later this is what distinguishes "the '
    'photograph the officer took" from "a photograph somebody put there afterwards".';
COMMENT ON COLUMN citation_evidence.content_type IS
    'The type as verified from the file''s own header, never as the client declared it: believing '
    'the uploader''s label is how something that is not an image gets stored and served as one.';
