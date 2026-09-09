# Running LuParX end to end in the container

This is the procedure that actually works in the agent container, written down because we repeat it
on every iteration. The goal is a real stack: PostgreSQL, the Spring Boot backend on `dev`, and the
four Vite apps pointed at it — no mock transport anywhere.

Nothing here belongs in a deployment. Every value below is a developer-laptop value, and the dev
profile prints its own warning saying so.

---

## 0. What the container already has

| Piece | Where | Notes |
|---|---|---|
| JDK | `javac`/`java` 21 on `PATH` | Matches the backend's `--release 21`. |
| PostgreSQL | 16, `/usr/lib/postgresql/16` | `service postgresql status` should say `online`. |
| Node | 22 | `npm ci` in `frontend/` is already done. |
| Chrome | `/opt/google/chrome/chrome` | What Playwright drives; there is no bundled browser. |

**There is no Maven Central access.** The egress proxy answers `403` to `CONNECT
repo.maven.apache.org:443`, so `mvn` cannot resolve a single dependency and `mvn package` is not an
option. The backend is compiled with plain `javac` against the dependency jars that already sit
inside the fat jar (§2). This is the whole reason the procedure looks unusual.

---

## 1. Bring the backend source over from the user's machine

The container's `backend/` can lag behind; the user's machine is the source of truth. The user's
machine has **no Maven and only Java 11**, so it can build nothing — it only supplies files.

On the user's machine (`mcp__remote-devices__device_bash`), inside `$HOME/mnt/luparx-evolution`:

```bash
tar czf .backend-sync.tar.gz --exclude=target backend docs
cp backend/app/target/luparx-app-0.1.0-SNAPSHOT.jar .luparx-app.jar
```

Stage both with `device_stage_files`; they land under `/mnt/user-data/uploads/luparx-evolution/`.
Then, in the container:

```bash
cd /home/claude/luparx-evolution
rm -rf backend docs
tar xzf /mnt/user-data/uploads/luparx-evolution/.backend-sync.tar.gz -C .
```

The jar may be older than the sources — that is fine and expected. It is used for its
**dependencies**, not its code. Check `backend/**/pom.xml` for dependency changes before trusting
it; if a dependency was added since the jar was built, the jar cannot supply it and someone has to
rebuild it on a machine with Maven.

## 2. Build the dependency classpath out of the fat jar

```bash
mkdir -p /home/claude/be/fat && cd /home/claude/be/fat
unzip -q /mnt/user-data/uploads/luparx-evolution/.luparx-app.jar 'BOOT-INF/lib/*'
ls BOOT-INF/lib | wc -l     # ~97 jars: Spring Boot, Hibernate, Flyway, the Postgres driver…
```

## 3. Compile (`/home/claude/be/build.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT=/home/claude/luparx-evolution/backend
OUT=/home/claude/be/classes
LIB=/home/claude/be/fat/BOOT-INF/lib
rm -rf "$OUT"; mkdir -p "$OUT"
find "$ROOT" -path '*/src/main/java/*' -name '*.java' > /home/claude/be/sources.txt
javac -nowarn -proc:none -parameters -encoding UTF-8 --release 21 \
  -cp "$LIB/*" -d "$OUT" @/home/claude/be/sources.txt 2>&1 | grep -v "^Picked up" | tail -30 || true
for m in platform-core module-geo module-identity module-tenancy module-parking app; do
  [ -d "$ROOT/$m/src/main/resources" ] && cp -r "$ROOT/$m/src/main/resources/." "$OUT/"
done
echo "OK classes=$(find "$OUT" -name '*.class' | wc -l)"
```

All six modules compile into one output directory — the module boundaries are enforced by the POMs,
and this build does not re-enforce them, so **keep using Maven for any real build**. Two flags are
not optional:

- **`-parameters`** — without it Spring cannot read constructor parameter names and the context
  fails to start with *"Parameter 1 of method publicChain … required a single bean, but 2 were
  found"*. That error looks like a bean-wiring bug and is not one.
- **`-proc:none`** — there is no annotation processor to run, and it keeps the build quiet.

Copying `src/main/resources` is what puts the Flyway migrations, `application*.yml` and
`messages.properties` on the classpath.

## 4. PostgreSQL

```bash
service postgresql start                       # port 5432
su postgres -c "psql -c \"ALTER ROLE luparx WITH PASSWORD 'luparx_dev_only' LOGIN\""
su postgres -c "psql -c 'DROP DATABASE IF EXISTS luparx'"
su postgres -c "psql -c 'CREATE DATABASE luparx OWNER luparx'"
su postgres -c "psql -d luparx -c 'CREATE EXTENSION IF NOT EXISTS citext'"
```

Flyway owns the schema from there (V1 → V12). Dropping and recreating the database is the fastest
way back to a known state; the dev seeder refills it on the next start.

## 5. Run (`/home/claude/be/run.sh`)

```bash
#!/usr/bin/env bash
set -uo pipefail
export SPRING_PROFILES_ACTIVE=dev
export SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/luparx   # note 5432, not the 5442 default
export SPRING_DATASOURCE_USERNAME=luparx
export SPRING_DATASOURCE_PASSWORD=luparx_dev_only
export SERVER_PORT=8090
export LUPARX_DEV_PARKING_SPACES=200          # 5000 is the default; 200 starts much faster
# End-to-end suites sign in far more often than a person does, and the production defaults
# (5 failures per e-mail / 15 min) lock the demo account out mid-run. Local only.
export LOGIN_MAX_FAILURES_PER_EMAIL=200
export LOGIN_MAX_FAILURES_PER_IP=500
exec java -Djava.net.useSystemProxies=false -Dhttp.proxyHost= -Dhttps.proxyHost= \
  -cp "/home/claude/be/classes:/home/claude/be/fat/BOOT-INF/lib/*" \
  cr.luparx.app.LuparxApplication
