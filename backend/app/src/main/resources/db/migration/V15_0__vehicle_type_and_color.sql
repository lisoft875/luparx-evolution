-- =============================================================================================
-- V15_0 — what kind of vehicle it is and what colour it is.
--
-- A citizen registering a car gave the platform a plate, a nickname, a make, a model and a year.
-- Two things were missing and neither is cosmetic:
--
--   type   the day a municipality charges a motorcycle less than a car, this is the column the
--          tariff is resolved by. It is also what an inspector says out loud about what they are
--          looking at.
--   color  the inspector's actual search is "the grey one". Free text would make that search useless
--          the moment two citizens spell the same colour differently, so the value is a KEY from a
--          closed catalogue the API publishes with a translation per language, never a word typed by
--          a person.
--
-- Numbered after V14_0 for the usual reason: out-of-order migration is off, so a new file must sort
-- after everything an existing database has already applied.
--
-- BACKFILL. `type` arrives NOT NULL with a default of 'CAR' and every existing row takes it. That is
-- a guess, and it is stated as one: it is the overwhelmingly common case, a vehicle with no type at
-- all would have to be special-cased on every screen that shows one, and a citizen who has a
-- motorcycle can correct it in one edit. `color` arrives nullable instead, because there is no
-- colour that is "probably right" and inventing one would be worse than admitting we do not know.
-- =============================================================================================

ALTER TABLE vehicles
    ADD COLUMN type  varchar(32) NOT NULL DEFAULT 'CAR',
    ADD COLUMN color varchar(32);

-- The catalogue lives in the domain (VehicleType, VehicleColor) and is published by the API; the
-- CHECK is here so a job, a console or a future service cannot write a value the product does not
-- know how to render. Application validation is necessary and never sufficient.
ALTER TABLE vehicles ADD CONSTRAINT ck_vehicles_type CHECK (
    type IN ('CAR', 'MOTORCYCLE', 'PICKUP', 'VAN', 'OTHER'));

ALTER TABLE vehicles ADD CONSTRAINT ck_vehicles_color CHECK (
    color IS NULL OR color IN ('WHITE', 'BLACK', 'GRAY', 'SILVER', 'RED', 'BLUE', 'GREEN', 'YELLOW',
                               'ORANGE', 'BROWN', 'BEIGE', 'OTHER'));

COMMENT ON COLUMN vehicles.type IS
    'What kind of vehicle it is, from a closed catalogue. Not decoration: it is what a per-type '
    'tariff would be resolved by, and what an inspector reads. Defaulted to CAR for rows that '
    'predate this column — a guess, and the ordinary case.';
COMMENT ON COLUMN vehicles.color IS
    'Colour as a catalogue KEY, never a word a citizen typed: the inspector''s search is "the grey '
    'one", and free text makes that search match five spellings of the same colour. NULL means the '
    'citizen has not said, which is honest; there is no colour that is probably right.';

-- The inspector's lookup is a plate, sometimes narrowed by what the car looks like. Indexed together
-- because "grey Yaris" is one query, not two.
CREATE INDEX ix_vehicles_type_color ON vehicles (type, color);
