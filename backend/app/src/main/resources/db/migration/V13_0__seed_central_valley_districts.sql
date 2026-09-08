-- =============================================================================================
-- V13_0 — administrative divisions: the cantons and districts the development fixture needs to
-- operate parking in five municipalities instead of one.
--
-- SEED DATA, NOT STRUCTURE, AND STILL NOT EXHAUSTIVE — exactly like V9_1 and V9_2. Nothing in the
-- code depends on how many rows are here: the full national tree of any country is loaded through
-- `POST /api/v1/platform/catalog/countries/{code}/divisions`. What this file buys is that the
-- development municipalities point at REAL districts with their official codes, because a fixture
-- that invents places teaches a developer the wrong thing about the domain.
--
-- Numbered after V12_0 for the reason every migration here is numbered last: out-of-order migration
-- is off, so a new file must sort after everything an existing database has already applied.
--
-- What arrives:
--   canton 115 Montes de Oca (province 1, San José)   — 4 districts
--   canton 303 La Unión      (province 3, Cartago)    — 8 districts
--   canton 102 Escazú        — its third district; V9_1 already seeded the other two
--   canton 301 Cartago       — its ten remaining districts; V9_1 seeded Oriental
--
-- Names are the official ones and are stored in the country's own spelling, never translated
-- (see the comment on administrative_divisions.name). Where common usage differs from the official
-- register the official form wins: "Carmen", not "El Carmen"; "Aguacaliente", not "Agua Caliente".
--
-- ON CONFLICT DO NOTHING: a database that already loaded part of the national tree through the
-- platform endpoint keeps what it has, and this migration still applies cleanly.
-- =============================================================================================

INSERT INTO administrative_divisions (id, country_code, parent_id, level, code, name, active) VALUES
    -- --- cantons that did not exist yet ------------------------------------------------------
    -- Montes de Oca hangs from province 1 (San José); La Unión from province 3 (Cartago).
    ('01900000-0000-7000-8000-000000000045', 'CR', '01900000-0000-7000-8000-000000000001', 2, '115', 'Montes de Oca', true),
    ('01900000-0000-7000-8000-000000000046', 'CR', '01900000-0000-7000-8000-000000000003', 2, '303', 'La Unión', true),

    -- --- canton 102 Escazú: V9_1 seeded 10201 Escazú and 10202 San Antonio -------------------
    ('01900000-0000-7000-8000-000000000047', 'CR', '01900000-0000-7000-8000-000000000009', 3, '10203', 'San Rafael', true),

    -- --- canton 115 Montes de Oca -------------------------------------------------------------
    ('01900000-0000-7000-8000-000000000048', 'CR', '01900000-0000-7000-8000-000000000045', 3, '11501', 'San Pedro', true),
    ('01900000-0000-7000-8000-000000000049', 'CR', '01900000-0000-7000-8000-000000000045', 3, '11502', 'Sabanilla', true),
    ('01900000-0000-7000-8000-000000000050', 'CR', '01900000-0000-7000-8000-000000000045', 3, '11503', 'Mercedes', true),
    ('01900000-0000-7000-8000-000000000051', 'CR', '01900000-0000-7000-8000-000000000045', 3, '11504', 'San Rafael', true),

    -- --- canton 303 La Unión ------------------------------------------------------------------
    -- San Ramón is seeded although no zone points at it: the canton has eight districts, and a tree
    -- that silently omits the ones this fixture happens not to use is a tree that lies.
    ('01900000-0000-7000-8000-000000000052', 'CR', '01900000-0000-7000-8000-000000000046', 3, '30301', 'Tres Ríos', true),
    ('01900000-0000-7000-8000-000000000053', 'CR', '01900000-0000-7000-8000-000000000046', 3, '30302', 'San Diego', true),
    ('01900000-0000-7000-8000-000000000054', 'CR', '01900000-0000-7000-8000-000000000046', 3, '30303', 'San Juan', true),
    ('01900000-0000-7000-8000-000000000055', 'CR', '01900000-0000-7000-8000-000000000046', 3, '30304', 'San Rafael', true),
    ('01900000-0000-7000-8000-000000000056', 'CR', '01900000-0000-7000-8000-000000000046', 3, '30305', 'Concepción', true),
    ('01900000-0000-7000-8000-000000000057', 'CR', '01900000-0000-7000-8000-000000000046', 3, '30306', 'Dulce Nombre', true),
    ('01900000-0000-7000-8000-000000000058', 'CR', '01900000-0000-7000-8000-000000000046', 3, '30307', 'San Ramón', true),
    ('01900000-0000-7000-8000-000000000059', 'CR', '01900000-0000-7000-8000-000000000046', 3, '30308', 'Río Azul', true),

    -- --- canton 301 Cartago: V9_1 seeded 30101 Oriental ---------------------------------------
    ('01900000-0000-7000-8000-000000000060', 'CR', '01900000-0000-7000-8000-000000000012', 3, '30102', 'Occidental', true),
    ('01900000-0000-7000-8000-000000000061', 'CR', '01900000-0000-7000-8000-000000000012', 3, '30103', 'Carmen', true),
    ('01900000-0000-7000-8000-000000000062', 'CR', '01900000-0000-7000-8000-000000000012', 3, '30104', 'San Nicolás', true),
    ('01900000-0000-7000-8000-000000000063', 'CR', '01900000-0000-7000-8000-000000000012', 3, '30105', 'Aguacaliente', true),
    ('01900000-0000-7000-8000-000000000064', 'CR', '01900000-0000-7000-8000-000000000012', 3, '30106', 'Guadalupe', true),
    ('01900000-0000-7000-8000-000000000065', 'CR', '01900000-0000-7000-8000-000000000012', 3, '30107', 'Corralillo', true),
    ('01900000-0000-7000-8000-000000000066', 'CR', '01900000-0000-7000-8000-000000000012', 3, '30108', 'Tierra Blanca', true),
    ('01900000-0000-7000-8000-000000000067', 'CR', '01900000-0000-7000-8000-000000000012', 3, '30109', 'Dulce Nombre', true),
    ('01900000-0000-7000-8000-000000000068', 'CR', '01900000-0000-7000-8000-000000000012', 3, '30110', 'Llano Grande', true),
    ('01900000-0000-7000-8000-000000000069', 'CR', '01900000-0000-7000-8000-000000000012', 3, '30111', 'Quebradilla', true)
ON CONFLICT DO NOTHING;
