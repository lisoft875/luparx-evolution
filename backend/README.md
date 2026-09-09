# LupaRX — backend

Modular monolith, Java 21, Spring Boot 3.3.4, PostgreSQL 16, Flyway.
Normative source: [`docs/CONTRACT.md`](../docs/CONTRACT.md). Where anything here disagrees with it,
the contract wins.

## Modules

| Module | Artifact | Depends on | Contains |
|---|---|---|---|
| `platform-core` | `luparx-platform-core` | — | `TenantId`/`UserId`, UUID v7, `Money`, `Portal`/`Role`/`Permission`/`RolePermissions`, RFC 9457 errors + `ErrorCode`, paging, `TenantContext`, audit & outbox ports |
| `module-geo` | `luparx-module-geo` | core | countries, N-level administrative divisions, document rules, `PhoneNumberService`, `IdentityDocumentValidator`, `AddressValidator` |
| `module-identity` | `luparx-module-identity` | core, geo | users, credentials (Argon2id), TOTP MFA, federation linking, JWT issuance, refresh rotation, login rate limiting |
| `module-tenancy` | `luparx-module-tenancy` | core | tenants, settings, memberships, `AccessResolver`, per-tenant reports |
| `module-parking` | `luparx-module-parking` | core, tenancy | zones, tariffs, numbered spaces, vehicles, the per-municipality parking policy, sessions (start/extend/finish), the per-tenant wallet and the minute credits; patrols still deferred |
| `module-enforcement` | `luparx-module-enforcement` | core, tenancy | the infraction catalogue, citations and their legal life cycle, the citation's own history, evidence metadata, the per-municipality consecutive; talks to parking only through `ParkingStatusPort` (ADR 0014) |
| `app` | `luparx-app` | all | Spring Boot bootstrap, security, controllers, Flyway, OpenAPI, observability |

The dependency rule of `docs/ARCHITECTURE.md` §1 is enforced by the POMs, not by convention.
`module-tenancy` has **no** Maven dependency on `module-identity`: it references people only through
`cr.luparx.core.id.UserId`, while the database still holds the foreign key. That is what makes a
future extraction a change of transport rather than a rewrite.

## Build and run

```bash
# 1. Infrastructure (PostgreSQL + Mailpit)
cd infra && cp .env.example .env && docker compose up -d && cd ..

# 2. RSA key pair for RS256 access tokens (never commit these)
mkdir -p infra/secrets
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
    -out infra/secrets/jwt-private-dev.pem
openssl rsa -in infra/secrets/jwt-private-dev.pem -pubout \
    -out infra/secrets/jwt-public-dev.pem

# 3. AES key protecting TOTP secrets at rest (32 bytes, Base64)
export MFA_TOTP_ENCRYPTION_KEY="$(openssl rand -base64 32)"
export IP_HASH_PEPPER="$(openssl rand -hex 16)"

# 4. Build and run
cd backend
mvn clean verify                                # compila e instala todos los modulos
# -am rebuilds the modules `app` depends on inside the same reactor; without it Maven
# resolves them from ~/.m2 and compiles against stale jars.
mvn -pl app -am spring-boot:run -Dspring-boot.run.profiles=dev
```

> `openssl genpkey` is required rather than `openssl genrsa`: the loader reads **PKCS#8** PEM
> (`-----BEGIN PRIVATE KEY-----`). A key produced by `openssl genrsa` is PKCS#1 and must be
> converted with `openssl pkcs8 -topk8 -nocrypt -in old.pem -out new.pem`.

Flyway runs at startup and creates the schema plus the catalogue seed. Hibernate is set to
`ddl-auto: none` on purpose: `citext` and `jsonb` columns are beyond what the dialect would infer,
and the schema belongs to the migrations.

> **Migration numbering.** `V1_0`–`V5_0` are structure by layer and `V9_x` is catalogue seed data.
> A new migration must sort *after* everything an existing database has already applied — out-of-order
> migration is off on purpose — which is why the parking-space table is `V10_0` and the parking
> domain of v0.2 is `V11_0`, not `V6_0`/`V7_0`:
> numbering it by layer would have forced every existing database to be recreated. Nothing needs to be
> reset; Flyway applies `V10_0`/`V11_0` on the next start. If a database is ever left inconsistent,
> `cd infra && docker compose down -v && docker compose up -d` recreates it from scratch.

- API: `http://localhost:8090`
- OpenAPI: `http://localhost:8090/v3/api-docs` — Swagger UI at `/swagger-ui.html`
- JWKS: `http://localhost:8090/.well-known/jwks.json`
- Mail (dev): Mailpit at `http://localhost:8035`

## Development seed data (`dev` profile only)

A fresh database has no users, so a login can only answer `INVALID_CREDENTIALS`. Under the `dev`
profile `DevDataSeeder` creates the launch municipality — **Municipalidad de San José**, slug
`san-jose`, whose country, currency, locale and time zone come from `platform.defaults.*`, nothing
hardcoded — and one account per portal, each with an **active** membership and a verified email:

| Portal | Email | Password | Role |
|---|---|---|---|
| citizen | `citizen@luparx.test` | `Password123!` | `CITIZEN` |
| admin | `admin@luparx.test` | `Password123!` | `TENANT_ADMIN` |
| inspector | `inspector@luparx.test` | `Password123!` | `INSPECTOR` |
| platform | `platform@luparx.test` | `Password123!` | `PLATFORM_ADMIN` (no tenant) |

> These credentials are public, weak and printed at `WARN` on every start. They exist to make a
> laptop usable and **must never exist in any environment somebody else can reach**. The bean is
> annotated `@Profile("dev")`, so it does not exist at all under any other profile.

San José is **seed data, not an assumption of the code**: the zone list and the municipality name are
constants of the fixture, and a deployment in another country changes them without a line of domain
logic moving. Earlier revisions of this fixture created a placeholder tenant `demo-municipality`; if
your database still has it, the seeder **closes** it (a tenant is never deleted — memberships, audit
rows and ledgers reference it) so exactly one municipality is active. A database created from scratch
never has it at all.

The seeder is idempotent: it looks the tenant up by slug, the users by email and the memberships by
tenant + user + portal, and does nothing when they are already there. It runs through the real
`UserRegistrationService`, `EmailVerificationService` and `MembershipService` — the password is
hashed by the real `PasswordService`, never written as a literal — so what it produces is exactly
what a real registration produces. An account it cannot create (a catalogue that does not offer a
passport for the configured default country, or a country with no administrative divisions seeded)
is logged and skipped; the seeder never prevents startup.

#### Repairing accounts seeded before San José existed

A database created before the San José fixture has its development accounts in
`demo-municipality`, which the seeder closes on the next start. Closing it is not enough on its own:
the account keeps that membership, gains one in San José, and ends up holding **two** active
memberships on the same portal — one of them pointing at a closed municipality. A session with two
municipalities to choose from starts with none selected, so the token carries no `tid`, no roles and
no permissions, and every tenant-owned endpoint answers *access denied* for an account that in truth
belongs to exactly one municipality.

So `DevDataSeeder.repairMemberships` **revokes the membership that can no longer grant anything**,
leaving every seeded account with exactly one usable membership, in the active municipality. It logs
one `WARN` per account it repairs. Revoked and not deleted: a membership is history, and the fixture
uses the same transition the back-office would. It is idempotent — on a database that never had the
legacy municipality it does nothing — and it exists **only under the `dev` profile**, because it
repairs *development fixtures*: a real deployment's memberships are somebody's decision and are never
rewritten on start. The equivalent for a real environment is not a silent repair but an explicit
answer, which is what `NO_ACTIVE_MEMBERSHIP` is for (see below).

### The five municipalities

One municipality cannot exercise a multi-tenant platform: with a single tenant, a price list that
leaks across municipalities, a bay code assumed to be four digits and a timetable assumed to be the
launch one all look correct. So the fixture operates **five**, and each exists to make one
configuration real. San José is unchanged — it keeps the platform defaults, and every credential a
developer already had memorised keeps working.

