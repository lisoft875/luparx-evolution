-- =============================================================================================
-- V9_2 — administrative divisions seed, continued: the rest of the San José canton.
--
-- SEED DATA, NOT STRUCTURE. V9_1 seeded three of the eleven districts of the canton of San José
-- (Carmen, Merced, Hospital) as a working sample. The launch municipality operates parking across
-- the whole canton, so the remaining eight are added here with their official codes; without them a
-- zone in Zapote or La Sabana would have nothing to point at.
--
-- Codes are the official district codes of province 1, canton 01. Names are proper nouns and are
-- stored in the country's own spelling, never translated (see administrative_divisions.name).
--
-- This changes no schema and no code path: loading the full national tree remains a data operation
-- through `POST /api/v1/platform/catalog/countries/{code}/divisions`.
-- =============================================================================================

INSERT INTO administrative_divisions (id, country_code, parent_id, level, code, name, active) VALUES
    ('01900000-0000-7000-8000-000000000037', 'CR', '01900000-0000-7000-8000-000000000008', 3, '10104', 'Catedral', true),
    ('01900000-0000-7000-8000-000000000038', 'CR', '01900000-0000-7000-8000-000000000008', 3, '10105', 'Zapote', true),
    ('01900000-0000-7000-8000-000000000039', 'CR', '01900000-0000-7000-8000-000000000008', 3, '10106', 'San Francisco de Dos Ríos', true),
    ('01900000-0000-7000-8000-000000000040', 'CR', '01900000-0000-7000-8000-000000000008', 3, '10107', 'Uruca', true),
    ('01900000-0000-7000-8000-000000000041', 'CR', '01900000-0000-7000-8000-000000000008', 3, '10108', 'Mata Redonda', true),
    ('01900000-0000-7000-8000-000000000042', 'CR', '01900000-0000-7000-8000-000000000008', 3, '10109', 'Pavas', true),
    ('01900000-0000-7000-8000-000000000043', 'CR', '01900000-0000-7000-8000-000000000008', 3, '10110', 'Hatillo', true),
    ('01900000-0000-7000-8000-000000000044', 'CR', '01900000-0000-7000-8000-000000000008', 3, '10111', 'San Sebastián', true);
