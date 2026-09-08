-- =============================================================================================
-- V10_0 — module-parking: numbered parking spaces, and the two columns a zone needed to be a real
-- place rather than a code.
--
-- A space is the bay painted on the street. Its `code` is what the citizen reads off the sign and
-- types into the app, which is why it is TEXT and not an integer: "0001", "A12", "B-125" and
-- "LUP-0001" are all legitimate codes in a real municipality, and only the municipality that
-- painted them decides the shape. Leading zeros are therefore significant and must survive a round
-- trip — an integer column would silently turn "0001" into "1" and stop matching what the driver
-- sees on the street.
--
-- Uniqueness is per tenant, never global (docs/DATA_MODEL.md §3): two municipalities both numbering
-- their bays from 0001 is the normal case, not a conflict.
--
-- No business data is inserted here. Development seed rows are written by DevDataSeeder under the
-- `dev` profile, so a migration never has to be reasoned about as a fixture.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Zones gain a human description and their place in the administrative tree.
--
-- The foreign key to `administrative_divisions` lives in the database while module-parking keeps no
-- Maven dependency on module-geo — the same arrangement tenancy already has with users
-- (docs/ARCHITECTURE.md §5): the database holds the reference, the code holds the boundary.
-- Nullable on purpose: a zone that spans several districts, or a country whose division tree has
-- not been loaded yet, is a normal state and not a reason to refuse the row.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE parking_zones
    ADD COLUMN description varchar(400),
    ADD COLUMN division_id uuid REFERENCES administrative_divisions (id);

COMMENT ON COLUMN parking_zones.description IS
    'Short free text shown to citizens and inspectors. A proper noun and a street reference, not a '
    'translated label: it is tenant content, like the name.';
COMMENT ON COLUMN parking_zones.division_id IS
    'Administrative division (for Costa Rica, the district) this zone belongs to. NULL when the zone '
    'spans several divisions or the country tree is not loaded.';

CREATE INDEX ix_parking_zones_division ON parking_zones (division_id);

-- ---------------------------------------------------------------------------------------------
CREATE TABLE parking_spaces (
    id         uuid        PRIMARY KEY,
    tenant_id  uuid        NOT NULL REFERENCES tenants (id),
    zone_id    uuid        NOT NULL REFERENCES parking_zones (id),
    code       varchar(16) NOT NULL,
    status     varchar(32) NOT NULL DEFAULT 'AVAILABLE',
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    version    bigint      NOT NULL DEFAULT 0,
    CONSTRAINT uq_parking_spaces_code UNIQUE (tenant_id, code),
    -- Trimmed, non-empty, and short enough to be painted on a sign. Deliberately NOT a numeric
    -- pattern: see the header.
    CONSTRAINT ck_parking_spaces_code CHECK (code = btrim(code) AND length(code) BETWEEN 1 AND 16),
    CONSTRAINT ck_parking_spaces_status CHECK (status IN ('AVAILABLE', 'OUT_OF_SERVICE'))
);

COMMENT ON TABLE parking_spaces IS
    'A numbered bay inside a zone. The code is the identifier painted on the street and typed by the '
    'citizen; it is unique inside a municipality, never globally.';
COMMENT ON COLUMN parking_spaces.code IS
    'Text, with leading zeros preserved. The development seed uses "0001".."10000", but the column '
    'accepts any short alphanumeric code a municipality actually paints.';
COMMENT ON COLUMN parking_spaces.status IS
    'Operational state. A bay is never deleted — it is taken out of service — so parking sessions '
    'and citations that reference it stay referentially valid.';
COMMENT ON COLUMN parking_spaces.version IS
    'Optimistic locking: two operators editing the same bay concurrently cannot both win.';

-- Every read of this table is narrowed by tenant first (docs/ARCHITECTURE.md §4). The zone follows
-- because "the bays of this zone" is the query the admin and inspector screens actually make.
CREATE INDEX ix_parking_spaces_tenant_zone ON parking_spaces (tenant_id, zone_id);
CREATE INDEX ix_parking_spaces_tenant_status ON parking_spaces (tenant_id, status);
