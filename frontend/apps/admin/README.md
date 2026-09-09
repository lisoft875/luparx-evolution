# LupaRX — Admin app

React + Vite web app (no Capacitor — municipal staff use this from a
desktop browser). Municipal administration portal: user management,
membership approval, audit log and the registered-users report
(CONTRACT.md §4 `/api/v1/admin/**`). Its
login, tokens, and routes are isolated from the `citizen` and `inspector`
apps.

## Run

```bash
cp .env.example .env
npm run dev --workspace=@luparx/admin
```

With `VITE_USE_MOCKS=true` (the default in `.env.example`) the app runs
fully offline against the in-memory mock transport in
`@luparx/api-client/mocks` — no backend needed. Seeded mock account:
`admin@example.com` / `Password123!`, a `TENANT_ADMIN`
for Municipalidad de San José.

## Build

```bash
npm run build --workspace=@luparx/admin
```

## Scope (v0.1)

Implemented: user list with search/filter/pagination, user detail with
block/unblock, force password reset, membership
approve/reject, audit log, and the registered-users report.

Marked `// TODO(extension)` for the user to define later: zone assignment
UI (`ZONE_ASSIGN` exists as a permission but module-parking's zones aren't
built yet) and asynchronous export status polling (v0.1's
`POST /admin/exports` is synchronous CSV, <=10k rows, per CONTRACT.md §4).