| Municipality | Slug | Zones | Hourly tariff | Bay codes | Charging hours | Policy | What it exercises |
|---|---|---|---|---|---|---|---|
| San José | `san-jose` | 8 | 500–800 | `0001`–`5000` | Mon–Sat 07:00–18:00 | platform defaults | The baseline |
| Escazú | `escazu` | 3 | 600–900 | `E-0001`–`E-1200` | **24 hours** | defaults | `charges_all_day`, and a **prefixed alphanumeric** code format (`^E-[A-Z0-9]{4}$` — `E-A12B` is valid too) |
| Montes de Oca | `montes-de-oca` | 4 | 550–800 | `0001`–`1500` | **Mon–Fri 08:00–17:00** | defaults | Short hours, and **Saturday and Sunday not charged** |
| La Unión | `la-union` | 3 | 400–500 | `0001`–`0900` | Mon–Sat 07:00–19:00 | defaults | **Dated holidays**: 15 September and 25 December loaded as exceptions |
| Cartago | `cartago` | 4 | 450–650 | `0001`–`1400` | Mon–Sat 07:00–18:00 | **extensions off, no credit**, 4 h cap | The two flows a client must degrade gracefully without |

Their zones are anchored to **real districts** with their official codes: `V13_0` seeds the cantons
Montes de Oca (115) and La Unión (303), Escazú's third district and Cartago's ten remaining ones.
Names follow the official register, so `Carmen` rather than "El Carmen" and `Aguacaliente` rather
than "Agua Caliente".

**Bays.** The launch municipality gets `luparx.dev.parking-spaces` (default 5000) of its own; the
other four share `luparx.dev.parking-spaces-total` (default 5000) *between them*, dealt by weight —
Escazú 1200, Montes de Oca 1500, La Unión 900, Cartago 1400. Five municipalities with five thousand
bays each would be a load test, not a fixture. Codes restart from the first one **inside each
municipality**, because they are unique per tenant, and every code is generated from that
municipality's own stored format, so a seeded bay is always one it would accept.

### Citizens, staff and their money

| Account | Municipalities | Opening top-up | Balance after the seeded history |
|---|---|---|---|
| `ana.morales@luparx.test` | San José, Escazú, Montes de Oca | 150 000 / 100 000 / 50 000 | 147 000 / 97 500 / 48 100 |
| `bruno.castro@luparx.test` | Cartago | 20 000 | 17 350 |
| `carla.jimenez@luparx.test` | La Unión | 2 000 | 700 |

Amounts are in the municipality's own currency (CRC with the default configuration). **The wallet is
per municipality** (CONTRACT.md v0.2, rule 6): Ana's three balances are three separate accounts and
spending in one leaves the others untouched — which is the point of seeding her with three.

**Ana belongs to three municipalities on purpose.** It is the only way to reach two states a
single-tenant account never sees: switching the active municipality
(`POST /citizen/session/tenant`) and the `TENANT_CONTEXT_REQUIRED` answer her session gets *before*
she picks one. Bruno and Carla belong to one each, so their sessions resolve a municipality
automatically. Carla's balance is deliberately small: she is the account that runs into
`INSUFFICIENT_BALANCE` without anyone having to spend anything first.

Every municipality also gets its own staff, with predictable addresses — `admin.escazu@luparx.test`,
`inspector.escazu@luparx.test`, and the same for the other three. They are scoped to their own
municipality rather than to all of them, because that is how a municipality works and because an
administrator who could see every one would make a cross-tenant leak invisible in development. The
original `admin@luparx.test` and `inspector@luparx.test` still exist, in San José.

**History, not empty rows.** Each citizen gets vehicles, two closed stays and — in their first
municipality — one still running, a wallet whose movements add up to its balance, and minutes already
to their favour where the municipality credits them. The plate `SJP123` is registered by **two
different people**, which is legitimate and expected (uniqueness is `(user_id, plate_normalized)`,
never the plate alone) and is exactly the ambiguity an inspector lookup still has to resolve.

The history is written with SQL rather than through `ParkingSessionService`, and that is deliberate:
the service charges against the clock of the moment it runs, so a stay that ended last Tuesday is not
something it can be asked for, and a municipality whose charging hours are closed right now would
refuse to open one at all. The wallet arithmetic is therefore carried explicitly — the top-up is
dated before the stays it funded and every `balance_after_minor` is the running total — because a
statement that does not add up would be worse than no statement.

### Parking fixture (zones, tariffs and bays)

Once a municipality exists, `DevParkingSeeder` gives it the parking it operates: its zones, each
linked to its real district in `administrative_divisions` (seeded by `V9_1`/`V9_2`/`V13_0`), one
open-ended **hourly tariff** per zone priced in the municipality's own currency, its policy, its
charging timetable, its bay code format, and its numbered bays. The same code runs for all five; a
municipality whose variant is null keeps the platform defaults, which is what San José does.

San José, unchanged, is the worked example:

| Zone code | Name | District | Bays (default 5000) |
|---|---|---|---|
| `SJ-AMON` | Barrio Amón | Carmen (`10101`) | `0001`–`0500` |
| `SJ-ESCALANTE` | Barrio Escalante | Carmen (`10101`) | `0501`–`1250` |
| `SJ-MERCADO` | Mercado Central | Merced (`10102`) | `1251`–`2000` |
| `SJ-COLON` | Paseo Colón | Merced (`10102`) | `2001`–`2750` |
| `SJ-HOSPITAL` | Hospital San Juan de Dios | Hospital (`10103`) | `2751`–`3350` |
| `SJ-CATEDRAL` | Catedral – La Soledad | Catedral (`10104`) | `3351`–`3950` |
| `SJ-ZAPOTE` | Zapote Centro | Zapote (`10105`) | `3951`–`4450` |
| `SJ-SABANA` | La Sabana | Mata Redonda (`10108`) | `4451`–`5000` |

A bay's `code` is what is painted on the street and what the citizen types, so it is **text with its
leading zeros intact** (`0001`), never a number, and it is unique per municipality rather than
globally. Codes are dealt to the zones in contiguous blocks proportional to a declared share, with
the boundaries computed from the cumulative share (`start = total × cumulative ÷ totalShare`) — that
partitions the range exactly, so there is no remainder to hand out, no gap and no bay in two zones.
Changing the count re-derives every boundary; the table above is San José's default of 5000. The
same arithmetic deals the shared pool between the other four municipalities, and each of them numbers
its own bays from the first code — they are unique per tenant, so Escazú's `E-0001` and Cartago's
`0001` coexist exactly as two real municipalities would.

The insert is batched (`JdbcTemplate.batchUpdate`, 1000 rows per statement) inside a single
transaction and takes well under a second; the log line says how many rows it created and in how
long. It is idempotent by code: the codes already present are read once and skipped, so an
interrupted run completes on the next start. Only *missing* codes are created — an existing bay is
never moved to another zone, so changing the shares after a seed has run has no effect until the
database is recreated.

How many bays is configuration, not a constant:

```bash
# Anything from 1 to 10000; above the maximum it is clamped and a WARN says so.
mvn -pl app -am spring-boot:run -Dspring-boot.run.profiles=dev \
    -Dspring-boot.run.arguments=--luparx.dev.parking-spaces=50
# or: export LUPARX_DEV_PARKING_SPACES=50
```

To turn it off:

```bash
# -am rebuilds the modules `app` depends on inside the same reactor; without it Maven
# resolves them from ~/.m2 and compiles against stale jars.
mvn -pl app -am spring-boot:run -Dspring-boot.run.profiles=dev \
    -Dspring-boot.run.arguments=--luparx.dev.seed-demo-data=false
# or: export LUPARX_DEV_SEED_DEMO_DATA=false
```

### Parking policy and wallet fixture

