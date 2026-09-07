# LupaRX — Inspector app

React + Vite web app, wrapped by Capacitor 6 for iOS/Android. Enforcement
portal: self-registration here leaves the membership `PENDING_APPROVAL`
until a `TENANT_ADMIN`/`PLATFORM_ADMIN` approves it, and MFA is mandatory
for every login (CONTRACT.md §1/§3). Its login, tokens, and routes are
isolated from the `citizen` and `admin` apps.

## Run as a web app

```bash
cp .env.example .env
npm run dev --workspace=@luparx/inspector
```

With `VITE_USE_MOCKS=true` (the default in `.env.example`) the app runs
fully offline against the in-memory mock transport in
`@luparx/api-client/mocks` — no backend needed. Seeded mock account:
`inspector@example.com` / `Password123!` (MFA code `123456`).

## Build

```bash
npm run build --workspace=@luparx/inspector
```

## Native shells (iOS / Android)

This repo does **not** run `npx cap add` — no native SDKs are available in
this environment. To produce the native projects on a machine with Xcode /
Android Studio installed:

```bash
npm run build --workspace=@luparx/inspector
npx cap add ios       # from apps/inspector, once
npx cap add android   # from apps/inspector, once
npm run cap:sync --workspace=@luparx/inspector
npx cap open ios      # or: npx cap open android
```

Set `LUPARX_INSPECTOR_APP_ID` / `LUPARX_INSPECTOR_APP_NAME` env vars before
`cap add`/`cap sync` to override the defaults in `capacitor.config.ts` for a
white-labeled build.
