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
| `module-parking` | `luparx-module-parking` | core, tenancy | zones, tariffs and numbered spaces (entities + repositories); sessions, patrols, citations and finance still deferred |
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
> migration is off on purpose — which is why the parking-space table is `V10_0` and not `V6_0`:
> numbering it by layer would have forced every existing database to be recreated. Nothing needs to be
> reset; Flyway applies `V10_0`/`V9_2` on the next start. If a database is ever left inconsistent,
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

### Parking fixture (zones, tariffs and bays)

Once the municipality exists, `DevParkingSeeder` gives it the parking it operates: **8 zones** across
six districts of the canton of San José, each linked to its real district in
`administrative_divisions` (seeded by `V9_1`/`V9_2`), one open-ended **hourly tariff** per zone priced
in the municipality's own currency, and **5000 numbered bays**.

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
Changing the count re-derives every boundary; the table above is the default of 5000.

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

### MFA in development

MFA is mandatory on the admin, inspector and platform portals, which means a seeded account cannot
reach those portals until it enrols a TOTP. Which portals enforce it is configuration, not a
constant: `luparx.security.mfa-enforced-portals` (default `admin,inspector,platform`, overridable
with `MFA_ENFORCED_PORTALS`). `application-dev.yml` sets it to **empty** so the seeded accounts can
log in straight away, and the application logs a `WARN` on every start while it is empty.

Leaving that list empty anywhere but a laptop means a stolen back-office password is enough to take
over an account — set it back to `admin,inspector,platform` in every shared environment.

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
| `LUPARX_DEV_PARKING_SPACES` | no (`dev` only) | Bays the fixture creates, default `5000`, maximum `10000` |
| `SMTP_*`, `SMTP_FROM_ADDRESS` | yes | Transactional email |
| `OAUTH_*` | no | Federation client credentials; a provider with a blank client id answers `FEDERATION_NOT_CONFIGURED` |
| `CORS_ALLOWED_ORIGIN_{CITIZEN,ADMIN,INSPECTOR,PLATFORM}` | yes in prod | One origin list per portal — never a shared wildcard |
| `APP_BASE_URL_*` | yes | Front-end base URLs used to build the links inside emails |
| `PLATFORM_DEFAULT_*` | no | Deployment defaults (country, currency, locale, time zone, dial code, minimum age) |
| `MFA_ENFORCED_PORTALS` | no | Portals requiring a second factor; default `admin,inspector,platform`. Empty disables MFA enforcement everywhere — laptops only |
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
- **MFA** is mandatory on the portals listed in `luparx.security.mfa-enforced-portals` (default
  `admin,inspector,platform`). A token with `mfa=false` on one of those portals reaches only the
  enrolment endpoints, which is how a new administrator enrols without ever holding a usable session
  that skipped the second factor. The same list is read by the login flow and by the endpoint that
  disables one's own TOTP, so the three cannot drift apart; the `dev` profile empties it and says so
  at `WARN`.
- **Rate limiting** lives in `auth_attempts` in PostgreSQL, so the limit holds across replicas.
- **Idempotency**: `Idempotency-Key` is required on the sensitive `POST` routes listed in
  `IdempotencyFilter`; concurrent retries are resolved by a unique index, not by in-process state.

## Tests

```bash
mvn test
```

`MoneyTest`, `RolePermissionsTest`, `Uuid7Test` (platform-core), `PhoneNumberServiceTest`,
`IdentityDocumentValidatorTest` (geo), `TotpServiceTest` — verified against the RFC 6238 vectors —
(identity) and `AccessResolverTest` (tenancy), which includes the cross-tenant isolation case
`docs/SECURITY.md` §4 requires.

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
- The whole parking domain (`/citizen/vehicles`, `/citizen/parking-sessions`, `/inspector/patrols`,
  `/inspector/citations`, `/admin/zones`, `/admin/rates`, `/admin/finance/*`).
- The outbox relay: rows are written transactionally and the queue index exists, but nothing
  publishes them yet.
- Housekeeping jobs for `auth_attempts`, `verification_tokens`, expired `refresh_tokens` and
  `idempotency_keys` (the repository methods exist; the schedule does not).
- PostgreSQL row-level security as the additional isolation layer of ADR 0002.

## Known risks

This tree was written without a reachable Maven repository, so **nothing here has been compiled or
run**. Review priorities, in order:

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
