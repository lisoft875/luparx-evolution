-- =============================================================================================
-- V16_0 — a vehicle is a car or a motorcycle.
--
-- V15_0 shipped five kinds: CAR, MOTORCYCLE, PICKUP, VAN and OTHER. Three of them are withdrawn
-- here, and the reason is worth writing down: no tariff, no report and no enforcement rule ever
-- distinguished a pick-up from a car. They were three extra choices a citizen had to make that
-- nothing downstream read — a longer form for no answer. The distinction that does earn its place is
-- the motorcycle, which occupies a fraction of a bay and is what a municipality prices differently
-- first.
--
-- Numbered after V15_0 for the usual reason: out-of-order migration is off, so a new file must sort
-- after everything an existing database has already applied.
--
-- EXPAND AND CONTRACT, IN THAT ORDER. The data moves first and the constraint tightens second. Doing
-- it the other way round would fail on the first row holding a value the new CHECK refuses, and a
-- migration that can only run on a database nobody used is not a migration.
--
-- The rows are reassigned to CAR rather than refused or deleted. A pick-up IS a car for every
-- purpose this platform currently has, the citizen who registered one still has to be able to park,
-- and losing their vehicle — with the sessions and the ledger that reference it — to tidy up an enum
-- would be an absurd trade. The reassignment is stated in the log by the row count it touches.
-- =============================================================================================

-- 1. Expand: move every withdrawn value onto the one that survives.
UPDATE vehicles SET type = 'CAR' WHERE type NOT IN ('CAR', 'MOTORCYCLE');

-- 2. Contract: only now is the narrower rule true of every row, so only now can it be enforced.
ALTER TABLE vehicles DROP CONSTRAINT ck_vehicles_type;
ALTER TABLE vehicles ADD CONSTRAINT ck_vehicles_type CHECK (type IN ('CAR', 'MOTORCYCLE'));

COMMENT ON COLUMN vehicles.type IS
    'A car or a motorcycle. Not decoration: the motorcycle is what a per-type tariff would be '
    'resolved by, and what an inspector reads. Rows created before V16_0 with a withdrawn value '
    '(PICKUP, VAN, OTHER) were reassigned to CAR — a pick-up is a car for every purpose this '
    'platform currently has. Widening the set again is a value, a translation key and this CHECK.';