`DevParkingSeeder` also materialises the municipality's **parking policy** and funds the development
citizen's **wallet**. Neither writes a value of its own: the policy is created by
`ParkingPolicyService` from `platform.defaults.parking.*`, so the fixture and a real municipality's
first day go through the same code path, and changing what San José offers in development is a change
to YAML rather than to Java. The wallet is funded once, with an amount declared in *major* units and
converted with `Money.ofMajor`, so it is denominated in whatever currency the municipality was
configured with; a wallet that already holds money is left alone, so a developer who spent it on test
sessions keeps their state and a restart does not quietly refill it.

## The parking domain (v0.2)

`docs/CONTRACT.md` "v0.2 — Dominio de parqueo" is the normative source; this is the map.

| Table | Owner | What it holds |
|---|---|---|
| `vehicles` | **the person** | The cars a citizen registered. No `tenant_id`: a person is global and drives the same car to two municipalities |
| `parking_policies` | tenant (PK) | Every rule of the flow as data: increments, caps, extension, early finish, credit and grace |
| `parking_sessions` | tenant | A paid stay: one vehicle, one bay, with `plate_snapshot` and the money and minutes it consumed |
| `parking_session_extensions` | tenant | Each extension, with what it cost |
| `wallet_accounts` / `wallet_transactions` | tenant | The citizen's money **in that municipality**; there is no global balance |
| `parking_time_credits` / `parking_time_credit_entries` | tenant | Minutes to the citizen's favour, in lots with their own expiry |

Four decisions worth not re-litigating:

**A plate is unique per user, never globally.** Two people registering the same plate is legitimate —
a shared family car, a company car, a plate reused after a transfer — so the constraint is
`UNIQUE (user_id, plate_normalized)`. The consequence is that an inspector's lookup by plate can match
several citizens; `ParkingSessionRepository` returns *every* active match and carries a
`TODO(domain)` saying that disambiguating them (by zone and bay) is an open product decision. Picking
the first match would let a real infraction be excused by somebody else's session.

**The two invariants are partial unique indexes, not service code.** `uq_parking_sessions_active_space`
and `uq_parking_sessions_active_vehicle` are defined `WHERE status = 'ACTIVE'`, so "one session per
bay" and "one per vehicle" hold with any number of backend instances. A session past the
municipality's grace is moved to `EXPIRED` lazily, the next time anybody looks at that bay or vehicle:
no scheduler, idempotent, and the bay is never held by a session nobody is paying for.

**Money is charged, minutes are credited.** Finishing early never returns money. If the policy allows
it, the remaining minutes become a credit lot with its own expiry, consumed soonest-expiry-first on
the next session *in the same municipality*. Charge and session are written in one transaction:
`INSUFFICIENT_BALANCE` leaves no session, no spent minutes and no debit.

**An option outside the policy is an error, not a rounding.** `INVALID_INCREMENT` — the platform never
charges for something other than what the citizen asked for.

Start, extend and finish are on `IdempotencyFilter`'s protected list, so the `Idempotency-Key` header
is mandatory there and a repeated key replays the stored response instead of charging again
(ADR 0012). The key reaches the domain only to be recorded on the rows it creates.

## Account, languages and municipal operation (v0.3)

`docs/CONTRACT.md` "v0.3 — Cuenta, idiomas y operación de la municipalidad" is the normative source.
Everything below arrives with migration `V12_0__account_and_tenant_operations.sql`.

### No MFA, and a session that does not expire

`luparx.security.mfa-enforced-portals` is **empty by default on every profile**. No portal asks for a
second factor and the application says so with a one-line `INFO` at start (`MFA is enforced on: no
portal`). The TOTP code is intact behind that list: turning it back on for a portal is adding its slug
(`MFA_ENFORCED_PORTALS=admin,inspector,platform`), not rewriting the module.

> **Risk accepted in writing by the product.** The platform back-office administers every municipality
> with an email address and a password alone. What compensates for it today is the password policy,
> the database-backed attempt limiter, and — before this is exposed to the open internet —
> restricting it by IP.

`luparx.jwt.refresh-token-ttl` now accepts **`0`, the default, meaning no expiry**. The refresh token
is persisted without `expires_at` (the column is nullable since `V12_0`) and is never refused for
being old, so a signed-in citizen stays signed in while the client silently renews its access token.

What still ends a session is unchanged and deliberate:

* **logging out** — revokes the presented token;
* **changing the password** — bumps `credentials_version`, so every access token minted earlier is
  refused on its next call, and revokes every refresh token;
* **an administrator blocking the account** — same bump, same revocation.

**Rotation and reuse detection are untouched.** Every refresh still consumes its token and issues a
successor in the same family, and a token presented twice still revokes the whole family. Setting a
duration (`JWT_REFRESH_TOKEN_TTL=30d`) brings expiry back with no migration.

### Own account

```
PUT  /api/v1/{portal}/me                 name, document, address, phone, nationality, birth date
POST /api/v1/{portal}/me/password        {currentPassword, newPassword} -> {tokens}
POST /api/v1/{portal}/me/email           {newEmail} -> {pendingEmail}
POST /api/v1/auth/{portal}/email/change/confirm  {token}   (public: opened in the NEW mailbox)
```

`PUT /me` accepts every personal datum of `CONTRACT.md` §2 **except the email address**, and validates
each of them with the rules registration uses — `UserProfileService` shares the document validator,
the address validator, the phone service and the configured minimum age with `UserRegistrationService`.
A null section is left untouched rather than cleared, so a screen that owns one section cannot wipe
the others.

The **email address has its own flow** because changing it is changing the identity of access. `POST
/me/email` stores the new address *on a one-time token* and mails a link **to that address**; only
confirming it replaces the account's address, marks it verified and revokes every session. Both the
request and the confirmation are audited (`USER_EMAIL_CHANGE_REQUESTED`, `USER_EMAIL_CHANGED`).

`POST /me/password` requires the current password — a stolen session must not be enough to lock the
owner out — applies the existing strength policy, revokes every other session and hands the caller a
fresh token pair so the browser that changed the password is the one session that survives.

### Languages per municipality

`tenant_locales` holds the languages a municipality enables, which one is its default, and the order
of the dropdown. A municipality that has configured nothing is answered with the language it was
created with (`tenants.locale`), materialised as a real row on first read.

```
GET     /api/v1/catalog/tenants/{id}/locales      public — the login screen needs it
GET|PUT /api/v1/admin/settings/locales            permission TENANT_MANAGE
```

Resolution is deterministic and lives in **one** service, `EffectiveLocaleService`, never spread
across controllers: **user preference (if the municipality offers it) → the municipality's default →
the language the municipality was created with → `platform.defaults.locale`**. A preference the
municipality does not offer is not honoured — a portal with no Norwegian translations must not serve a
half-translated screen — and `PUT /me` refuses to *store* one, with `LOCALE_NOT_SUPPORTED`.

### Bay code format

`parking_space_formats`, one row per municipality: `prefix`, `digits`, `allow_letters`, `pattern`
(the effective regular expression) and `example`. The server validates against `pattern` **when a bay
is created and when a session is started**; the app uses `example` as the placeholder and `pattern` to
validate while the citizen types. Codes are canonicalised (trimmed, upper-cased) before both.

```
GET|PUT /api/v1/admin/parking/space-format        permission TENANT_MANAGE
POST    /api/v1/admin/parking/spaces              {zoneId, code}  (Idempotency-Key)
GET     /api/v1/citizen/parking/space-format      the same row, read by the app
```

San José starts on four plain digits, `0001`–`5000`, which is what the fixture paints. Leave
`pattern`/`example` out of the `PUT` and both are derived from the parts; send a `pattern` and it is
taken as written, but the example must still match it.

### Charging hours

`parking_schedules` (the header, with `charges_all_day`), `parking_schedule_slots` (bands per weekday)
and `parking_schedule_exceptions` + `..._exception_slots` (dated holidays, with or without hours of
their own). The default is **Monday to Saturday, 07:00–18:00, Sunday not charged**, and it comes from
`platform.defaults.parking.charging-*` — nothing in the domain carries an hour as a constant.

