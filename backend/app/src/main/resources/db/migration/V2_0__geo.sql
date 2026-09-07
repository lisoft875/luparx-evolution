-- =============================================================================================
-- V2_0 — module-geo: countries, administrative divisions, identity document rules.
--
-- This is the schema that keeps the platform free of single-country assumptions (ADR 0008):
-- currency, locale, time zone, dial code, division labels and document patterns are all rows,
-- never constants in code (CONTRACT.md §7).
-- =============================================================================================

CREATE TABLE countries (
    code                char(2)      PRIMARY KEY,
    name_key            varchar(128) NOT NULL,
    dial_code           varchar(8)   NOT NULL,
    default_locale      varchar(35)  NOT NULL,
    default_currency    char(3)      NOT NULL,
    default_time_zone   varchar(64)  NOT NULL,
    display_name_format varchar(32)  NOT NULL DEFAULT 'GIVEN_FAMILY',
    active              boolean      NOT NULL DEFAULT true,
    CONSTRAINT ck_countries_code_upper    CHECK (code = upper(code)),
    CONSTRAINT ck_countries_currency_upper CHECK (default_currency = upper(default_currency)),
    CONSTRAINT ck_countries_dial_code      CHECK (dial_code ~ '^\+[0-9]{1,6}$')
);

COMMENT ON TABLE countries IS
    'Supported countries (ISO 3166-1 alpha-2) with the defaults a tenant or a user inherits.';
COMMENT ON COLUMN countries.name_key IS
    'i18n key, not a translated name: the display string is resolved by the client (CONTRACT.md §7).';
COMMENT ON COLUMN countries.display_name_format IS
    'How a person name is rendered in this country, e.g. GIVEN_FAMILY or GIVEN_FAMILY_SECOND.';
COMMENT ON COLUMN countries.active IS
    'Soft deactivation. Catalogue rows are never deleted, so historical user records stay referentially valid.';

-- ---------------------------------------------------------------------------------------------
CREATE TABLE country_admin_levels (
    country_code char(2)      NOT NULL REFERENCES countries (code),
    level        integer      NOT NULL,
    label_key    varchar(128) NOT NULL,
    required     boolean      NOT NULL DEFAULT true,
    CONSTRAINT pk_country_admin_levels PRIMARY KEY (country_code, level),
    CONSTRAINT ck_country_admin_levels_level CHECK (level BETWEEN 1 AND 5)
);

COMMENT ON TABLE country_admin_levels IS
    'Depth and labels of a country''s administrative hierarchy. "Provincia/Cantón/Distrito" and '
    '"State/County/City" are data, never UI constants (CONTRACT.md §2).';

-- ---------------------------------------------------------------------------------------------
CREATE TABLE administrative_divisions (
    id           uuid         PRIMARY KEY,
    country_code char(2)      NOT NULL REFERENCES countries (code),
    parent_id    uuid         REFERENCES administrative_divisions (id),
    level        integer      NOT NULL,
    code         varchar(32)  NOT NULL,
    name         varchar(160) NOT NULL,
    active       boolean      NOT NULL DEFAULT true,
    CONSTRAINT uq_administrative_divisions_code UNIQUE (country_code, level, code),
    CONSTRAINT ck_administrative_divisions_level CHECK (level BETWEEN 1 AND 5),
    -- A level-1 division has no parent; every deeper level must have one.
    CONSTRAINT ck_administrative_divisions_parent
        CHECK ((level = 1 AND parent_id IS NULL) OR (level > 1 AND parent_id IS NOT NULL))
);

COMMENT ON TABLE administrative_divisions IS
    'Generic N-level division tree, one table for every country. Codes are unique inside a country '
    'and a level, never globally: two countries may reuse the same code.';

CREATE INDEX ix_administrative_divisions_country_parent
    ON administrative_divisions (country_code, parent_id);
CREATE INDEX ix_administrative_divisions_country_level
    ON administrative_divisions (country_code, level);

-- ---------------------------------------------------------------------------------------------
CREATE TABLE identity_document_types (
    country_code char(2)      NOT NULL REFERENCES countries (code),
    type         varchar(32)  NOT NULL,
    label_key    varchar(128) NOT NULL,
    pattern      varchar(256) NOT NULL,
    normalizer   varchar(32)  NOT NULL DEFAULT 'UPPER_ALPHANUMERIC',
    example      varchar(64)  NOT NULL,
    active       boolean      NOT NULL DEFAULT true,
    CONSTRAINT pk_identity_document_types PRIMARY KEY (country_code, type),
    CONSTRAINT ck_identity_document_types_type
        CHECK (type IN ('NATIONAL_ID', 'FOREIGN_RESIDENT_ID', 'PASSPORT', 'TAX_ID', 'OTHER')),
    CONSTRAINT ck_identity_document_types_normalizer
        CHECK (normalizer IN ('UPPER_ALPHANUMERIC', 'DIGITS_ONLY', 'TRIM_UPPER'))
);

COMMENT ON TABLE identity_document_types IS
    'Per country and document kind: the regex the normalised number must match, how to normalise it, '
    'and a placeholder example. Supporting a new country is a data change (CONTRACT.md §2).';
COMMENT ON COLUMN identity_document_types.pattern IS
    'Java-compatible regular expression applied to the NORMALISED number.';
COMMENT ON COLUMN identity_document_types.example IS
    'Placeholder shown in the UI. Must never be a real person''s document number.';
