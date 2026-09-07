-- =============================================================================================
-- V9_0 — geo catalogue seed.
--
-- SEED DATA, NOT STRUCTURE. Everything below is an ordinary row that the platform back-office can
-- edit through `POST/PUT /api/v1/platform/catalog/**`. Several countries are seeded on purpose:
-- the platform must never be able to assume a single market (CONTRACT.md §7, ADR 0008), and the
-- easiest way to keep that honest is for more than one country to exist from the first migration.
--
-- Costa Rica is the launch market and therefore the deployment default, which is configuration
-- (`platform.defaults.*`), not an assumption in code.
-- =============================================================================================

INSERT INTO countries (code, name_key, dial_code, default_locale, default_currency,
                       default_time_zone, display_name_format, active) VALUES
    ('CR', 'country.CR', '+506', 'es-CR', 'CRC', 'America/Costa_Rica', 'GIVEN_FAMILY_SECOND', true),
    ('US', 'country.US', '+1',   'en-US', 'USD', 'America/New_York',   'GIVEN_FAMILY',        true),
    ('MX', 'country.MX', '+52',  'es-MX', 'MXN', 'America/Mexico_City','GIVEN_FAMILY_SECOND', true),
    ('ES', 'country.ES', '+34',  'es-ES', 'EUR', 'Europe/Madrid',      'GIVEN_FAMILY_SECOND', true),
    ('PA', 'country.PA', '+507', 'es-PA', 'PAB', 'America/Panama',     'GIVEN_FAMILY_SECOND', true);

-- ---------------------------------------------------------------------------------------------
-- Administrative hierarchies. The labels are i18n keys: the UI renders "Provincia" or "State"
-- from these, and never from a constant of its own (CONTRACT.md §2 item 3).
-- ---------------------------------------------------------------------------------------------
INSERT INTO country_admin_levels (country_code, level, label_key, required) VALUES
    ('CR', 1, 'geo.level.CR.1', true),   -- provincia
    ('CR', 2, 'geo.level.CR.2', true),   -- canton
    ('CR', 3, 'geo.level.CR.3', true),   -- distrito
    ('US', 1, 'geo.level.US.1', true),   -- state
    ('US', 2, 'geo.level.US.2', false),  -- county
    ('US', 3, 'geo.level.US.3', true),   -- city
    ('MX', 1, 'geo.level.MX.1', true),   -- estado
    ('MX', 2, 'geo.level.MX.2', true),   -- municipio
    ('ES', 1, 'geo.level.ES.1', true),   -- comunidad autonoma
    ('ES', 2, 'geo.level.ES.2', true),   -- provincia
    ('ES', 3, 'geo.level.ES.3', true),   -- municipio
    ('PA', 1, 'geo.level.PA.1', true),   -- provincia
    ('PA', 2, 'geo.level.PA.2', true),   -- distrito
    ('PA', 3, 'geo.level.PA.3', true);   -- corregimiento

-- ---------------------------------------------------------------------------------------------
-- Identity document rules. Patterns are applied to the NORMALISED number, so the normaliser column
-- and the pattern must be read together (e.g. DIGITS_ONLY strips the dashes people type).
-- ---------------------------------------------------------------------------------------------
INSERT INTO identity_document_types (country_code, type, label_key, pattern, normalizer, example, active) VALUES
    ('CR', 'NATIONAL_ID',         'document.CR.NATIONAL_ID',         '^[1-9][0-9]{8}$',        'DIGITS_ONLY',        '1-2345-6789',   true),
    ('CR', 'FOREIGN_RESIDENT_ID', 'document.CR.FOREIGN_RESIDENT_ID', '^[0-9]{11,12}$',         'DIGITS_ONLY',        '123456789012',  true),
    ('CR', 'PASSPORT',            'document.CR.PASSPORT',            '^[A-Z0-9]{6,12}$',       'UPPER_ALPHANUMERIC', 'A1234567',      true),
    ('CR', 'TAX_ID',              'document.CR.TAX_ID',              '^[0-9]{10,12}$',         'DIGITS_ONLY',        '3101123456',    true),
    ('CR', 'OTHER',               'document.CR.OTHER',               '^[A-Z0-9]{4,32}$',       'UPPER_ALPHANUMERIC', 'OTHER123',      true),

    ('US', 'NATIONAL_ID',         'document.US.NATIONAL_ID',         '^[0-9]{9}$',             'DIGITS_ONLY',        '123-45-6789',   true),
    ('US', 'PASSPORT',            'document.US.PASSPORT',            '^[A-Z0-9]{6,9}$',        'UPPER_ALPHANUMERIC', 'X12345678',     true),
    ('US', 'TAX_ID',              'document.US.TAX_ID',              '^[0-9]{9}$',             'DIGITS_ONLY',        '12-3456789',    true),

    ('MX', 'NATIONAL_ID',         'document.MX.NATIONAL_ID',         '^[A-Z]{4}[0-9]{6}[A-Z0-9]{8}$', 'UPPER_ALPHANUMERIC', 'ABCD800101HDFRRL01', true),
    ('MX', 'PASSPORT',            'document.MX.PASSPORT',            '^[A-Z0-9]{6,12}$',       'UPPER_ALPHANUMERIC', 'G12345678',     true),
    ('MX', 'TAX_ID',              'document.MX.TAX_ID',              '^[A-Z]{3,4}[0-9]{6}[A-Z0-9]{3}$', 'UPPER_ALPHANUMERIC', 'ABC800101XY1', true),

    ('ES', 'NATIONAL_ID',         'document.ES.NATIONAL_ID',         '^[0-9]{8}[A-Z]$',        'UPPER_ALPHANUMERIC', '12345678Z',     true),
    ('ES', 'FOREIGN_RESIDENT_ID', 'document.ES.FOREIGN_RESIDENT_ID', '^[XYZ][0-9]{7}[A-Z]$',   'UPPER_ALPHANUMERIC', 'X1234567L',     true),
    ('ES', 'PASSPORT',            'document.ES.PASSPORT',            '^[A-Z]{3}[0-9]{6}$',     'UPPER_ALPHANUMERIC', 'ABC123456',     true),

    ('PA', 'NATIONAL_ID',         'document.PA.NATIONAL_ID',         '^[0-9A-Z]{5,15}$',       'UPPER_ALPHANUMERIC', '8-123-456',     true),
    ('PA', 'PASSPORT',            'document.PA.PASSPORT',            '^[A-Z0-9]{6,12}$',       'UPPER_ALPHANUMERIC', 'PA123456',      true);