```
GET|PUT /api/v1/admin/parking/schedule            permission TENANT_MANAGE
GET     /api/v1/citizen/parking/schedule          hours, whether charging now, when it resumes
```

### What a citizen needs before parking

`quote` and starting a session both take a `zoneId` and a bay code, and until now the only listing of
zones lived on the admin portal behind `PERM_TENANT_MANAGE`. A client had no citizen-reachable way to
obtain a zone id, so it fell back to mining them out of the caller's own session history — which shows
a newly registered citizen an empty list and no way to start.

```
GET /api/v1/citizen/parking/zones          operated zones of the active municipality, with their tariff
GET /api/v1/citizen/parking/space-format   prefix, digits, allowLetters, pattern, example
```

Both are scoped by the tenant in the token, never by a parameter, and answer explicit `record` DTOs —
`CitizenParkingZoneResponse` is a different shape from the admin one: a citizen has no business seeing
whether a zone is active (only active ones are listed) or how many bays it holds, and does need the
price, which the admin listing does not carry. A zone with no open tariff window comes back with
`rate: null`; that is a misconfigured zone, not a free one, and starting a session there still answers
`PARKING_RATE_NOT_FOUND`.

**Not paginated, on purpose.** A zone is a sector a municipality operates — San José has eight — and
the count is bounded by how a city is organised, not by how many citizens or sessions it has. What
grows without limit is the bays inside a zone, and those are only ever read by code or by page. Both
responses are cacheable but `Cache-Control: private` (60 s for the zones, because they carry prices;
15 min for the code format): they are one municipality's configuration resolved for an authenticated
caller, so a shared cache holding them would serve one tenant's data to another.

**Only the minutes that fall inside a band are charged**, evaluated in the *municipality's* time zone.
A stay from 17:30 to 19:00 where charging closes at 18:00 pays thirty minutes; an extension is priced
on the stretch it adds, so extending at 17:55 into the evening is free. A stay with **no** chargeable
minute at all is refused with `OUTSIDE_CHARGING_HOURS`, and `GET /citizen/parking/schedule` says when
charging resumes so the app can put it in words. `POST /citizen/parking/quote` now answers
`chargeableMinutes` alongside `minutes`.

Bands are stored as local minutes from midnight (0–1440) rather than as `time` columns: a band has to
be able to close the day, and `java.time.LocalTime` has no 24:00. A band never crosses midnight — a
night tariff is two bands, one per day — which keeps the intersection arithmetic honest. Precedence is
**dated exception → `charges_all_day` → the weekday's bands**; a declared holiday wins even over a
municipality that charges around the clock, because "all day" is a statement about the daily timetable
and a holiday is one about the calendar.

The intersection lives in `ChargingSchedule`, a framework-free value object with no repository, clock
or Spring in sight, and `ChargingScheduleTest` covers the edges that would otherwise overcharge a
citizen or give away an afternoon: exact boundaries, crossing midnight, a weekday with no band, a
holiday inside a long stay, overlapping bands entered by hand, and the same timetable in two zones.

## Visual identity of a municipality (v0.4)

The citizen picks their municipality from a grid of icons after signing in, and the active one sits
next to the LupaRX logo. `V14_0` adds three nullable columns to `tenants` for that: `logo_asset_key`,
`brand_color` (`#rrggbb`, CHECK-validated, lower case) and `short_name`.

**A key, not a URL.** An absolute URL in a tenant row is environment-specific — restore the database
into staging and every municipality points at production's asset host — and it ages badly: the day an
upload endpoint and a CDN land, every stored URL has to be rewritten. A key is resolved at render
time, so hosting changes without a row moving. Two kinds are understood today, and the CHECK admits
only those: `generated:monogram` (the built-in placeholder) and an absolute `https://` address of an
emblem the municipality hosts itself. Plain `http` is refused — a logo loaded over http on an https
page is blocked as mixed content, so accepting it would only produce a broken image.

**All three are nullable on purpose.** A municipality created five minutes ago has no logo, and that
is a valid state rather than an error: `logoUrl` comes back absent and the client draws a monogram
over `brandColor`, falling back to the platform's own colour when there is not even that.

```
GET     /api/v1/catalog/tenants                 + shortName, logoUrl, brandColor
GET     /api/v1/catalog/tenants/{id}/logo.svg   public; the generated monogram
GET     /api/v1/{portal}/me/memberships         + tenantShortName, tenantLogoUrl, tenantBrandColor
POST    /api/v1/{portal}/session/tenant         answers {tokens, activeTenant}
GET|PUT /api/v1/admin/settings/branding         permission TENANT_MANAGE
POST|PUT /api/v1/platform/tenants[/{id}]        accept logoAssetKey, brandColor, shortName
```

`logoUrl` is resolved from the key in **one** place (`ResponseMapper.logoUrlOf`), so the catalogue,
the membership list and the active-municipality chip cannot disagree about where a logo lives. The
branding travels *with* the list rather than per municipality: a client that had to fetch each one
separately to find its logo would make the picker slower the more municipalities the platform serves.

**The emblem belongs to the municipality.** The platform never invents, approximates or ships a real
coat of arms — those are official symbols and each municipality provides its own from its admin panel.
`GET /catalog/tenants/{id}/logo.svg` draws the placeholder instead: the initials over the brand
colour, as an SVG. A client could draw that itself, and the citizen app does whenever `logoUrl` is
absent; the endpoint exists for everything that cannot — an email, a PDF, an `<img>` with no
JavaScript behind it. Initials skip words starting with a lower-case letter, so "Montes de Oca" reads
as MO and "La Unión" as LU, which handles *van*, *da* and *du* without a list of Spanish stop words.

The fixture gives each of the five municipalities a distinct colour and the generated monogram:
San José `#1d4ed8` (SJ), Escazú `#047857` (E), Montes de Oca `#b45309` (MO, short name "M. de Oca"),
La Unión `#7c3aed` (LU), Cartago `#be123c` (C). It repairs a municipality seeded before `V14_0` once,
and only when it has none — a developer who set a colour or uploaded an emblem keeps it.

## Vehicle catalogues and bay-code guidance (v0.5)

`V15_0` adds `vehicles.type` (NOT NULL, backfilled to `CAR`) and `vehicles.color` (nullable), both as
**catalogue keys** with a CHECK, and publishes the catalogues:

```
GET /api/v1/catalog/vehicle-types     [{value, labelKey}]  CAR, MOTORCYCLE, PICKUP, VAN, OTHER
                                                          (superseded in v0.6: CAR, MOTORCYCLE)
GET /api/v1/catalog/vehicle-colors    [{value, labelKey}]  WHITE … BEIGE, OTHER
```

Each type earns its place by being *operationally* different — a motorcycle occupies a fraction of a
bay and is what a municipality prices differently first; a pickup or a van is longer than the painted
bay, which is an enforcement question — and `OTHER` means a list can never block a registration. A
bicycle is deliberately absent: it occupies no paid bay, so offering it would create a vehicle that
can never legitimately start a session. Colours are a closed set because the inspector's search is
"the grey one", and free text makes that match five spellings; `GRAY` and `SILVER` stay apart because
people distinguish them on the street.

The response carries both `type`/`color` (the keys a client filters and stores by) and
`typeLabelKey`/`colorLabelKey` (what it renders through its own translations) — never a translated
word chosen by the server, since the citizen and the inspector may read different languages. An
unknown value is a 422 on that field, never a silent fall back to `CAR`.

**Bay-code guidance.** `GET /citizen/parking/zones` now returns `spaceCodes: {first, last, count}` per
zone, so the app can show "0001–0500" under the field instead of letting a citizen type `1500` in
Barrio Amón and learn only that it does not exist. It is **one aggregate query** per municipality
(`ParkingSpaceRepository.rangesByZone`), not one per zone — an N+1 here would get slower exactly as a
municipality grows. Lexicographic min/max is exact because every code is zero-padded to the width its
own format declares, so all the codes of one municipality are the same length. It rides on the
existing 60-second private cache of that response rather than a cache of its own, which would need
invalidating whenever a bay is created or retired.

