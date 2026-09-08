-- =============================================================================================
-- V14_0 — visual identity of a municipality: the logo, the brand colour and the short name a top
-- bar can actually fit.
--
-- A citizen chooses their municipality from a grid of icons after signing in, and the active one is
-- shown next to the LupaRX logo. Neither screen can be built from a name alone.
--
-- Numbered after V13_0 for the usual reason: out-of-order migration is off, so a new file must sort
-- after everything an existing database has already applied. Purely additive — three nullable
-- columns on an existing table — so a rolling deployment is safe in both directions.
--
-- WHY A KEY AND NOT A URL
--
-- The column is `logo_asset_key`, not `logo_url`, and the API resolves it into a ready-to-render
-- address. Three reasons, in order of how much they would hurt:
--
--   1. An absolute URL in a tenant row is environment-specific. Restore this database into staging
--      and every municipality silently points at production's asset host — the one mistake that
--      looks like it works.
--   2. Hosting changes. The day an upload endpoint and a CDN land, a stored URL has to be rewritten
--      for every municipality that ever set one; a key is resolved differently and no row moves.
--   3. The platform already needs to serve something for a municipality that has no emblem yet, and
--      "generated" is a perfectly good key while it is not a URL at all.
--
-- Today exactly two kinds of key are understood, and the CHECK admits only those two:
--
--   'generated:monogram'  the built-in placeholder — the short name over the brand colour, drawn by
--                         GET /api/v1/catalog/tenants/{id}/logo.svg
--   'https://…'           an emblem the municipality hosts itself, which is what a real one has
--                         right now. Plain http is refused: a logo loaded over http on an https page
--                         is blocked by the browser as mixed content, so accepting it would only
--                         produce a broken image nobody can explain.
--
-- A third kind (an uploaded object) becomes possible without touching a row or the API contract,
-- which is the whole point of storing a key.
--
-- NULLABLE ON PURPOSE. A municipality created five minutes ago has no logo, no colour and no short
-- name, and that is a valid state rather than an error: the client falls back to a monogram over the
-- brand colour, and to the platform's own colour when there is not even that.
-- =============================================================================================

ALTER TABLE tenants
    ADD COLUMN logo_asset_key varchar(400),
    ADD COLUMN brand_color    char(7),
    ADD COLUMN short_name     varchar(40);

ALTER TABLE tenants ADD CONSTRAINT ck_tenants_logo_asset_key CHECK (
    logo_asset_key IS NULL
    OR logo_asset_key = 'generated:monogram'
    OR logo_asset_key ~ '^https://[^[:space:]]+$');

-- #RRGGBB, lower case. One spelling only: two rows holding "#FFAA00" and "#ffaa00" are the same
-- colour and would still compare unequal, and a client that keys a cache by the value would miss.
ALTER TABLE tenants ADD CONSTRAINT ck_tenants_brand_color CHECK (
    brand_color IS NULL OR brand_color ~ '^#[0-9a-f]{6}$');

ALTER TABLE tenants ADD CONSTRAINT ck_tenants_short_name CHECK (
    short_name IS NULL OR (short_name = btrim(short_name) AND length(short_name) BETWEEN 1 AND 40));

COMMENT ON COLUMN tenants.logo_asset_key IS
    'How to obtain this municipality''s logo, as a key the API resolves into a URL — never a stored '
    'URL, so the value survives a change of hosting and a database restored into another environment. '
    'NULL means the municipality has not provided an emblem yet, which is a valid state: the client '
    'draws a monogram over brand_color.';
COMMENT ON COLUMN tenants.brand_color IS
    'Primary brand colour as #rrggbb, lower case. Used behind the generated monogram and to tint the '
    'active-municipality chip next to the LupaRX logo.';
COMMENT ON COLUMN tenants.short_name IS
    'What fits in a top bar when the display name does not — "San José" for "Municipalidad de San '
    'José". Tenant content, never a translated label. NULL means the client falls back to the '
    'display name and truncates it itself.';
