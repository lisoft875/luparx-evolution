# LupaRX — Citizen app

React + Vite web app, wrapped by Capacitor 6 for iOS/Android. Public
self-registration portal for citizens (CONTRACT.md §0) — its login, tokens,
and routes are isolated from the `admin` and `inspector` apps.

## Run as a web app

```bash
cp .env.example .env
npm run dev --workspace=@luparx/citizen
```

With `VITE_USE_MOCKS=true` (the default in `.env.example`) the app runs
fully offline against the in-memory mock transport in
`@luparx/api-client/mocks` — no backend needed. Seeded mock account:
`citizen@example.com` / `Password123!`.

## Build

```bash
npm run build --workspace=@luparx/citizen
```

## Native shells (iOS / Android)

This repo does **not** run `npx cap add` — no native SDKs are available in
this environment. To produce the native projects on a machine with Xcode /
Android Studio installed:

```bash
npm run build --workspace=@luparx/citizen
npx cap add ios       # from apps/citizen, once
npx cap add android   # from apps/citizen, once
npm run cap:sync --workspace=@luparx/citizen
npx cap open ios      # or: npx cap open android
```

Set `LUPARX_CITIZEN_APP_ID` / `LUPARX_CITIZEN_APP_NAME` env vars before
`cap add`/`cap sync` to override the defaults in `capacitor.config.ts` for a
white-labeled build.
