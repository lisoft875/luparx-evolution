# LupaRX — Frontend monorepo

npm-workspaces monorepo for the four LupaRX portals defined in
`../docs/CONTRACT.md` §0: **citizen**, **admin** (municipal administration),
**inspector** (enforcement) and **platform** (the product operator's
back-office). Each portal is a fully separate app with its own login screen,
its own isolated token storage, and its own build — none of them share an
entry page, and a token minted for one portal is never accepted by another
(CONTRACT.md §3). The UI across all four follows `../docs/DESIGN_SYSTEM.md`
verbatim: dark-by-default tokens (`--lx-*`, `packages/ui/src/tokens.css`),
no component ever writes a literal color, and `platform` gets the one
sanctioned visual exception — a re-hued accent (`[data-portal="platform"]`)
plus a permanent scope banner, so it's never mistaken for a municipal
`admin` session (DESIGN_SYSTEM.md §5).

## Layout

```
frontend/
  packages/
    config/        shared tsconfig for packages and apps
    i18n/           translation keys + es-CR/en-US dictionaries, Intl-based formatting
    api-client/     typed client for CONTRACT.md §4, RFC 9457 error handling, mocks
    auth/           per-portal token storage/refresh, AuthProvider, route guards
    ui/              design system: tokens, icons, layout/list/card/chip primitives, form fields
    features/       shared business forms (registration, login, MFA, tenant switch)
  apps/
    citizen/        React + Vite + Capacitor — public self-registration, mocked parking-meter flow
    inspector/       React + Vite + Capacitor — approval-gated registration, mandatory MFA, outdoor density
    admin/            React + Vite (web) — user management, membership approval, audit, reports
    platform/        React + Vite (web) — municipalities, global user registry, global audit/reports/catalogs
```

## Requirements

Node 22, npm (workspaces — no pnpm/yarn).

## Install

```bash
npm install
```

## Run an app

Each app needs its own `.env` (copy from `.env.example`):

```bash
cp apps/citizen/.env.example apps/citizen/.env
npm run dev:citizen     # or dev:inspector / dev:admin / dev:platform
```

With `VITE_USE_MOCKS=true` (the default), every app runs fully offline
against the hand-rolled mock transport in
`packages/api-client/src/mocks` — no backend required. Seeded accounts:

| Portal     | Email                    | Password        | MFA code |
|------------|--------------------------|-----------------|----------|
| citizen    | citizen@example.com      | Password123!    | —        |
| admin      | admin@example.com        | Password123!    | 123456   |
| inspector  | inspector@example.com    | Password123!    | 123456   |
| platform   | platform@example.com     | Password123!    | 123456   |

`platform` has no sign-up screen at all (CONTRACT.md §0: `POST
/auth/platform/register` doesn't exist, 403 `SELF_REGISTRATION_DISABLED`) —
new platform operators are created by an existing `PLATFORM_ADMIN` from
inside the back-office (`apps/platform/src/pages/TenantDetailPage.tsx`'s
"create the municipality administrator" action is the tenant-scoped
equivalent; a platform-scope grant itself is modeled as a role attached
directly to the user rather than a `tenant_memberships` row — see the
comment on `MockUserRecord.platformRole`).

Set `VITE_USE_MOCKS=false` and `VITE_API_BASE_URL` to point at a real
LupaRX backend implementing CONTRACT.md §4.

## Typecheck & build everything

```bash
npm run typecheck   # tsc --noEmit across every package and app
npm run build       # builds all 4 apps (citizen, inspector, admin, platform)
```

## Why a hand-rolled mock transport, not MSW

`packages/api-client/src/mocks/server.ts` implements a `mockFetch` matching
the native `fetch` signature exactly, so it plugs into `HttpClient`'s
`fetchImpl` with zero call-site changes. This avoids adding MSW's service
worker/Node interceptor setup for a scaffold whose mock surface is a few
dozen routes — swap in MSW later without touching any app code, since both
approaches sit behind the same `fetchImpl` seam.

## Design notes

The visual language for every screen in every app is `../docs/DESIGN_SYSTEM.md` —
read that first before touching `packages/ui`. In short: dark by default,
tokens only (`--lx-*`, never a literal color), one glowing primary CTA per
screen, tabular-nums on every amount/timer, and nothing user-visible that
isn't behind an i18n key.

- **Field order.** The registration form (`packages/features/src/registration`)
  renders CONTRACT.md §2's field order exactly, identically in all three
  self-registering apps — it is one shared component, not three parallel copies.
- **No hardcoded market defaults.** `+506`, `CRC`, `Costa Rica`,
  `America/Costa_Rica`, and the CR admin-level labels (`Provincia`/`Cantón`/
  `Distrito`) never appear as UI logic — only as seed/mock data and as
  translated *values* inside the locale dictionaries, exactly where the
  corresponding catalog-driven `labelKey`/country default is supposed to
  resolve to text.
- **Address cascade is N-level, not fixed-3.** `AddressFields` renders
  however many levels `GET /catalog/countries/{code}/admin-levels` returns
  for the selected country (the mock catalog seeds a 3-level CR and a
  1-level US to prove it isn't hardcoded to 3).
- **Tokens.** Access/refresh tokens are the only sensitive data kept in
  `localStorage`, under a portal-namespaced key (`packages/auth/src/storage.ts`).
  The access token is short-lived (15 min) and the refresh token rotates
  with reuse detection server-side (CONTRACT.md §3); see that file's
  security note for the production hardening path (platform secure storage
  on native builds).

## TODO(extension) / TODO(domain)

Marked at the exact call sites (`grep -rn "TODO(extension)"`, `grep -rn "TODO(domain)"`):

- Zone assignment UI (`ZONE_ASSIGN` permission exists; no zones UI yet —
  depends on `module-parking`).
- Asynchronous export status polling (`admin/exports` is v0.1's synchronous
  CSV, <=10k rows, per CONTRACT.md §4).
- Role-assignment picker on the admin user-detail screen.
- **`apps/citizen`'s 8 screens are real UI wired to a mock parking domain**
  (`apps/citizen/src/mocks/parkingDomain.ts`) — vehicles, active session,
  fines and wallet movements are an in-memory store, not
  `/api/v1/citizen/vehicles` / `/parking-sessions`, because `module-parking`
  hasn't shipped. Every screen only calls the hooks at the bottom of that
  file, so wiring in the real endpoints + react-query later touches one file,
  not eight. `/inspector/patrols` and `/citations` remain a placeholder.
  `/admin/zones`, `/admin/rates`, `/admin/finance/*` stay unbuilt.
- `apps/platform`'s "Sistema" screen (`SystemPage.tsx`) is read-only on
  purpose — CONTRACT.md §4 leaves `/api/v1/platform/system/**` "preparado,
  no cerrado"; billing/plans/usage-limit controls arrive as new resources
  later, not as changes to what's already wired.