**Time ranges** are the municipal administrator's and already travel whole in
`GET /citizen/parking/policy`: session increments, minimum and maximum, plus whether extensions are
allowed, their increments and the total cap. A duration outside the list or over the cap is
`INVALID_INCREMENT` at quote, start and extend — never rounded to the nearest offered option.

**Headers.** `Cache-Control` is on the CORS allowed list: a browser is entitled to send it and a
preflight that refuses it fails invisibly, with `fetch` rejecting on a bare "Failed to fetch". Every
response under `/api/` carries `Vary: Authorization` (added, not set, so the CORS layer's own `Vary`
survives): almost everything here depends on who asked, and a shared cache that stored one of these
without knowing that would hand one person what we computed for another.

## Two vehicle types, citizen self-join and priced extensions (v0.6)

**A vehicle is a car or a motorcycle.** `V16_0` withdraws `PICKUP`, `VAN` and `OTHER` from
`vehicles.type`: no tariff, no report and no enforcement rule ever distinguished a pick-up from a
car, so they were three extra choices on the form that nothing downstream read. The motorcycle stays
because it occupies a fraction of a bay and is what a municipality prices differently first.

The migration is **expand and contract, in that order**:

```sql
UPDATE vehicles SET type = 'CAR' WHERE type NOT IN ('CAR', 'MOTORCYCLE');   -- data first
ALTER TABLE vehicles DROP CONSTRAINT ck_vehicles_type;                      -- constraint second
ALTER TABLE vehicles ADD CONSTRAINT ck_vehicles_type CHECK (type IN ('CAR', 'MOTORCYCLE'));
```

Tightening the CHECK first would fail on the first existing row holding a withdrawn value, and a
migration that only runs on a database nobody used is not a migration. The rows are reassigned rather
than deleted: a pick-up *is* a car for everything this platform does today, and losing a citizen's
vehicle — with the sessions and ledger entries that reference it — to tidy up an enum would be an
absurd trade. Verified on real rows: `PICKUP`/`VAN`/`OTHER` became `CAR`, `MOTORCYCLE` was untouched,
and the CHECK then refuses an update back to `PICKUP`.

**A citizen may park anywhere.** `POST /api/v1/citizen/session/tenant` with a municipality where the
person has no membership now creates one on the spot (`CITIZEN`, `ACTIVE`) and returns the token pair
already scoped to it. Travelling to the next canton is not a procedure.

Why this is safe here and would not be elsewhere: on the citizen portal the role granted is the one
every self-registered citizen already gets, and CONTRACT.md §1 already made citizens active
immediately, so instant membership grants nothing that registering in that municipality would not
have granted a minute later. On the admin and inspector portals the same code would let anyone with
an account appoint themselves staff of a municipality that never invited them — a privilege
escalation — so `MembershipService.joinAsCitizen` is called only when `context.portal() == CITIZEN`,
and the other portals keep failing with `MEMBERSHIP_NOT_ACTIVE` (403). Three more limits:
`INVITE_ONLY` municipalities answer `TENANT_NOT_OPEN_TO_CITIZENS` (403) — a code of its own, so the
client can say "this municipality is not on the app yet" instead of leaving the person thinking their
account is broken; a membership that exists but is suspended or revoked is *not* resurrected
(`MEMBERSHIP_NOT_ACTIVE`), since self-reactivation would undo an administrator's decision; and
nothing transfers — wallet and minute credit are per municipality and start at zero. Every real join
is audited as `MEMBERSHIP_CREATED` with `reason=citizen-self-service`, the target tenant and the
`fromTenantId`; switching to a municipality you already belong to writes no event, because no join
happened.

`GET /api/v1/catalog/tenants` was already the full public catalogue (active/publishable only, with
branding, ordered by name) and it stays **unpaginated on purpose**: a country has at most a few
hundred municipalities (Costa Rica, 82), each row a few hundred bytes, and the whole list is one
cacheable response a picker filters in memory — paging it would cost a round trip per scroll for a
list that fits in one. What a long list does need is a way to jump, so `?q=` now matches name or slug
server-side alongside the existing `?country=`. The day a deployment serves thousands of tenants this
becomes a page, and `q` is what will still make it usable.

**Extension options arrive priced.** `GET /citizen/parking/sessions/{id}/extension-options` answers
the whole screen in one call: every duration the municipality offers, each with `chargeableMinutes`,
`amount`, `creditMinutesApplied`, `payableMinutes`, `payable` and the `newExpiresAt` it would
produce. The server still computes every amount, only minutes inside a charging band are charged, and
the arithmetic starts from the session's **current expiry**, not from now. A `GET`, because nothing
is reserved and no money moves; deliberately uncached, since the price depends on the charging hours
the session is about to cross and on a credit balance that can be spent elsewhere a second later.

Options that cannot be taken are listed too, with `allowed: false` and a reason —
`EXTENSION_EXCEEDS_MAX` or `INSUFFICIENT_BALANCE` — so the app can grey them out with an explanation
instead of silently dropping an option. A municipality with extensions disabled fails the whole
endpoint with `EXTENSION_DISABLED` (409), exactly as extending does.

## Enforcement: citations that survive being challenged (v0.7)

`module-enforcement` is a bounded context of its own (ADR 0014), not a corner of `module-parking`. A
citation is an administrative act somebody appeals months later; a parking session is paid, runs and
ends the same afternoon. And most citations exist *because* there is no session, so modelling one as
an appendix of the other would be false in the ordinary case.

```
platform-core  ->  (nothing)
module-tenancy ->  platform-core
module-parking ->  platform-core, module-tenancy
module-enforcement -> platform-core, module-tenancy      <- NOT module-parking
app            ->  every module
```

Enforcement asks parking only one kind of question, through `ParkingStatusPort`: is this plate
covered, does this bay exist, is this plate registered by exactly one person. `ParkingStatusAdapter`
in `app` answers it by calling the parking services today; the day enforcement is extracted it
becomes an HTTP client and nothing inside the module changes.

**The plate lookup, and the open question it closes.** `GET /inspector/plates/{plate}/status` takes
the bay the officer is standing at, and the bay is the discriminator: a plate is unique *per citizen*
and not globally, so several people may have a running session for `SJP123` in the same municipality.
`COVERED` only when a session for that plate is on *that* bay; `BAY_MISMATCH` when the matches are
elsewhere (a different infraction from not paying at all, and the officer is shown where they are);
`NOT_COVERED` when nothing is running; and `AMBIGUOUS`, with `requiresBay: true`, when matches exist
and no bay was given. **The server never says `COVERED` without a bay** — answering with the first
match would let one citizen's payment excuse another's infraction, silently, because nobody complains
about a citation that was not written. That is the resolution of the `TODO(domain)`
`ParkingSessionRepository` had left open.

**The consecutive.** `PREFIX-YEAR-NNNNNN`, per municipality and per year, taken at issue and never at
capture — an abandoned draft must not burn a number, because a municipality has to be able to defend
its numbering as complete. It comes from a counter row locked with `SELECT … FOR UPDATE` inside the
same transaction that inserts the citation, so two instances issuing at the same instant queue in the
database and a rollback gives the number back. A database sequence was rejected for the two reasons
that matter: it cannot be per tenant-year without DDL at runtime, and by design it leaves holes. The
cost is named: issuing serialises on one row per municipality-year for the length of one insert.

**Offline: two idempotencies, protecting two different things.** The `Idempotency-Key` header (ADR
0012, enforced by `IdempotencyFilter`) protects the *request* — a double tap replays the stored
response with `Idempotent-Replay: true`. `citations.device_citation_id`, unique per municipality,
protects the *act*: a queue flushed twice, or an app reinstalled mid-shift with brand-new keys, gets
**200** with the original citation instead of 201 with a second one. The device also declares
`occurredAt`; the server records `issuedAt` separately and keeps the difference in
`deviceClockSkewSeconds` rather than smoothing it away, because "issued four hours after the
infraction" is what a defence is built on.

