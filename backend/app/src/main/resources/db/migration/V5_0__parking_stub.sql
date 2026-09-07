-- =============================================================================================
-- V5_0 — module-parking boundary.
--
-- The parking domain is a declared frontier in v0.1 (CONTRACT.md §4). These two tables exist to
-- pin down the conventions every future parking table must follow, and to make the tenant-ownership
-- rule a fact of the schema from day one rather than a promise:
--
--   * tenant_id NOT NULL with a foreign key to tenants (docs/DATA_MODEL.md §3)
--   * money as amount_minor bigint + currency_code char(3) — never a floating-point type (ADR 0009)
--
-- They are intentionally minimal; the real model arrives with the module.
-- =============================================================================================

CREATE TABLE parking_zones (
    id           uuid         PRIMARY KEY,
    tenant_id    uuid         NOT NULL REFERENCES tenants (id),
    code         varchar(32)  NOT NULL,
    name         varchar(160) NOT NULL,
    active       boolean      NOT NULL DEFAULT true,
    created_at   timestamptz  NOT NULL,
    updated_at   timestamptz  NOT NULL,
    version      bigint       NOT NULL DEFAULT 0,
    CONSTRAINT uq_parking_zones_code UNIQUE (tenant_id, code)
);

COMMENT ON TABLE parking_zones IS
    'Parking zone (stub). Codes are unique inside a municipality, never globally.';

CREATE INDEX ix_parking_zones_tenant ON parking_zones (tenant_id, active);

CREATE TABLE parking_rates (
    id             uuid        PRIMARY KEY,
    tenant_id      uuid        NOT NULL REFERENCES tenants (id),
    zone_id        uuid        NOT NULL REFERENCES parking_zones (id),
    -- Money, the only representation allowed anywhere in the platform (ADR 0009).
    amount_minor   bigint      NOT NULL,
    currency_code  char(3)     NOT NULL,
    minutes        integer     NOT NULL,
    valid_from     timestamptz NOT NULL,
    valid_to       timestamptz,
    created_at     timestamptz NOT NULL,
    version        bigint      NOT NULL DEFAULT 0,
    CONSTRAINT ck_parking_rates_amount   CHECK (amount_minor >= 0),
    CONSTRAINT ck_parking_rates_minutes  CHECK (minutes > 0),
    CONSTRAINT ck_parking_rates_currency CHECK (currency_code = upper(currency_code)),
    CONSTRAINT ck_parking_rates_validity CHECK (valid_to IS NULL OR valid_to > valid_from)
);

COMMENT ON TABLE parking_rates IS
    'Tariff of a zone over a validity window (stub). amount_minor is integer minor units; a rate is '
    'never negative, which is why the CHECK is present here and would be absent on a refund table.';

CREATE INDEX ix_parking_rates_zone_validity ON parking_rates (tenant_id, zone_id, valid_from DESC);