```

```bash
nohup /home/claude/be/run.sh > /home/claude/be/app.log 2>&1 &
sleep 45 && curl -sS --noproxy '*' http://localhost:8090/actuator/health   # {"status":"UP"}
```

Disabling the JVM proxy properties matters: `JAVA_TOOL_OPTIONS` in this container points every JVM
at the egress proxy, and the app would try to reach `localhost:5432` through it.

Locked out anyway? `su postgres -c "psql -d luparx -c 'DELETE FROM auth_attempts'"` clears the
throttle without a restart.

The dev seeder prints the accounts on every start — all `Password123!`, portals `citizen`, `admin`,
`inspector`, `platform`, municipality **San José** (`san-jose`).

## 6. The frontend against the real backend

Each app reads its own `.env`. `VITE_USE_MOCKS=false` is what switches off the in-process mock
transport:

```bash
cd /home/claude/luparx-evolution/frontend
for a in citizen admin inspector platform; do
  printf 'VITE_API_BASE_URL=http://localhost:8090\nVITE_PORTAL=%s\nVITE_USE_MOCKS=false\n' "$a" > "apps/$a/.env"
done
npm run dev:citizen &   # 5183
npm run dev:admin &     # 5184  (inspector 5185, platform 5186)
```

The ports are not arbitrary: the backend's per-portal CORS allow-list (`application.yml`,
`luparx.security.cors-allowed-origins`) names exactly these origins, one per portal, with no
wildcard. A dev server on another port is refused by the browser, not by the app.

## 7. Curl-level smoke test

```bash
export NO_PROXY='*'; unset HTTPS_PROXY HTTP_PROXY   # localhost must not go through the proxy
TID=$(curl -sS localhost:8090/api/v1/catalog/tenants | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
TOK=$(curl -sS -X POST localhost:8090/api/v1/auth/citizen/login \
  -H 'Content-Type: application/json' -H "X-Tenant-Id: $TID" \
  -d '{"email":"citizen@luparx.test","password":"Password123!"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")
curl -sS localhost:8090/api/v1/citizen/vehicles -H "Authorization: Bearer $TOK"
```

`curl -sS localhost:8090/v3/api-docs` dumps the OpenAPI document — the fastest way to check a wire
shape before writing a client type. Several of the bugs fixed in v0.3 were shapes the frontend had
guessed rather than read.

## 8. Browser tests

Playwright with the system Chrome (there is no bundled browser download):

```bash
npm i -D playwright@1.49.1     # library only
```

```js
import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
```

The scripts used for v0.3 live in `/home/claude`:

| Script | What it does |
|---|---|
| `e2e-reset.mjs` | Puts the database back to a known state **through the API**: restores the demo password, finishes any running session, deletes leftover test vehicles, and turns on round-the-clock charging. Run it before every suite. |
| `e2e-citizen.mjs` | Sign in → add a vehicle → start a stay → extend → finish → minute credit → edit the profile → switch language → change the e-mail → change the password. |
| `e2e-admin.mjs` | Sign in → languages → bay code format → charging hours, saving each. |

`e2e-reset.mjs` exists for a reason: the suite deliberately changes the password (which ends every
session) and deliberately leaves a finished session behind, so a second run against an unreset
database fails on step one. Always run the reset, never edit rows by hand.

Note on **round-the-clock charging**: the container's clock is usually the middle of the night in
`America/Costa_Rica`, where the default schedule (Mon–Sat 07:00–18:00) charges nothing and the
server refuses to start a stay with `OUTSIDE_CHARGING_HOURS`. The reset flips the municipality to
24-hour charging through the admin API so the citizen flow can run at any hour.

---

## Backend gaps that were closed since

Both of the gaps this file used to list are gone, and the notes are kept only so nobody re-adds the
workarounds:

1. **`GET /api/v1/citizen/parking/zones` exists.** It returns the active zones of the municipality
   with the tariff in force and the bay-code range of each. `useParkingZones` still has a `404`
   branch that falls back to the citizen's own history — that is for an older server, not for this
   one, and it should not be treated as the normal path.
2. **`GET /api/v1/citizen/parking/space-format` exists.** The citizen's bay-code field uses the
   municipality's own `example` as its placeholder and its `pattern` to refuse an impossible code
   before spending a round trip.

Added in v0.6 and used by the extend dialog:
`GET /api/v1/citizen/parking/sessions/{id}/extension-options` — every extension the municipality
offers on that stay, priced, with `chargeableMinutes`, the credit applied, `payable`, `newExpiresAt`,
and `allowed`/`unavailableReason` for the ones it will not sell.

## Still missing

**No wallet top-up endpoint.** `WalletService.topUp` exists but nothing exposes it over HTTP, so a
balance can only come from the dev seeder. A citizen who joins a municipality for the first time
starts at zero and cannot start a stay there until one exists. The end-to-end suites work around it
by using the seeded accounts that already have a balance.

## End-to-end suites

| Script | What it covers |
|---|---|
| `/home/claude/e2e-reset.mjs` | Puts the database back to a known state **through the API**. Run it before every suite. |
| `/home/claude/e2e-v06.mjs` | The v0.6 surface: the custom dropdown by mouse and keyboard, a price on every duration, the extend and finish dialogs, joining a municipality with no prior membership, and editing every personal datum from one screen. |
| `/home/claude/e2e-v06-edges.mjs` | Two cases the main suite cannot reach: an extension option refused for lack of balance, and a citizen with a single membership entering another municipality. Sets up its own fixture. |
| `/home/claude/shots-v06.mjs` | The screenshots in `/home/claude/previews/v06/`, at 320×568, 390×844 and 1440×900. |