**Evidence.** `EvidenceStorage` is a port. `FilesystemEvidenceStorage` is the development
implementation and writes `<root>/<tenant>/<yyyy>/<mm>/<citation>/<uuid>.<ext>`, every segment
generated here so a caller cannot steer the path. **It is not suitable for more than one instance** —
two backends behind a load balancer do not share a disk — so a horizontally scaled deployment swaps
the bean for an object store (S3/GCS/Azure): write bytes, return key and digest; read bytes for a
key, and that is the whole surface. Size and type are validated in the domain *before* any storage
implementation sees the bytes, so two backends can never disagree about what is acceptable, and the
type is decided by reading the file's own header (`ImageSniffer`) — never the filename, never the
declared `Content-Type`. The SHA-256 of the stored bytes goes on the row: months later it is what
separates "the photograph the officer took" from "a photograph somebody put there afterwards".

**Never edited, never deleted.** There is no `PUT` and no `DELETE` on a citation anywhere in the API.
It moves through `CitationStatus` (`DRAFT → ISSUED → PAID | APPEALED → UPHELD/DISMISSED | CANCELLED |
EXPIRED`), every move guarded by the transition table and written into `citation_events` with actor,
portal, moment, reason and hashed IP. That history is part of the act, returned with it, and the
citizen who was fined reads the same one the office does.

**Permissions**, added to `RolePermissions` rather than to an `if` at a call site: `CITATION_ISSUE`
and `CITATION_READ` for the inspector; `CITATION_VOID` for the inspection lead and the administrator;
`ENFORCEMENT_MANAGE` for the catalogue. The officer who writes a citation cannot annul it — the first
question a municipal auditor asks. Finance and support read citations without being able to void one.
The mirror table in `frontend/packages/auth/src/permissions.ts` needs the same four values; the server
is the authority and does not depend on that happening.

**The citizen's fines** are matched **by vehicle, never by plate**. Anybody may register any plate —
that is what makes the family car work — so listing every citation whose plate matches one somebody
typed into their garage would hand one person another person's fines. A citation is linked to a
vehicle only when the plate resolves to exactly one registered on the platform; when two citizens
registered the same plate it is linked to neither and neither sees it in the app. The safe failure is
stated rather than hidden. Paying online is declared and not built: `POST /citizen/fines/{id}/payments`
answers 501 with the contract already fixed, and `PAID` is already in the transition table.

**Configuration** (`luparx.enforcement.*`): `evidence-root`, `max-evidence-bytes` (10 MB),
`allowed-image-types`, `max-photos-per-citation`, `max-note-length`. What is fined and for how much is
**not** here — that is each municipality's own catalogue in `infraction_types`, edited through
`PUT /admin/enforcement/infraction-types`, with the currency taken from the municipality so one
catalogue can never hold two.

**Development fixture.** Every seeded municipality gets five infraction types (one demanding a
photograph, one not, one admitting no defence, two with an early-payment discount) and six citations
that are deliberately *not* all alike: issued, issued-with-photograph, annulled with its reason, under
appeal, paid, and one left as a draft with no number. One of them carries `SJP123`, the plate two
citizens registered, so the "linked to nobody" case is visible on a screen instead of only in a test.

## Defence, legal notice and money into the wallet (v0.8)

**A defence is text plus photographs, and it is moderated.** A citizen files one against a fine of
their own (`POST /citizen/fines/{id}/appeals`), the municipality accepts or rejects it with a
mandatory reason (`POST /admin/enforcement/citations/{id}/appeal/resolve`), and both land in the
citation's own history, which the citizen reads too. Accepting dismisses the citation; rejecting
upholds it and it becomes payable again — the same transition table as everything else, so there is
one account of what happened. One defence per citation; only the owner of the linked vehicle; only
while the citation is payable and inside its due date; only if the infraction type admits a defence.

The text is filed first and the images arrive on their own endpoint afterwards, because what makes
the defence exist is what the person wrote and a citizen on a bad connection must not lose it because
an upload failed.

**Images: the client compresses, the server decides.** 1 MB per image, enforced server-side; the type
read from the file's own header (`ImageSniffer`), never the filename or the declared `Content-Type`;
and the *count* configurable per municipality (`PUT /admin/enforcement/settings`, default 4, and 0
legitimately means "text only"). They go through the same `EvidenceStorage` port, into the same table,
with the same SHA-256 — a citizen's photograph is evidence exactly as the officer's is — and carry
`source = CITIZEN` so nobody has to infer who supplied what.

**The legal notice is data, versioned, and its acceptance is recorded.** It warns that insulting a
public official can be a crime. It is *not* a translation key: a message key has no version, no
effective date, cannot be changed without a deployment, and leaves no record of what the person read.
`appeal_notices` holds it at two scopes — a **country** row every municipality of that country
inherits (the penal code is national) and a **municipality** row that overrides it — resolved
municipality-then-country, always the newest version already in force. Publishing **inserts** a new
version; nothing is edited, because `citation_appeals.notice_id` and `notice_version` point at the
exact text each defence accepted. Filing sends `acceptedNoticeId` back and a stale one is
`APPEAL_NOTICE_OUTDATED` (409) so the client re-displays the current wording.

> The seeded Costa Rican wording cites articles 145–147 of the penal code (Ley 4573). **It must be
> reviewed and approved by the client's lawyer before production.** We are not their legal counsel;
> the text lives in a table, editable from the admin portal, precisely so their lawyer can correct it
> without waiting for a release.

**The top-up code, and why it is not the identity number** (ADR 0015). A code dictated at a
supermarket till is heard by the queue, so it must be designed as if it leaks. An identity number
fails that test twice over: it is personal data, and knowing somebody's would let a stranger probe
their account. The code here is dedicated, one per (municipality, citizen), random, derived from
nothing personal, and rotatable — rotation kills the old one immediately, with no grace period,
because somebody rotates exactly when they think it was overheard.

```
8 random characters + 1 check character, shown as XXX-XXX-XXX      e.g. EBG-P30-GZD
alphabet: Crockford base 32 — no I, L, O, U
```

No look-alikes survive (O, I and L are not in the alphabet, so 0 and 1 are unambiguous), and reading
is forgiving: a cashier who types O gets 0, I or L gets 1, and case does not matter. The check
character is **Luhn mod 32**: every single mistyped character is caught, and every adjacent
transposition except a pair 16 apart in the alphabet — so a slip at the till fails locally instead of
crediting a stranger. 32^8 ≈ 1.1×10^12 per municipality, so it cannot be enumerated; the resolution
endpoint needs `PERM_WALLET_TOPUP` and is audited on top of that. The till gets back **only**
`{givenName, familyInitial, tenantName, currencyCode}` — enough to say "Ana M., San José?" out loud,
and nothing about the account behind it.

**Crediting a wallet** is `POST /admin/wallets/topups`, guarded by its own `WALLET_TOPUP` permission
rather than by a role: handing out credit is the cashier's job and a municipality must be able to give
it to the person at the window without also giving them user administration (`TENANT_ADMIN` and
`TENANT_FINANCE` hold it today). Two idempotency layers, because they fail differently: the
`Idempotency-Key` header replays a repeated *request*, and `wallet_transactions.external_reference` —
the till's receipt number, unique per municipality and source — stops a resend from another process,
another shift or a reprinted receipt from crediting twice, answering `alreadyApplied: true` with the
original transaction. Every movement now records `source` (`MUNICIPAL_COUNTER`, `PARTNER`, `CITIZEN`,
`ADJUSTMENT`, `DEV`) and who keyed it, because "someone credited 10 000 colones" is not an answer an
auditor accepts.

**Why a supermarket chain cannot call that same endpoint.** A cashier is a *person* with an account in
one municipality, authenticated through the admin portal, whose session carries a tenant and whose
actions are attributable by name. A partner network is a *system*: no seat in any municipality, one
integration across many of them, machine-to-machine credentials, and a settlement and dispute process
that a portal session does not model. Serving both from one route would mean issuing portal sessions
to a machine — the exact thing ADR 0004 separates. The reserved contract is
`POST /api/v1/partner/wallets/topups`: mTLS or OAuth2 client-credentials with one credential per
merchant, `tenantId` explicit in the body, `merchantReference` mandatory (idempotency key *and*
reconciliation key), `source = PARTNER`, and a per-merchant daily settlement report. Nothing of it is
implemented yet; the ledger columns it needs already exist, which is what makes it an integration and
not a redesign.

**Development shortcut.** `POST /citizen/wallet/topups` credits your own wallet and exists **only**
under the `dev` profile — the controller is `@Profile("dev")`, so in any other profile the route does
not exist at all and answers 404 rather than 403, which would at least confirm that a self-service
money endpoint is in the build. Everything it writes is stamped `source = DEV`.

**Two gaps closed.** `GET /inspector/zones` gives the officer's app the zones of its municipality with
each zone's bay-code range — until now the plate lookup needed a zone and a bay while the app could
only learn them from its own past citations, which leaves a new device with nothing. No tariff: an
officer does not quote prices. And the officer's infraction catalogue is exactly the active subset of
the administration's, field for field: both come from the same entity through the same mapper, so the
amount on the officer's screen is the amount that is charged (verified by comparing the two responses,
not by reading the code).

## Environment variables

Secrets have **no usable default**: the application fails to start rather than run with a
placeholder key (`docs/SECURITY.md` §5).

| Variable | Required | Purpose |
|---|---|---|
| `SPRING_DATASOURCE_URL` / `_USERNAME` / `_PASSWORD` | yes | PostgreSQL connection |
| `JWT_PRIVATE_KEY_PATH`, `JWT_PUBLIC_KEY_PATH`, `JWT_KEY_ID` | yes | RS256 signing key and its `kid` |
| `JWT_PREVIOUS_PUBLIC_KEYS` | no | Retired keys still accepted, `kid:path` comma-separated — this is what makes rotation zero-downtime |
| `JWT_ISSUER` | yes in prod | `iss` claim and expected issuer on verification |
| `MFA_TOTP_ENCRYPTION_KEY` | yes | Base64 32-byte AES-GCM key protecting TOTP secrets at rest |
| `IP_HASH_PEPPER` | yes | Mixed into IP hashes so they cannot be reversed with a rainbow table |
| `LUPARX_DEV_SEED_DEMO_DATA` | no (`dev` only) | `false` keeps the database untouched on start |
| `LUPARX_DEV_PARKING_SPACES` | no (`dev` only) | Bays for the launch municipality, default `5000`, maximum `9999` — a five-digit code would not match its four-digit bay format |
| `LUPARX_DEV_PARKING_SPACES_TOTAL` | no (`dev` only) | Bays shared out among the other four municipalities, default `5000` (Escazú 1200, Montes de Oca 1500, La Unión 900, Cartago 1400) |
| `PARKING_SESSION_INCREMENTS` | no | Durations offered when starting, comma-separated minutes, default `30,60,120` |
| `PARKING_SESSION_MIN_MINUTES` / `PARKING_SESSION_MAX_MINUTES` | no | Session bounds, default `30` / `480` |
| `PARKING_EXTENSION_ENABLED` | no | Whether a session may be extended, default `true` |
| `PARKING_EXTENSION_INCREMENTS` | no | Durations offered when extending, default `15,30,60` |
| `PARKING_EXTENSION_MAX_TOTAL_MINUTES` | no | Cap on session + extensions, default `720`; never below the session maximum |
| `PARKING_EARLY_FINISH_ENABLED` | no | Whether a citizen may close a session early, default `true` |
| `PARKING_CREDIT_ON_EARLY_FINISH_ENABLED` | no | Whether the remaining minutes come back as credit, default `true` |
| `PARKING_CREDIT_MIN_REMAINING_MINUTES` | no | Minimum remaining minutes for a credit, default `10` |
| `PARKING_CREDIT_EXPIRY_DAYS` | no | Days a credited minute stays usable, default `90`; `0` means never |
| `PARKING_GRACE_MINUTES` | no | Tolerance before a session counts as expired, default `5` |
| `PARKING_CHARGES_ALL_DAY` | no | Whether a fresh municipality charges around the clock, default `false` |
| `PARKING_CHARGING_WEEKDAYS` | no | Days it charges on, default `MONDAY,…,SATURDAY`; a day left out is a day it does not charge |
| `PARKING_CHARGING_STARTS_AT` / `_ENDS_AT` | no | The daily band, `HH:mm`, default `07:00` / `18:00`; `24:00` closes the day |
| `PARKING_SPACE_CODE_PREFIX` | no | Literal prefix of a bay code, default empty |
| `PARKING_SPACE_CODE_DIGITS` | no | Characters after the prefix, default `4` |
| `PARKING_SPACE_CODE_ALLOW_LETTERS` | no | Whether those characters may be letters, default `false` |
| `SMTP_*`, `SMTP_FROM_ADDRESS` | yes | Transactional email |
| `OAUTH_*` | no | Federation client credentials; a provider with a blank client id answers `FEDERATION_NOT_CONFIGURED` |
| `CORS_ALLOWED_ORIGIN_{CITIZEN,ADMIN,INSPECTOR,PLATFORM}` | yes in prod | One origin list per portal — never a shared wildcard |
| `APP_BASE_URL_*` | yes | Front-end base URLs used to build the links inside emails |
| `PLATFORM_DEFAULT_*` | no | Deployment defaults (country, currency, locale, time zone, dial code, minimum age) |
| `JWT_REFRESH_TOKEN_TTL` | no | Refresh-token lifetime; **default `0` = never expires** (CONTRACT.md v0.3 §2). Set e.g. `30d` to bring expiry back |
| `MFA_ENFORCED_PORTALS` | no | Portals requiring a second factor; **default empty** — no portal enforces MFA (CONTRACT.md v0.3 §1). Set `admin,inspector,platform` to turn it back on |
| `LUPARX_DEV_SEED_DEMO_DATA` | no | `false` disables the `dev`-profile demo seed; the seeder does not exist outside that profile |

### Rotating the JWT signing key

1. Generate a new pair, give it a new `kid`.
2. Set `JWT_KEY_ID` / `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH` to the new key **and** add the
   old public key to `JWT_PREVIOUS_PUBLIC_KEYS` as `old-kid:/path/to/old-public.pem`.
3. Deploy. New tokens are signed with the new key; tokens already in flight keep verifying against
   the old one, which is still published in the JWKS.
4. After the access-token TTL (15 minutes) has elapsed, drop the old entry.

## Security model in one page

- **Four portals, four filter chains.** Each installs its own `JwtDecoder` bound to that portal's
  `aud`, and also checks the `portal` claim against the URL prefix. A citizen token presented to
  `/api/v1/admin/**` is rejected by the resource server before any controller runs.
- **Claims are re-checked, never trusted.** `TenantContextFilter` reloads the user, compares `ver`
  against `users.credentials_version` (so a token issued before a password change or a block dies at
  once) and **re-resolves roles and permissions from the current memberships** rather than reading
  them from the token.
- **Authorization is by permission**, `@PreAuthorize("hasAuthority('PERM_…')")`, mapped from roles in
  `RolePermissions`. No endpoint branches on a role name.
- **Tenant isolation**: every tenant-owned query takes the tenant from `TenantContext`; a user with
  no membership in the active tenant is reported *not found*, not *forbidden*, because confirming an
  id exists elsewhere is itself a leak.
- **MFA** is enforced on the portals listed in `luparx.security.mfa-enforced-portals`, which is
  **empty by default** since CONTRACT.md v0.3 §1: no portal asks for a second factor, and the
  application states it in one `INFO` line at start. The mechanism is unchanged — a token with
  `mfa=false` on an enforced portal reaches only the enrolment endpoints — and the same list is read
  by the login flow, the servlet filter and the endpoint that disables one's own TOTP, so the three
  cannot drift apart. Adding a slug back to the list is all it takes to require TOTP again.
- **A session does not expire on its own** (`luparx.jwt.refresh-token-ttl: 0`). Logout, a password
  change and an administrative block are what end one; rotation and reuse detection are unchanged.
- **An account that belongs to no open municipality is told so.** A membership survives its
  municipality being suspended or closed — the row is history and the person may be re-admitted — but
  it grants nothing meanwhile, so `AccessResolver` counts only the memberships that would actually
  produce a usable session. When a session ends up with no municipality and no roles,
  `TenantContextFilter` answers explicitly instead of letting every endpoint refuse the call at its
  `@PreAuthorize` with a bare `ACCESS_DENIED`:
  - **`NO_ACTIVE_MEMBERSHIP` (403)** — every membership was revoked, or the only municipality the
    account had is suspended or closed. Nothing this session does will work and the fix is
    administrative.
  - **`TENANT_CONTEXT_REQUIRED` (403)** — the account belongs to several municipalities and has not
    picked one. Nothing is broken; `POST /{portal}/session/tenant` resolves it.

  The check is **not** at login: refusing the login would lock a person out of their own account for
  an administrative act they had no part in, and `CONTRACT.md` §1 has a citizen legitimately signing
  in before belonging to any municipality. The token is issued, and the refusal arrives on the first
  request that genuinely needs a municipality.
- **The endpoints of the person stay open without a municipality.** `/{portal}/me` (read and write),
  `/me/password`, `/me/email`, `/me/memberships`, `/me/mfa*` and `/session/tenant` are exempt from the
  check above. A name, a phone number and a password belong to the human being, not to the tenant, and
  must stay editable whether or not any municipality currently admits them; the last two are also how
  the caller sees what is wrong and gets out of it.
- **Rate limiting** lives in `auth_attempts` in PostgreSQL, so the limit holds across replicas.
- **Idempotency**: `Idempotency-Key` is required on the sensitive `POST` routes listed in
  `IdempotencyFilter`; concurrent retries are resolved by a unique index, not by in-process state.

## Tests

```bash
mvn test
```

`MoneyTest`, `RolePermissionsTest`, `Uuid7Test` (platform-core), `PhoneNumberServiceTest`,
`IdentityDocumentValidatorTest` (geo), `TotpServiceTest` — verified against the RFC 6238 vectors —
(identity), `AccessResolverTest` (tenancy), which includes the cross-tenant isolation case
`docs/SECURITY.md` §4 requires — including the case that stranded real accounts, an active membership
in a closed municipality alongside a live one — and `ChargingScheduleTest` (parking), which pins the v0.3 rule that
only the minutes inside a charging band are charged: exact boundaries, crossing midnight, a weekday
with no band, a holiday inside a long stay, overlapping bands and the same timetable in two zones.

## Deviations from the documents, and why

1. **`tenant_memberships.tenant_id` is nullable.** `docs/DATA_MODEL.md` §3 lists it as `NOT NULL`,
   but `CONTRACT.md` §0 defines a platform back-office whose operators belong to the product, not to
   a municipality. Rather than invent a fake "platform tenant" row, the column is nullable and a
   `CHECK` makes it mandatory for every non-platform portal, with a partial unique index keeping
   platform memberships unique per user. `CONTRACT.md` §5 does not state `NOT NULL`, so the contract
   is respected.
2. **Spring Boot 3.3.4**, while the documents mention 3.5 — pinned deliberately to a version whose
   API surface could be verified without a working dependency resolver in this environment. Moving
   to 3.5 is a property change in the parent POM.
3. **`audit_events` / `outbox_events` foreign keys are added in `V4_0`**, not in `V1_0` where the
   tables are created, simply because their targets do not exist yet at that point.

## Pending (declared, not implemented)

These answer `501` with `NOT_IMPLEMENTED` so the contract surface is visible in OpenAPI and no client
mistakes them for working features:

- `GET /api/v1/auth/{portal}/oauth2/{provider}/callback`. `/start` is complete (state is a signed
  JWT, the `redirect_uri` is pinned to this deployment, an unconfigured provider is refused). The
  callback needs the provider-specific code exchange and **verified** `id_token` parsing; a
  half-verified `id_token` is an account takeover, not a partial feature. The linking rules it will
  use already exist in `FederatedIdentityService` (verified email required; an address that already
  belongs to a password account requires explicit emailed confirmation).
- `POST /api/v1/admin/users` (manual creation / invitation) and
  `POST /api/v1/platform/tenants/{id}/admins` for a person who has no account yet: both would have to
  invent the mandatory registration data of `CONTRACT.md` §2 (document, address, birth date) from an
  email address. The invitation flow that lets the person supply those fields is the missing piece;
  granting `TENANT_ADMIN` to an **existing** user already works.
- `POST /api/v1/admin/exports` (v0.1 synchronous CSV) and the `month` / `district` groupings of
  `GET /admin/reports/registered-users`.
- `/inspector/patrols/*` (patrol routes) and `/admin/finance/*` (municipal finance). Vehicles,
  parking sessions, zones and tariffs shipped in v0.2; citations, their evidence and the citizen's
  fines shipped in v0.7 and their stub was removed with them.
- `POST /api/v1/citizen/fines/{id}/payments`: paying a fine online. Declared with its contract fixed
  (see CONTRACT.md v0.7) because the client is built against it; the state machine already has
  `PAID` and the server already computes the amount payable, so the payments batch adds the provider,
  the receipt and the reconciliation rather than a new concept.
- `POST /api/v1/partner/wallets/topups`: crediting a wallet from an external network (a supermarket
  chain). The contract is fixed above and the ledger columns it needs already exist (`source`,
  `external_reference`); what is missing is the machine-to-machine authentication, the per-merchant
  credential store and the settlement report.
- The scheduled sweep that moves overdue citations to `EXPIRED` in bulk. The operation exists and is
  idempotent, bounded and tenant-scoped (`CitationService.expireOverdue`), and a citation read one at
  a time already corrects itself; only the schedule is missing.
- The outbox relay: rows are written transactionally and the queue index exists, but nothing
  publishes them yet.
- Housekeeping jobs for `auth_attempts`, `verification_tokens`, expired `refresh_tokens` and
  `idempotency_keys` (the repository methods exist; the schedule does not).
- PostgreSQL row-level security as the additional isolation layer of ADR 0002.

## Known risks

Review priorities, in order:

1. `PortalJwtDecoders` builds `NimbusJwtDecoder` from a `DefaultJWTProcessor` so that several keys
   can verify at once. Confirm the constructor and validator API against the Spring Security version
   actually resolved.
2. The JPQL queries that compare a nullable enum parameter (`:portal is null or m.portal = :portal`)
   rely on Hibernate inferring the parameter type from the equality branch. If a version rejects it,
   replace those repositories with Specifications.
3. `jsonb` columns are mapped as `Map<String, Object>` with `@JdbcTypeCode(SqlTypes.JSON)`, which
   depends on Jackson being picked up as Hibernate's format mapper.
4. Two filters are added at the same position (`addFilterAfter(..., BasicAuthenticationFilter.class)`);
   they are independent of each other, but confirm both are present in the chain.
5. Flyway ordering and the `CHECK`/partial-index combinations on `tenant_memberships` have not been
   executed against a real PostgreSQL.
6. The v0.3 charging timetable is replaced wholesale, dated exceptions included, so an administrator
   editing it must send the whole calendar back. That is fine for a form and wrong for an import of
   several years of holidays, which will need its own endpoint.
7. Bay codes are now canonicalised to upper case before lookup. Every seeded code is numeric, so
   nothing changes today, but a municipality that had entered lower-case codes before this change
   would have to re-enter them.
