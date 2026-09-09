# LupaRX — Contrato de dominio, datos y API (v0.1)

> Documento normativo del scaffold inicial. Backend y frontend **deben** implementar exactamente
> estos nombres, rutas, códigos de error y orden de campos.

## 0. Producto

Plataforma municipal multi-tenant de **fiscalización vial / parquímetros**.
Cuatro portales con **login separado** (no comparten página de entrada ni token):

| Portal | Audiencia JWT | App | Usuarios |
|---|---|---|---|
| Ciudadano | `luparx:portal:citizen` | `apps/citizen` (React + Capacitor) | Auto-registro público |
| Administración municipal | `luparx:portal:admin` | `apps/admin` (web) | Auto-registro + membresía aprobada |
| Fiscalización | `luparx:portal:inspector` | `apps/inspector` (React + Capacitor) | Auto-registro + membresía aprobada |
| Back-office de plataforma | `luparx:portal:platform` | `apps/platform` (web, interno) | **Sin auto-registro**: alta sólo por otro `PLATFORM_ADMIN` |

> El back-office de plataforma es el panel del operador del producto (no de una municipalidad):
> crea municipalidades, da de alta a sus administradores, revisa el padrón global y opera catálogos.
> **No accede a la base de datos directamente**: usa la misma API con permisos de alcance plataforma,
> auditoría obligatoria de cada acción y MFA exigido. Cualquier acceso directo a la base queda
> reservado a operaciones de mantenimiento fuera de la aplicación.

## 1. Identidad y tenencia (decisión central)

- **Una sola identidad global por persona** (`users`). El email es la clave natural de login.
- Una persona **se auto-registra** en cualquiera de los tres portales con el mismo formulario.
- El acceso a una municipalidad se modela como **membresía** (`tenant_memberships`):
  `(user_id, tenant_id, portal, role, status)`.
- Un usuario puede pertenecer a **varias municipalidades** con distintos roles.
- Auto-registro por portal:
  - `citizen`: crea usuario + membresía `ACTIVE` en la municipalidad elegida (o sin municipalidad hasta que interactúe con una).
  - `admin` / `inspector`: crea usuario + membresía en estado `PENDING_APPROVAL`. **No hay acceso**
    hasta que un `TENANT_ADMIN` de esa municipalidad o un `PLATFORM_ADMIN` la aprueba.
    (Configurable por tenant: `self_registration_policy` = `OPEN` | `APPROVAL_REQUIRED` | `INVITE_ONLY`.)
- Existe un **superadministrador de plataforma** (`PLATFORM_ADMIN`), por encima de las municipalidades,
  necesario para dar de alta municipalidades y aprobar al primer administrador de cada una.
- **Aislamiento**: los datos operativos y financieros son propiedad del tenant (`tenant_id` obligatorio).
  Los usuarios son globales, pero **toda consulta de usuarios desde un portal municipal se filtra por
  membresía en el tenant activo**. Sólo `PLATFORM_ADMIN` ve el padrón global.
- **Reportes**: `usuarios registrados` existe en dos niveles — por municipalidad (vía membresías) y
  a nivel plataforma (vía `users`). Nunca se filtran datos de un tenant a otro (ni IDs, ni búsquedas,
  ni autocompletados, ni métricas).

### Roles

```
PLATFORM_ADMIN     portal=platform   alcance plataforma (crea municipalidades y sus administradores)
PLATFORM_SUPPORT   portal=platform   alcance plataforma, sólo lectura + soporte
TENANT_ADMIN       portal=admin      alcance tenant
TENANT_FINANCE     portal=admin      alcance tenant  (finanzas del tenant)
TENANT_SUPPORT     portal=admin      alcance tenant  (soporte / lectura)
INSPECTOR          portal=inspector  alcance tenant  (+ zonas asignadas)
INSPECTOR_LEAD     portal=inspector  alcance tenant
CITIZEN            portal=citizen    alcance tenant (o global sin tenant activo)
```

Permisos: enum `Permission` (p.ej. `USER_READ`, `USER_WRITE`, `USER_BLOCK`, `MEMBERSHIP_APPROVE`,
`ROLE_ASSIGN`, `ZONE_ASSIGN`, `AUDIT_READ`, `EXPORT_RUN`, `TENANT_MANAGE`, `PLATFORM_MANAGE`).
El rol mapea a permisos en `RolePermissions` (configuración, no `if (role == ADMIN)`).

## 2. Campos de registro (ORDEN OBLIGATORIO en UI y DTO)

1. **Nombre completo** → `givenName`, `familyName`, `secondFamilyName?` (segundo apellido opcional; el
   orden de presentación depende del locale, ver `displayNameFormat` del país).
2. **Documento de identidad** (soporta extranjeros) → `identityDocument { countryCode, type, number }`
   - `type`: `NATIONAL_ID` | `FOREIGN_RESIDENT_ID` | `PASSPORT` | `TAX_ID` | `OTHER`
   - Validación por país+tipo desde catálogo (`identity_document_types`: regex, longitud, normalización,
     checksum opcional). Defaults CR: `NATIONAL_ID` (cédula 9 dígitos), `FOREIGN_RESIDENT_ID` (DIMEX 11–12),
     `PASSPORT` (alfanumérico 6–12).
3. **Dirección** → `address { countryCode, level1Id (provincia), level2Id (cantón), level3Id (distrito),
   line1, line2?, postalCode? }`
   - Las divisiones vienen del árbol genérico `administrative_divisions` (N niveles por país).
   - Las etiquetas ("Provincia", "Cantón", "Distrito", o "State"/"County"/"City") vienen de
     `country_admin_levels`. **Nunca se hardcodean en la UI.**
4. **Teléfono** → `phone { countryCode, nationalNumber }` persistido en **E.164** (`phone_e164`).
   - Prefijo por defecto el del país seleccionado (default de plataforma: CR `+506`), formato validado
     con libphonenumber en backend y `libphonenumber-js` en frontend.
5. **Nacionalidad** → `nationalityCode` (ISO 3166-1 alpha-2). La bandera se deriva del código en el
   frontend (emoji regional-indicator + fallback SVG). No se almacenan imágenes.
6. **Correo electrónico** → `email` (normalizado a minúsculas, único, requiere verificación).
7. **Fecha de nacimiento** → `birthDate` (ISO-8601 `YYYY-MM-DD`, edad mínima configurable, default 18).

Campos de cuenta que acompañan el registro (no parte de los datos personales):
`password` (si no viene de un proveedor federado), `locale` (BCP 47), `timeZone` (IANA),
`acceptedTermsVersion`, `tenantId?` (municipalidad a la que se solicita acceso), `portal`.

## 3. Autenticación

- **Local**: Argon2id. Access token JWT RS256 (15 min) + refresh token opaco (30 días) con rotación y
  detección de reuso. JWKS público en `/.well-known/jwks.json`.
- **Claims del access token**: `iss`, `sub` (userId), `aud` (audiencia del portal), `exp`, `iat`, `jti`,
  `portal`, `tid` (tenant activo, nullable), `roles[]`, `perms[]`, `mfa` (bool), `locale`, `ver` (versión de credenciales).
- **Un token de un portal no sirve en otro**: el resource server valida `aud` + `portal` contra el
  portal declarado por la ruta (`/api/v1/citizen/**`, `/api/v1/admin/**`, `/api/v1/inspector/**`).
- **Federación**: Google (OIDC), Microsoft Entra ID (OIDC), Facebook (OAuth2 + Graph). Vinculación por
  email verificado; tabla `user_federated_identities (provider, subject, user_id)`.
  Si el email existe con contraseña local, se requiere confirmación explícita para vincular.
- **MFA TOTP** (RFC 6238, compatible con Google Authenticator/Authy): obligatorio para `admin` e
  `inspector`, opcional para `citizen`. Códigos de recuperación de un solo uso (hash Argon2id).
- **Cambio de municipalidad activa**: `POST /api/v1/{portal}/session/tenant` devuelve un nuevo par de
  tokens con `tid` y roles del tenant destino.

## 4. API REST v1

Base: `/api/v1`. Errores: **RFC 9457 Problem Details** (`application/problem+json`) con
`type`, `title`, `status`, `detail`, `instance`, `code` (estable, `SCREAMING_SNAKE`), `traceId`,
y `errors[] { field, code, message }` para validación.
Todas las colecciones son paginadas: `?page=0&size=20&sort=campo,asc` → `{ items, page, size, totalElements, totalPages }`.
Header obligatorio en escrituras sensibles: `Idempotency-Key`.

### Público / catálogos (sin auth, cacheable)
```
GET  /api/v1/catalog/countries                       -> [{code, name, dialCode, flagEmoji, defaultLocale, defaultCurrency, defaultTimeZone}]
GET  /api/v1/catalog/countries/{code}/admin-levels   -> [{level, labelKey, required}]
GET  /api/v1/catalog/countries/{code}/divisions?parentId=&level=  -> [{id, code, name, level, parentId}]
GET  /api/v1/catalog/countries/{code}/document-types -> [{type, labelKey, pattern, example}]
GET  /api/v1/catalog/tenants?country=                -> [{id, slug, name, countryCode}]   (municipalidades publicables)
```

### Autenticación (una raíz por portal)
```
POST /api/v1/auth/{portal}/register            {campos §2}            -> 201 {userId, status, requiresEmailVerification, requiresApproval}
POST /api/v1/auth/{portal}/login               {email, password}      -> 200 {accessToken, refreshToken, expiresIn, mfaRequired, mfaToken?}
POST /api/v1/auth/{portal}/mfa/verify          {mfaToken, code}       -> 200 {tokens}
POST /api/v1/auth/{portal}/refresh             {refreshToken}         -> 200 {tokens}
POST /api/v1/auth/{portal}/logout              {refreshToken}         -> 204
POST /api/v1/auth/{portal}/password/forgot     {email}                -> 202
POST /api/v1/auth/{portal}/password/reset      {token, newPassword}   -> 204
POST /api/v1/auth/{portal}/email/verify        {token}                -> 204
GET  /api/v1/auth/{portal}/oauth2/{provider}/start?redirectUri=       -> 302
GET  /api/v1/auth/{portal}/oauth2/{provider}/callback                 -> 302 (code -> tokens)
```
`{portal}` ∈ `citizen|admin|inspector|platform`; `{provider}` ∈ `google|microsoft|facebook`.
`POST /register` **no existe para `platform`** (403 `SELF_REGISTRATION_DISABLED`): esas cuentas se crean
desde el propio back-office. `platform` exige MFA activo para completar el login.

La UI de todos los portales sigue `docs/DESIGN_SYSTEM.md` (tema oscuro, tokens `--lx-*`, marca en `docs/brand/`).

### Sesión / perfil (autenticado)
```
GET  /api/v1/{portal}/me                        -> {user, memberships[], activeTenant}
PUT  /api/v1/{portal}/me                        {campos §2 editables}
GET  /api/v1/{portal}/me/memberships            -> [{tenantId, tenantName, portal, role, status}]
POST /api/v1/{portal}/session/tenant            {tenantId} -> {tokens}
POST /api/v1/{portal}/me/mfa/setup              -> {secret, otpauthUri, recoveryCodes[]}
POST /api/v1/{portal}/me/mfa/activate           {code} -> 204
DELETE /api/v1/{portal}/me/mfa                  {code}  -> 204
```

### Portal de administración municipal (`/api/v1/admin/**`) — SIEMPRE acotado al tenant activo
```
GET    /api/v1/admin/users?q=&portal=&role=&status=   (sólo usuarios con membresía en el tenant activo)
GET    /api/v1/admin/users/{id}
POST   /api/v1/admin/users                      (alta manual / invitación)
PUT    /api/v1/admin/users/{id}
POST   /api/v1/admin/users/{id}/block           {reason}
POST   /api/v1/admin/users/{id}/unblock
POST   /api/v1/admin/users/{id}/password-reset  (fuerza reseteo por correo)
POST   /api/v1/admin/users/{id}/mfa/require     {required:boolean}
POST   /api/v1/admin/memberships                {userId, tenantId, portal, role}
PUT    /api/v1/admin/memberships/{id}           {role, status}
POST   /api/v1/admin/memberships/{id}/approve
POST   /api/v1/admin/memberships/{id}/reject    {reason}
DELETE /api/v1/admin/memberships/{id}
GET    /api/v1/admin/audit-events?actor=&action=&from=&to=
GET    /api/v1/admin/reports/registered-users?from=&to=&groupBy=portal|month|district
POST   /api/v1/admin/exports                    {type, filters} -> 202 {exportId}   (extensible; v0.1: CSV síncrono <= 10k filas)
```
> Alcance v0.1: alta/baja, bloqueo, reseteo de contraseña, forzar MFA, roles, aprobación de membresías,
> auditoría y reporte de registrados. **Zonas y exportes asíncronos quedan como puntos de extensión marcados.**

### Back-office de plataforma (`/api/v1/platform/**`) — requiere `PLATFORM_ADMIN`/`PLATFORM_SUPPORT` + MFA
```
GET    /api/v1/platform/tenants?q=&status=&country=
POST   /api/v1/platform/tenants                 {slug, legalName, displayName, countryCode, currencyCode,
                                                 locale, timeZone, selfRegistrationPolicy}
GET    /api/v1/platform/tenants/{id}
PUT    /api/v1/platform/tenants/{id}
POST   /api/v1/platform/tenants/{id}/status     {status: ACTIVE|SUSPENDED|CLOSED, reason}
GET    /api/v1/platform/tenants/{id}/settings   / PUT (clave-valor tipado)
POST   /api/v1/platform/tenants/{id}/admins     {email, ...} -> crea/invita al primer TENANT_ADMIN
GET    /api/v1/platform/users?q=&country=&status=&tenantId=      (padrón global)
GET    /api/v1/platform/users/{id}                               (incluye todas sus membresías)
POST   /api/v1/platform/users/{id}/block | /unblock | /password-reset | /mfa/require
POST   /api/v1/platform/memberships             {userId, tenantId, portal, role}
GET    /api/v1/platform/audit-events?tenantId=&actor=&action=&from=&to=
GET    /api/v1/platform/reports/registered-users?groupBy=tenant|country|portal|month
GET    /api/v1/platform/catalog/**  POST/PUT     (países, divisiones administrativas, tipos de documento)
GET    /api/v1/platform/system/health | /feature-flags | /jobs
```
> **Preparado, no cerrado**: el detalle de qué más se controla desde aquí lo define el usuario más
> adelante. Todo lo anterior queda con contrato y permisos definidos; los módulos futuros
> (facturación por municipalidad, planes, límites de uso, integraciones de pago) se agregan como
> recursos nuevos bajo `/api/v1/platform/**` sin romper este contrato.

### Dominio parquímetros (stub v0.1, contrato reservado)
```
/api/v1/citizen/vehicles, /api/v1/citizen/parking-sessions
/api/v1/inspector/patrols, /api/v1/inspector/citations
/api/v1/admin/zones, /api/v1/admin/rates, /api/v1/admin/finance/*
```

## 5. Esquema de datos (PostgreSQL, snake_case)

Convenciones: PK `uuid` (v7 generado en app), `created_at/updated_at timestamptz`, `version bigint`
(optimistic locking), `created_by/updated_by uuid`, soft-delete sólo donde se justifica.
Dinero: `amount_minor bigint` + `currency_code char(3)`. **Nunca `float`/`double`.**

```
countries(code PK char(2), name_key, dial_code, default_locale, default_currency, default_time_zone, active)
country_admin_levels(country_code FK, level int, label_key, required, PK(country_code, level))
administrative_divisions(id PK, country_code FK, parent_id FK->self, level int, code, name, active,
                         UNIQUE(country_code, level, code))
identity_document_types(country_code FK, type, label_key, pattern, normalizer, example, PK(country_code, type))

tenants(id PK, slug UNIQUE, legal_name, display_name, country_code FK, currency_code, locale, time_zone,
        status, self_registration_policy, created_at, ...)
tenant_settings(tenant_id PK/FK, key, value jsonb, PK(tenant_id, key))

users(id PK, email citext UNIQUE, email_verified_at, given_name, family_name, second_family_name,
      birth_date date, nationality_code FK->countries, phone_e164, phone_country_code,
      document_country_code, document_type, document_number, document_number_normalized,
      address_country_code, address_level1_id, address_level2_id, address_level3_id,
      address_line1, address_line2, address_postal_code,
      locale, time_zone, status, blocked_reason, mfa_required, accepted_terms_version,
      credentials_version int, created_at, updated_at, version,
      UNIQUE(document_country_code, document_type, document_number_normalized))

user_credentials(user_id PK/FK, password_hash, algorithm, updated_at, must_change)
user_federated_identities(id PK, user_id FK, provider, subject, email, linked_at, UNIQUE(provider, subject))
user_mfa_totp(user_id PK/FK, secret_encrypted, status, activated_at)
user_mfa_recovery_codes(id PK, user_id FK, code_hash, used_at)
refresh_tokens(id PK, user_id FK, portal, tenant_id, token_hash UNIQUE, family_id, expires_at,
               revoked_at, replaced_by, user_agent, ip_hash)
auth_attempts(id PK, email_hash, portal, ip_hash, success, occurred_at)         -- rate limiting / lockout
verification_tokens(id PK, user_id FK, purpose, token_hash UNIQUE, expires_at, used_at)

tenant_memberships(id PK, tenant_id FK NULLABLE, user_id FK, portal, role, status, approved_by, approved_at,
                   requested_at, revoked_at, version, UNIQUE(tenant_id, user_id, portal))
  -- tenant_id es NULL exactamente para portal='platform' (el back-office no pertenece a ninguna
  -- municipalidad): CHECK (portal='platform') = (tenant_id IS NULL), más índice único parcial
  -- (user_id, portal) para esas filas. El rol de plataforma NO es un atributo del usuario.
audit_events(id PK, tenant_id NULLABLE, actor_user_id, actor_portal, action, resource_type, resource_id,
             ip_hash, user_agent, metadata jsonb, occurred_at)
outbox_events(id PK, aggregate_type, aggregate_id, tenant_id, type, payload jsonb, created_at, published_at)
```
Índices mínimos: `users(email)`, `users(document_*)`, `tenant_memberships(tenant_id, status)`,
`tenant_memberships(user_id)`, `audit_events(tenant_id, occurred_at desc)`, `refresh_tokens(user_id)`,
`administrative_divisions(country_code, parent_id)`.

## 6. Estructura del monorepo

```
luparx-evolution/
  backend/                      Maven multi-módulo, Java 21, Spring Boot 3.5
    platform-core/              kernel compartido: ids, errores RFC 9457, dinero, tenant context, auditoría
    module-geo/                 países, divisiones administrativas, documentos, teléfonos
    module-identity/            usuarios, credenciales, MFA, federación, tokens
    module-tenancy/             municipalidades, membresías, roles/permisos
    module-parking/             stub del dominio (frontera declarada)
    app/                        arranque Spring Boot, seguridad, controllers, Flyway, OpenAPI
  frontend/                     npm workspaces
    packages/config/            tsconfig/eslint compartidos
    packages/i18n/              claves + locales es-CR, en-US
    packages/api-client/        cliente tipado del contrato §4
    packages/auth/              almacenamiento de tokens por portal, refresh, guardas
    packages/ui/                design system mínimo (tokens, campos, layout)
    apps/citizen/               React + Vite + Capacitor
    apps/inspector/             React + Vite + Capacitor
    apps/admin/                 React + Vite (web, municipal)
    apps/platform/              React + Vite (web, back-office de plataforma)
  docs/                         arquitectura + ADRs + sistema de diseño + marca
  infra/                        docker-compose, .env de ejemplo, CI
```

## 7. Reglas transversales (no negociables)

- Ningún texto visible hardcodeado: todo por clave i18n (`auth.login.title`, `user.field.birthDate`, …).
- Ningún `CRC`, `+506`, `Costa Rica`, `America/Costa_Rica`, `Provincia/Cantón/Distrito` en código:
  sólo como **configuración por defecto** (`platform.defaults.*`) o dato semilla.
- Timestamps en UTC; conversión por locale/zona del usuario o del tenant.
- Toda consulta con `tenant_id` explícito; prohibido filtrar sólo en frontend.
- Toda escritura relevante emite `audit_events` y, si cruza frontera, `outbox_events`.
- Validación siempre en servidor; el frontend valida sólo para UX.

---

# v0.2 — Dominio de parqueo (normativo)

## Nombre de producto
El nombre visible es **LuParX** (así, con esa capitalización) en toda la interfaz y en las
comunicaciones. Los identificadores técnicos ya existentes (`cr.luparx`, `luparx-*`, dominios,
clases) no cambian: no vale romper paquetes por una mayúscula.

## Reglas de negocio acordadas

1. **Un ciudadano puede tener varias sesiones activas a la vez**, una por vehículo. Nunca dos
   sesiones activas para el mismo vehículo, ni dos para el mismo espacio.
2. **Las placas se repiten entre usuarios.** La unicidad es `(user_id, placa normalizada)`: un
   usuario no registra dos veces la misma placa, pero dos usuarios sí pueden tener la misma.
   La sesión guarda una copia de la placa (`plate_snapshot`) porque el fiscalizador verifica contra
   lo que estaba pintado en el momento, no contra lo que el usuario editó después.
3. **Cronómetro siempre visible, arriba**: barra pegada al borde superior de la pantalla, presente
   en todas las pantallas mientras haya al menos una sesión activa (ver v0.10). Muestra la que vence
   primero (placa + cuenta regresiva) y, si hay más, un indicador `+N` que abre la lista.
4. **Extensión de tiempo**: el ciudadano elige cuánto extender, entre las opciones que **configura la
   municipalidad**. Cada extensión cobra según la tarifa vigente de la zona.
5. **Finalizar antes de tiempo**: si la municipalidad lo habilita, el ciudadano cierra la sesión y
   **los minutos restantes se guardan como crédito de minutos de esa municipalidad**, que se consume
   primero en su próxima sesión ahí. No es dinero, no se devuelve al saldo y no cruza a otra
   municipalidad: lo que una cobró no lo puede consumir otra.
6. **Pago**: contra el saldo de la billetera del ciudadano **en esa municipalidad**. Las finanzas son
   por tenant; no hay un saldo global.

## Política de parqueo por municipalidad (`parking_policies`, una fila por tenant)

| Campo | Significado |
|---|---|
| `session_increments_minutes` | Opciones ofrecidas al iniciar (p. ej. `30,60,120`) |
| `session_min_minutes` / `session_max_minutes` | Límites de una sesión |
| `extension_enabled` | Si se permite extender |
| `extension_increments_minutes` | Opciones de extensión |
| `extension_max_total_minutes` | Tope de la suma sesión + extensiones |
| `early_finish_enabled` | Si se permite finalizar antes |
| `credit_on_early_finish_enabled` | Si los minutos restantes se guardan como crédito |
| `credit_min_remaining_minutes` | Mínimo de minutos restantes para que se acredite |
| `credit_expiry_days` | Vencimiento del crédito (0 = no vence) |
| `grace_minutes` | Tolerancia antes de considerar vencida una sesión |

Todo con valores por defecto de plataforma; nada de constantes en el código.

## Vehículos

`plate` (obligatoria, normalizada sin espacios ni guiones y en mayúsculas), `name` (nombre que le da
el usuario), `brand`, `model`, `year`, `is_owner` (declara si es el propietario), `is_primary`.
Sólo la placa es obligatoria.

## API

```
GET    /api/v1/citizen/vehicles
POST   /api/v1/citizen/vehicles                 {plate, name?, brand?, model?, year?, isOwner}
PUT    /api/v1/citizen/vehicles/{id}
DELETE /api/v1/citizen/vehicles/{id}            (rechaza si tiene sesión activa)
POST   /api/v1/citizen/vehicles/{id}/primary

GET    /api/v1/citizen/parking/policy           política vigente del tenant activo
GET    /api/v1/citizen/parking/zones            (v0.3) zonas operadas del tenant activo, con su tarifa vigente
GET    /api/v1/citizen/parking/space-format     (v0.3) {prefix, digits, allowLetters, pattern, example}
GET    /api/v1/citizen/parking/schedule         (v0.3) horario de cobro, si se cobra ahora y cuándo se reanuda
POST   /api/v1/citizen/parking/quote            {zoneId, minutes} -> {minutes, chargeableMinutes, amount, creditMinutesApplied, payable}
GET    /api/v1/citizen/parking/sessions?status=ACTIVE|ALL
POST   /api/v1/citizen/parking/sessions         {zoneId, spaceCode, vehicleId, minutes}  (Idempotency-Key)
GET    /api/v1/citizen/parking/sessions/{id}
POST   /api/v1/citizen/parking/sessions/{id}/extend   {minutes}                          (Idempotency-Key)
POST   /api/v1/citizen/parking/sessions/{id}/finish                                       (Idempotency-Key)
GET    /api/v1/citizen/wallet                   saldo y movimientos del tenant activo
GET    /api/v1/citizen/time-credits             minutos a favor y su vencimiento

GET/PUT /api/v1/admin/parking/policy            (permiso TENANT_MANAGE)
GET/PUT /api/v1/admin/parking/zones|rates
GET/PUT /api/v1/admin/parking/space-format     (v0.3, permiso TENANT_MANAGE)
GET/PUT /api/v1/admin/parking/schedule         (v0.3, permiso TENANT_MANAGE)
POST    /api/v1/admin/parking/spaces           (v0.3) {zoneId, code}                     (Idempotency-Key)
```

`GET /citizen/parking/zones` y `GET /citizen/parking/space-format` existen porque `quote` e iniciar
sesión piden `zoneId` y un código de bahía, y el listado de zonas y el formato del código sólo vivían
en el portal de administración, detrás de `TENANT_MANAGE`: sin ellos un ciudadano recién registrado no
tiene de dónde sacar una zona ni cómo saber qué forma tiene un código. Ambos van filtrados por el
tenant del token, devuelven sólo zonas **operadas**, y son cacheables como catálogo pero siempre
`private`: son la configuración de una municipalidad resuelta para un usuario autenticado.

La lista de zonas **no se pagina**: una zona es un sector que opera la municipalidad y su cantidad la
acota cómo está organizada la ciudad, no cuántos ciudadanos tenga. Lo que sí crece sin techo son las
bahías dentro de una zona, y ésas sólo se leen por código o por página.

Errores estables: `SESSION_ALREADY_ACTIVE_FOR_VEHICLE`, `SPACE_OCCUPIED`, `EXTENSION_DISABLED`,
`EARLY_FINISH_DISABLED`, `EXTENSION_EXCEEDS_MAX`, `INSUFFICIENT_BALANCE`, `INVALID_INCREMENT`, y
desde v0.3 `PARKING_SPACE_CODE_INVALID` y `OUTSIDE_CHARGING_HOURS`.

## Invariantes

- El cálculo del monto y del crédito ocurre **siempre en el servidor**; el cliente sólo pide una
  cotización para mostrarla.
- Iniciar, extender y finalizar son **idempotentes** por `Idempotency-Key`: un doble toque en el
  botón no cobra dos veces.
- Cobro y sesión se escriben en la **misma transacción**; el saldo nunca queda debitado sin sesión.
- Toda operación queda auditada con tenant, usuario, vehículo y espacio.

---

# v0.3 — Cuenta, idiomas y operación de la municipalidad (normativo)

## Autenticación y cuenta

1. **Sin MFA.** Ningún portal exige verificación en dos pasos. `luparx.security.mfa-enforced-portals`
   queda vacía por defecto en todos los perfiles y la interfaz no ofrece TOTP. El código de TOTP se
   conserva inactivo detrás de esa configuración: reactivarlo es poner portales en la lista, no
   reescribir el módulo.
   > Riesgo aceptado explícitamente por el producto: el back-office de plataforma administra todas
   > las municipalidades con sólo correo y contraseña. Conviene compensarlo con contraseñas fuertes,
   > límite de intentos (ya existe) y restricción por IP antes de exponerlo a internet.
2. **La sesión no vence.** El refresh token no expira (`luparx.jwt.refresh-token-ttl: 0` = sin
   vencimiento) y el cliente renueva el access token en silencio. Siguen invalidando la sesión:
   cerrar sesión, cambiar la contraseña, y el bloqueo de la cuenta por un administrador.
3. **Cambio de contraseña a voluntad**: `POST /api/v1/{portal}/me/password {currentPassword,
   newPassword}`. Exige la contraseña actual, revoca las demás sesiones y sube `credentials_version`.

## Perfil editable

`PUT /api/v1/{portal}/me` acepta **todos** los datos personales del §2: nombre completo, documento
de identidad, dirección completa, teléfono, nacionalidad y fecha de nacimiento.
El **correo** se cambia por un flujo aparte (`POST /me/email` → verificación del correo nuevo antes
de reemplazar el actual): cambiarlo es cambiar la identidad de acceso, no un campo más de un
formulario.

## Idiomas por municipalidad

- `tenant_locales`: los idiomas que **habilita el administrador municipal** y cuál es el
  predeterminado. La interfaz muestra un **desplegable** con esa lista, no una pastilla de dos
  estados. La resolución sigue siendo determinista: preferencia del usuario → idioma habilitado por
  la municipalidad → idioma por defecto de la municipalidad → idioma por defecto de la plataforma.
- `GET /api/v1/catalog/tenants/{id}/locales` (público, lo necesita el login) y
  `GET|PUT /api/v1/admin/settings/locales` (permiso `TENANT_MANAGE`).

## Formato del código de espacio

`parking_space_formats` (una fila por tenant): `prefix`, `digits`, `allow_letters`, `pattern`
(regex efectiva) y `example`. San José arranca en numérico puro de 4 dígitos, `0001`–`5000`.
El servidor valida contra el patrón del tenant al crear espacios y al iniciar una sesión; el
frontend usa `example` como marcador y `pattern` para validar en el momento.

## Horario de cobro por municipalidad

`parking_schedules` + `parking_schedule_exceptions`:

| Campo | Significado |
|---|---|
| `charges_all_day` | Si está marcado, se cobra parejo las 24 horas y el resto del horario se ignora |
| Franjas por día de semana | `weekday`, `starts_at`, `ends_at` (varias por día); por defecto **lunes a sábado de 07:00 a 18:00** |
| Días deshabilitados | Un día de la semana sin franjas no se cobra (por defecto, domingo) |
| Excepciones por fecha | Feriados: fecha, si se cobra o no, y franjas propias si aplica |

Reglas:

- **Sólo se cobran los minutos que caen dentro de una franja.** Una sesión de 17:30 a 19:00 con
  cierre a las 18:00 paga media hora, no hora y media. Lo mismo al extender.
- Iniciar fuera de horario responde `OUTSIDE_CHARGING_HOURS` con la próxima franja, y la app lo dice
  con claridad ("ahora no se cobra; el cobro se reanuda el lunes a las 7:00").
- Todo se evalúa en la **zona horaria de la municipalidad**, no en la del dispositivo.

---

# v0.4 — Identidad visual de la municipalidad (normativo)

El ciudadano **elige municipalidad después de iniciar sesión**, en una pantalla de iconos con la
imagen de cada municipalidad y su nombre debajo; la municipalidad activa se muestra junto al logo de
LuParX. Una lista de nombres no alcanza para eso.

## Datos (`tenants`, v0.4)

| Campo | Significado |
|---|---|
| `logo_asset_key` | **Clave**, no URL: cómo obtener el logo. Hoy `generated:monogram` (el marcador que dibuja la plataforma) o una dirección `https://` absoluta del emblema que la municipalidad hospeda. Nullable |
| `brand_color` | Color de marca `#rrggbb` en minúscula, validado por CHECK. Nullable |
| `short_name` | Lo que cabe en una barra superior cuando el nombre completo no ("San José" por "Municipalidad de San José"). Nullable |

**Los tres son nullable a propósito.** Una municipalidad creada hace cinco minutos no tiene logo, y
eso es un estado válido y no un error: el cliente cae a un monograma con el color de marca, y al
color de reserva de la plataforma cuando ni eso hay.

**Se guarda una clave y no una URL** porque una URL absoluta en la fila del tenant es específica del
entorno — restaurar la base en staging deja a todas las municipalidades apuntando al host de
producción — y envejece mal: el día que exista subida de archivos y CDN habría que reescribir cada
fila. Una clave se resuelve al momento de renderizar y el hospedaje cambia sin mover una fila. Se
rechaza `http` liso: un logo por http en una página https lo bloquea el navegador como contenido
mixto, así que aceptarlo sólo produciría una imagen rota que nadie sabe explicar.

**El escudo es de la municipalidad.** La plataforma no inventa ni aproxima emblemas municipales: son
símbolos oficiales y los aporta cada municipalidad desde su panel. Hasta entonces se dibuja un
monograma con las iniciales sobre el color de marca.

## API

```
GET  /api/v1/catalog/tenants                    (v0.4) + shortName, logoUrl, brandColor
GET  /api/v1/catalog/tenants/{id}/logo.svg      (v0.4, público) monograma generado de la municipalidad
GET  /api/v1/{portal}/me/memberships            (v0.4) + tenantShortName, tenantLogoUrl, tenantBrandColor
POST /api/v1/{portal}/session/tenant            (v0.4) responde {tokens, activeTenant}
GET/PUT /api/v1/admin/settings/branding         (v0.4, permiso TENANT_MANAGE)
POST/PUT /api/v1/platform/tenants[/{id}]        (v0.4) aceptan logoAssetKey, brandColor, shortName
```

`logoUrl` viaja **ya resuelto** desde `logo_asset_key`, en un solo lugar del servidor, para que el
catálogo, la lista de membresías y la insignia de la municipalidad activa no puedan discrepar sobre
dónde vive un logo. `logoUrl` ausente o nulo significa "sin emblema todavía": el cliente dibuja el
monograma.

La marca viaja **con la lista** y no por municipalidad: un cliente que tuviera que pedir cada
municipalidad por separado para saber con qué pintarla haría la pantalla más lenta cuantas más
municipalidades sirva la plataforma.

Validación: el color se acepta como `#rrggbb` o `#rgb` (se expande) y se guarda en minúscula — dos
filas con `#FFAA00` y `#ffaa00` son el mismo color y compararían distinto; el logo sólo se acepta como
`generated:monogram` o `https://…`; el nombre corto, hasta 40 caracteres. Nada de aceptar cualquier
cadena. `TENANT_BRANDING_UPDATED` queda auditado.

---

# v0.5 — Ficha de vehículo y guía de códigos (normativo)

## Tipo y color del vehículo

`vehicles.type` y `vehicles.color` son **claves de catálogo**, no texto libre, y la API publica cada
catálogo con su clave de traducción:

```
GET /api/v1/catalog/vehicle-types    -> [{value, labelKey}]
GET /api/v1/catalog/vehicle-colors   -> [{value, labelKey}]
```

**Tipo** (*superado por v0.6: hoy la lista es `CAR` y `MOTORCYCLE`*): `CAR`, `MOTORCYCLE`, `PICKUP`,
`VAN`, `OTHER`. Cada uno se gana el lugar por ser distinto
*operativamente*: la moto ocupa una fracción de bahía y es lo que una municipalidad cobra distinto
primero; pick-up y van son más largos que la bahía pintada, que es una pregunta de fiscalización;
`OTHER` para que registrar un vehículo nunca lo bloquee una lista. La bicicleta queda fuera a
propósito: no ocupa bahía de pago en ninguna municipalidad de este producto, así que ofrecerla
crearía un vehículo que nunca podría iniciar una sesión.

**Color**: `WHITE`, `BLACK`, `GRAY`, `SILVER`, `RED`, `BLUE`, `GREEN`, `YELLOW`, `ORANGE`, `BROWN`,
`BEIGE`, `OTHER`. El fiscalizador busca "el gris"; con texto libre esa búsqueda encuentra cinco
formas de escribir el mismo color y deja de servir. `GRAY` y `SILVER` van separados porque la gente
los distingue en la calle.

`type` es obligatorio (por defecto `CAR`, y así se rellenaron las filas anteriores a la columna);
`color` es nullable, porque no hay color "probablemente correcto" e inventarlo sería peor que
admitir que no se sabe. Un valor fuera del catálogo es `VALIDATION_FAILED` por campo, nunca un
silencioso `CAR`.

## Guía de códigos de espacio por zona

`GET /api/v1/citizen/parking/zones` devuelve por zona `spaceCodes: {first, last, count}`, para que la
app diga "0001–0500" debajo del campo en vez de dejar que el ciudadano escriba `1500` en Barrio Amón
y sólo se entere de que no existe. Se calcula con **una sola consulta agregada** por municipalidad, no
una por zona. `null` cuando la zona no tiene bahías todavía. `count` no se deduce del rango: una
bahía retirada del medio deja los extremos intactos.

## Rangos de tiempo

Los define el administrador municipal y ya viajan completos en `GET /api/v1/citizen/parking/policy`:
`sessionIncrementsMinutes`, `sessionMinMinutes`, `sessionMaxMinutes`, `extensionEnabled`,
`extensionIncrementsMinutes` y `extensionMaxTotalMinutes`. El servidor rechaza con
`INVALID_INCREMENT` cualquier duración fuera de la lista o del tope, al cotizar, al iniciar y al
extender; nunca la redondea a la opción más cercana.

## Cabeceras

`Cache-Control` entra en la lista de cabeceras permitidas por CORS: un navegador tiene derecho a
enviarla y un preflight que la rechaza falla de forma invisible. Toda respuesta bajo `/api/` lleva
`Vary: Authorization`: casi todo lo que devuelve esta API depende de quién pregunta, y un caché
intermedio que guardara una de esas respuestas sin saberlo le serviría a una persona lo que
calculamos para otra.

---

# v0.6 — Vehículo, alta ciudadana y precio de la extensión (normativo)

## Tipo de vehículo: `CAR` o `MOTORCYCLE`

El catálogo de tipos de v0.5 se reduce a dos valores y **esta lista sustituye a la de v0.5**:

```
GET /api/v1/catalog/vehicle-types  -> [{value: "CAR", labelKey: "vehicle.type.car"},
                                       {value: "MOTORCYCLE", labelKey: "vehicle.type.motorcycle"}]
```

`PICKUP`, `VAN` y `OTHER` se retiran porque ninguna tarifa, ningún reporte y ninguna regla de
fiscalización los distinguía de un carro: eran tres decisiones más para el ciudadano que nada aguas
abajo leía. La moto se queda porque ocupa una fracción de bahía y es lo primero que una municipalidad
tarifa distinto. Ampliar la lista otra vez es un valor, una clave de traducción y un CHECK.

La migración `V16_0` es **expand-and-contract, en ese orden**: primero reasigna a `CAR` toda fila con
un tipo retirado y sólo después estrecha el CHECK. Al revés fallaría en la primera fila existente. Se
reasigna —no se borra ni se rechaza— porque un pick-up *es* un carro para todo lo que hoy hace esta
plataforma, y perder el vehículo del ciudadano (con sus sesiones y su libro de movimientos) para
ordenar un enum sería un intercambio absurdo. `type` sigue siendo obligatorio con `CAR` por defecto;
un valor fuera del catálogo es `VALIDATION_FAILED` por campo.

## Un ciudadano puede estacionar en cualquier municipalidad

`POST /api/v1/citizen/session/tenant` con una municipalidad donde la persona **no** tiene membresía
la crea en el acto (rol `CITIZEN`, estado `ACTIVE`) y devuelve el par de tokens ya con ese `tid`.
Estacionar en otro cantón no es un trámite: es el caso normal de quien viaja.

Condiciones y límites, explícitos:

* **Sólo el portal ciudadano.** En administración y fiscalización el alta automática sería una
  escalada de privilegios: cualquiera con una cuenta se nombraría a sí mismo funcionario de una
  municipalidad ajena. Ahí sigue exigiéndose una membresía aprobada, y el intento responde
  `MEMBERSHIP_NOT_ACTIVE` (403).
* La municipalidad debe estar **activa** y su `self_registration_policy` no puede ser `INVITE_ONLY`.
  Cuando lo es, la respuesta es `TENANT_NOT_OPEN_TO_CITIZENS` (403) — un código propio, nunca un
  `ACCESS_DENIED` mudo: el cliente puede decir "esta municipalidad todavía no atiende por la app" en
  vez de dejar a la persona creyendo que su cuenta está rota. `OPEN` y `APPROVAL_REQUIRED` permiten
  el alta inmediata porque para el ciudadano ya eran equivalentes (§1: el ciudadano queda activo de
  una vez); la aprobación previa gobierna al personal.
* Una membresía existente **no activa** (suspendida o revocada por la municipalidad) no se resucita:
  responde `MEMBERSHIP_NOT_ACTIVE`. Autoreactivarse sería deshacer una decisión del administrador.
* **Nada se transfiere.** Billetera y crédito de minutos son por municipalidad y arrancan en cero;
  las zonas, tarifas, horarios y formatos de código son los de la municipalidad nueva.
* El alta queda **auditada** como `MEMBERSHIP_CREATED` con `reason=citizen-self-service`, el tenant
  destino y el `fromTenantId` desde el que se hizo el cambio. Cambiarse a una municipalidad donde ya
  se es miembro no genera evento: no ocurrió un alta.

**Catálogo público.** `GET /api/v1/catalog/tenants` ya es el catálogo completo: sólo municipalidades
activas/publicables, con marca (nombre corto, color, logo) y ordenadas por nombre. **No se pagina**:
un país tiene a lo sumo cientos de municipalidades (Costa Rica, 82), cada fila pesa unos cientos de
bytes y la lista entera es una sola respuesta cacheable que un selector filtra en memoria; paginarla
costaría un viaje por scroll para algo que cabe en uno. Lo que sí necesita una lista larga es saltar,
y para eso se agrega `?q=` (coincide por nombre o slug en el servidor), junto al `?country=` que ya
existía. El día que un despliegue sirva miles de tenants esto pasa a ser una página, y `q` es lo que
seguirá haciéndolo usable.

## Opciones de extensión con precio calculado

```
GET /api/v1/citizen/parking/sessions/{id}/extension-options
-> [{minutes, chargeableMinutes, amount, creditMinutesApplied, payableMinutes, payable,
     newExpiresAt, allowed, unavailableReason}]
```

Una sola llamada devuelve **todas** las duraciones que la municipalidad ofrece
(`extensionIncrementsMinutes`), cada una con su monto, el crédito que se aplicaría, lo que quedaría
por pagar y la nueva hora de vencimiento. Antes el cliente tenía que cotizar una por una y confiar en
que las tres respuestas se calcularon en el mismo instante.

Reglas que se mantienen intactas: **el monto lo calcula siempre el servidor**; sólo se cobran los
minutos que caen dentro de una banda de cobro (`chargeableMinutes` puede ser menor que `minutes` y
por eso dos opciones pueden costar lo mismo); el cálculo parte del **vencimiento actual** de la
sesión, no de "ahora". `GET` porque nada ocurre: no se reserva minuto ni se mueve dinero.

Una opción que no se puede tomar viaja igual, con `allowed: false` y el motivo:
`EXTENSION_EXCEEDS_MAX` (superaría `extensionMaxTotalMinutes`) o `INSUFFICIENT_BALANCE`. Se listan en
vez de omitirse para que la app pueda mostrarlas en gris con la razón, que es lo que evita la
pregunta "¿por qué desapareció una hora?". Si la municipalidad tiene la extensión desactivada, el
endpoint entero responde `EXTENSION_DISABLED` (409), igual que extender. La respuesta **no se
cachea**: depende del horario que la sesión está por cruzar y de un crédito que puede gastarse en
otra parte un segundo después.

---

# v0.7 — Fiscalización (normativo)

Una boleta es un **acto administrativo**, no un registro de cobro: alguien la va a impugnar meses
después. Vive en su propio contexto (`module-enforcement`, ADR 0014) porque su ciclo legal dura
órdenes de magnitud más que una sesión de parqueo y porque, en el caso normal, existe **precisamente
porque no hay sesión**.

## Consulta de placa

```
GET /api/v1/inspector/plates/{plate}/status?zoneId=&spaceCode=
-> {plate, plateNormalized, verdict, verdictLabelKey, requiresBay, bay,
    coveringStay, otherStays[], checkedAt}
```

Resuelve el `TODO(domain)` que dejó el módulo de parqueo sobre las placas repetidas. La placa es
única **por ciudadano**, nunca globalmente (v0.2, regla 2), así que dos personas pueden tener sesión
vigente para `SJP123` en la misma municipalidad. **La bahía es el discriminador**:

| Situación | `verdict` |
|---|---|
| Sesión vigente para esa placa **en esa bahía** | `COVERED` |
| Sesiones vigentes, pero todas en otras bahías | `BAY_MISMATCH` (con `otherStays`) |
| Ninguna sesión vigente | `NOT_COVERED` |
| Hay coincidencias y **no se envió la bahía** | `AMBIGUOUS` con `requiresBay: true` |

El servidor **nunca** responde `COVERED` sin bahía. Devolver la primera coincidencia dejaría que el
pago de una persona excuse la infracción de otra — un error invisible, porque nadie se queja de una
multa que no se puso. `zoneId` y `spaceCode` viajan juntos o no viajan; medio par es
`VALIDATION_FAILED`. `otherStays` dice dónde y hasta cuándo, nunca de quién. La respuesta no se
cachea: quien paga mientras el fiscalizador se acerca debe estar cubierto cuando éste consulte.

## Catálogo de infracciones

```
GET  /api/v1/inspector/enforcement/infraction-types     (las vigentes; PERM_CITATION_ISSUE)
GET  /api/v1/admin/enforcement/infraction-types         (todas; PERM_CITATION_READ)
PUT  /api/v1/admin/enforcement/infraction-types         (PERM_ENFORCEMENT_MANAGE)
```

Configuración de cada municipalidad, nunca código: `code`, `name`, `description`, monto en unidades
menores, si exige fotografía, si admite descargo, plazo con descuento (`discountDays` +
`discountPercent`, ambos o ninguno) y `dueDays`. La **moneda es la de la municipalidad**, no un campo
de la petición: un catálogo con dos monedas es un reporte que suma mal. El `PUT` reemplaza el
catálogo completo — entradas con `id` se actualizan, sin `id` se crean, y **las ausentes se
desactivan, nunca se borran**, porque hay boletas de años anteriores que las referencian.

## Boleta

Estados y transiciones, explícitas y en un solo lugar:

```
DRAFT ──> ISSUED ──> PAID
  │         ├──────> APPEALED ──> UPHELD ──> PAID | CANCELLED | EXPIRED
  │         │                  └─> DISMISSED (fin)
  │         ├──────> CANCELLED (fin)
  │         └──────> EXPIRED ──> PAID | CANCELLED
  └──────> CANCELLED (fin)
```

* **`DRAFT` no tiene número.** El consecutivo se toma al emitir, para que una captura abandonada no
  queme un número de la serie: la municipalidad tiene que poder defender su numeración como completa.
* **Una boleta emitida no se edita ni se borra.** Se anula con motivo (`POST …/cancel`), y eso queda
  en el historial. No existe `PUT` ni `DELETE` sobre una boleta en toda la API.
* **Número legible por municipalidad y año**: `PREFIJO-AAAA-NNNNNN` (por ejemplo
  `SANJOS-2026-000041`). El año se calcula en la **zona horaria de la municipalidad**; el prefijo se
  deriva de su nombre corto y se **copia** a la boleta, así que renombrarla no reescribe números ya
  emitidos. Sin huecos y sin duplicados con varias instancias: fila de contador bloqueada
  (`SELECT … FOR UPDATE`) dentro de la misma transacción que inserta la boleta (ADR 0014).
* **Dos relojes**: `occurredAt` lo declara el dispositivo del funcionario y **nunca** se sobrescribe;
  `issuedAt` lo pone el servidor. Si difieren, la diferencia queda en `deviceClockSkewSeconds` — un
  descargo se construye exactamente con ese dato. Se rechaza una hora futura (más de 15 minutos) o
  con más de 7 días de atraso.
* **El monto lo fija el servidor** copiando el catálogo al emitir (código, nombre y monto quedan
  snapshotted). `amountPayable` es el monto con descuento mientras la ventana esté abierta y el monto
  completo después.
* Coordenadas completas o ausentes (`latitude` + `longitude`, con `locationAccuracyM` opcional), más
  `addressText` escrito.

### API del fiscalizador

```
POST /api/v1/inspector/citations                       (PERM_CITATION_ISSUE, Idempotency-Key)
POST /api/v1/inspector/citations/{id}/issue            (cierra el borrador)
POST /api/v1/inspector/citations/{id}/evidence         (multipart: foto | JSON: nota)
GET  /api/v1/inspector/citations                       (las mías, paginadas)
GET  /api/v1/inspector/citations/{id}                  (con evidencia e historial)
GET  /api/v1/inspector/citations/{id}/evidence/{evidenceId}
```

**Trabajo sin conexión: dos idempotencias distintas.** El header `Idempotency-Key` protege la
*petición* (repetirlo devuelve la respuesta guardada con `Idempotent-Replay: true`).
`deviceCitationId` —generado en el dispositivo, único por municipalidad— protege el *acto*: un
reenvío desde una app reinstalada, con clave nueva, responde **200** con la boleta original en vez de
201 con una segunda. El cliente distingue así si creó algo o no.

Cuando el tipo de infracción exige fotografía, `POST /citations` responde `DRAFT` sin número y
emitir sin foto es `CITATION_EVIDENCE_REQUIRED` (409); cuando no la exige, la boleta nace `ISSUED`.

### API de administración

```
GET  /api/v1/admin/enforcement/citations?status=&zoneId=&inspectorUserId=&plate=&from=&to=&page=&size=
GET  /api/v1/admin/enforcement/citations/{id}
POST /api/v1/admin/enforcement/citations/{id}/cancel    (PERM_CITATION_VOID, motivo obligatorio)
POST /api/v1/admin/enforcement/citations/{id}/appeal    (PERM_CITATION_READ)
POST /api/v1/admin/enforcement/citations/{id}/uphold    (PERM_CITATION_VOID)
POST /api/v1/admin/enforcement/citations/{id}/dismiss   (PERM_CITATION_VOID)
POST /api/v1/admin/enforcement/citations/{id}/paid      (PERM_ENFORCEMENT_MANAGE; pago en caja)
```

`plate` se busca por su forma normalizada, así que `sjp-123` encuentra `SJP123`. Los permisos están
separados a propósito: el fiscalizador **emite y lee**, no anula. Quien emite un acto no es quien
debe poder borrarlo.

## Evidencia

Fotografías y notas viven en la misma tabla porque legalmente son lo mismo: lo que la municipalidad
ofrece como prueba. De cada fotografía se guardan la clave opaca de almacenamiento, el tipo
**verificado leyendo la cabecera del archivo** (nunca el nombre ni el `Content-Type` que declaró el
cliente), el tamaño, el **SHA-256 del contenido**, el momento de captura y las coordenadas si vienen.
El digest es lo que meses después distingue "ésta es la foto que tomó el funcionario" de "ésta es una
foto que alguien puso después".

Límites por despliegue (`luparx.enforcement.*`): 10 MB por archivo, tipos `image/jpeg`, `image/png`,
`image/webp`, `image/heic`, 6 fotos por boleta. Un archivo que no sea imagen es
`EVIDENCE_TYPE_NOT_ALLOWED` (422) aunque se llame `.jpg`. El almacén es un **puerto**
(`EvidenceStorage`): sistema de archivos en desarrollo, object store en producción — con una sola
instancia el disco alcanza; con dos, no.

## Historial y trazabilidad

Cada acción sobre la boleta escribe un `citation_events` con acción, estado anterior y nuevo,
funcionario, portal, motivo, IP (hasheada con la misma pimienta que `audit_events`) y momento. **El
historial es parte de la boleta**, no un log aparte: viaja en la misma respuesta que el detalle y lo
ve también el ciudadano multado. Además, toda acción hecha por un portal queda en `audit_events`
(`CITATION_DRAFTED`, `CITATION_ISSUED`, `CITATION_EVIDENCE_ATTACHED`, `CITATION_STATUS_CHANGED`,
`CITATION_CANCELLED`, `INFRACTION_TYPES_UPDATED`).

## Multas del ciudadano

```
GET  /api/v1/citizen/fines?status=&page=&size=
GET  /api/v1/citizen/fines/{id}
GET  /api/v1/citizen/fines/{id}/evidence/{evidenceId}
POST /api/v1/citizen/fines/{id}/payments        -> 501 NOT_IMPLEMENTED (contrato reservado)
```

**Se listan por vehículo propio, jamás por placa.** Cualquiera puede registrar cualquier placa —eso
es lo que hace funcionar el carro familiar— así que listar "toda boleta cuya placa coincida con una
que escribí en mi garaje" le mostraría a una persona las multas de otra. La boleta se enlaza a un
vehículo sólo cuando la placa resuelve a **exactamente uno** registrado en la plataforma; si dos
ciudadanos registraron la misma placa no se enlaza a ninguno y ninguno la ve en la app (la
municipalidad la entrega como siempre lo hizo, y la administración puede vincularla). La vista del
ciudadano es deliberadamente más angosta que la del funcionario: sin identificador del fiscalizador,
sin desfase de reloj, sin referencia interna de sesión.

**Pago (reservado, no implementado).** `POST /api/v1/citizen/fines/{id}/payments` con
`Idempotency-Key`, cuerpo con el método de pago y respuesta con la boleta en su nuevo estado. El
modelo ya está: `PAID` está en la tabla de transiciones y el servidor ya calcula el monto exigible
(con descuento mientras la ventana esté abierta) en cada lectura. La tanda de pagos agrega el
proveedor, el recibo y la conciliación, no un concepto nuevo.

## Códigos de error

`CITATION_NOT_FOUND` (404), `CITATION_INVALID_TRANSITION` (409), `CITATION_EVIDENCE_REQUIRED` (409),
`CITATION_NOT_EDITABLE` (409), `CITATION_APPEAL_NOT_ALLOWED` (409), `INFRACTION_TYPE_NOT_FOUND`
(404), `INFRACTION_TYPE_INACTIVE` (422), `EVIDENCE_NOT_FOUND` (404), `EVIDENCE_TOO_LARGE` (422),
`EVIDENCE_TYPE_NOT_ALLOWED` (422), `EVIDENCE_LIMIT_REACHED` (409).

---

# v0.8 — Descargo, aviso legal y recarga de saldo (normativo)

## Descargo del ciudadano, con moderación

```
GET  /api/v1/citizen/fines/appeal-notice          aviso legal vigente (id + versión)
POST /api/v1/citizen/fines/{id}/appeals           texto + id del aviso aceptado
GET  /api/v1/citizen/fines/{id}/appeal            mi descargo y su estado
POST /api/v1/citizen/fines/{id}/appeal/images     una imagen (multipart), máx. 1 MB
GET  /api/v1/admin/enforcement/appeals?status=    cola de moderación (SUBMITTED por defecto)
POST /api/v1/admin/enforcement/citations/{id}/appeal/resolve   {accept, reason}
```

Quién puede: **sólo la persona dueña del vehículo enlazado a la boleta** (la misma regla que el
listado de multas, y por la misma razón: la placa es única por ciudadano, no globalmente); sólo si el
tipo de infracción admite descargo; sólo mientras la boleta esté pendiente de pago y **antes de su
fecha de vencimiento** — pasado eso es `APPEAL_WINDOW_CLOSED` (409), no un `403` mudo. **Uno por
boleta**: un segundo intento es `APPEAL_ALREADY_FILED` (409), porque dos descargos abiertos sobre un
mismo acto tendrían dos resoluciones posibles.

El texto primero y las imágenes después, en su propio endpoint: lo que hace existir al descargo es lo
que la persona escribió, y quien está en una conexión mala no debe perderlo porque falló una subida.
Presentarlo mueve la boleta a `APPEALED` en la misma transacción.

**Imágenes: el cliente comprime, el servidor decide.** Límite duro de **1 MB por imagen** verificado
en el servidor (`EVIDENCE_TOO_LARGE`, 422); el tipo se determina **leyendo la cabecera del archivo**,
nunca el nombre ni el `Content-Type` declarado (`EVIDENCE_TYPE_NOT_ALLOWED`); la **cantidad máxima es
configurable por municipalidad** (`PUT /admin/enforcement/settings`, por defecto 4, `0` significa
"sólo texto"). Se guardan en el mismo almacén y la misma tabla que la evidencia del funcionario, con
su **SHA-256**, y con `source = CITIZEN` para que nunca haya duda de quién aportó qué.

Resolver es **una** decisión: `accept: true` acepta el descargo y la boleta queda `DISMISSED`;
`accept: false` lo rechaza y la boleta queda `UPHELD` y vuelve a ser pagable. El **motivo es
obligatorio en ambos sentidos**, queda en el descargo y en el historial de la boleta, y se audita.
Esto **sustituye** a las rutas `/appeal`, `/uphold` y `/dismiss` de v0.7, que permitían mover una
boleta sin que existiera un descargo que responder.

## Aviso legal, versionado y editable

```
GET /api/v1/admin/enforcement/appeal-notice[/versions]
PUT /api/v1/admin/enforcement/appeal-notice        publica una versión NUEVA
```

**No es una clave de traducción.** Es un texto legal de una jurisdicción, lo reescribe el abogado de
la municipalidad, y el día que alguien alegue "nadie me advirtió" la única respuesta que sirve es
*este texto, esta versión, aceptada en este momento*. Vive en `appeal_notices` con dos alcances: fila
de **país** (el valor por defecto que heredan sus municipalidades, porque el código penal es nacional)
y fila de **municipalidad** (que lo sobrescribe sin esperar un despliegue). Resolución determinista:
municipalidad + locale → municipalidad + locale del tenant → país + locale → país + locale del tenant.
Una versión con `effective_from` futuro es invisible hasta su fecha.

**Las versiones no se editan, se agregan.** `POST /citizen/fines/{id}/appeals` exige
`acceptedNoticeId` y debe ser el vigente; cualquier otro es `APPEAL_NOTICE_OUTDATED` (409) y el
cliente vuelve a mostrar el texto. `citation_appeals` guarda `notice_id` y `notice_version`.

El texto sembrado para Costa Rica advierte que las expresiones injuriosas, difamatorias o
calumniosas contra un funcionario público pueden constituir delito conforme a los **artículos 145 a
147 del Código Penal (Ley 4573)**. **Ese texto debe ser revisado y aprobado por el abogado del
cliente antes de producción**: no somos su asesor legal, y está en una tabla editable exactamente
para que su abogado lo corrija sin un despliegue.

## Código de recarga (ADR 0015)

`GET /api/v1/citizen/wallet` devuelve `topupCode: {code, display, createdAt, rotatedAt}`.
`POST /api/v1/citizen/wallet/topup-code/rotate` emite uno nuevo y **anula el anterior en el acto**.

**No se usa la cédula.** Lo que se dicta en una caja lo escucha la fila, y el número de identificación
es un dato personal que además permitiría sondear cuentas ajenas. El código es dedicado, uno por
(municipalidad, persona), aleatorio, **no derivado de ningún dato personal** y rotable:

* 8 caracteres aleatorios + 1 de verificación, mostrado `XXX-XXX-XXX`;
* alfabeto base 32 de Crockford — sin **I, L, O, U** — para que no haya homógrafos al dictar; al leer,
  `O`→`0` e `I`/`L`→`1`, y las minúsculas se aceptan;
* **dígito verificador Luhn mod 32**: detecta todo error de un carácter y toda transposición adyacente
  salvo un par que difiera en 16 posiciones. Un tecleo malo falla en la caja, no acredita a otro;
* 32^8 ≈ 1.1×10^12 por municipalidad: no enumerable;
* se crea la primera vez que el ciudadano abre su billetera en esa municipalidad.

Resolución en el punto de venta:

```
GET /api/v1/admin/wallets/topup-codes/{code}   (PERM_WALLET_TOPUP)
-> {givenName, familyInitial, tenantName, currencyCode}
```

**Sólo eso**: ni saldo, ni correo, ni teléfono, ni documento. Un código mal transcrito falla en el
verificador antes de tocar la base (`TOPUP_CODE_INVALID`, 422 — "léalo de nuevo"); uno bien formado
que no es de nadie es `TOPUP_CODE_NOT_FOUND` (404). Son cosas distintas en una caja.

## Recarga de saldo

```
POST /api/v1/admin/wallets/topups        (PERM_WALLET_TOPUP, Idempotency-Key)
  {topupCode | userId, amountMinor, externalReference, note}
POST /api/v1/citizen/wallet/topups       (perfil dev únicamente)
```

Permiso propio, `WALLET_TOPUP`, nunca "lo que puede un administrador": entregar crédito es el trabajo
del cajero y la primera pregunta de un auditor municipal, así que una municipalidad tiene que poder
dárselo a quien está en la ventanilla sin darle además la administración de usuarios (lo tienen
`TENANT_ADMIN` y `TENANT_FINANCE`).

**Dos idempotencias, porque fallan distinto.** El header `Idempotency-Key` reproduce la respuesta
guardada cuando llega dos veces la misma petición. `externalReference` (el número de comprobante de la
caja) es único por municipalidad y origen, así que un reenvío desde otro proceso, otro turno o un
comprobante reimpreso **no vuelve a acreditar**: la respuesta trae `alreadyApplied: true` y el mismo
`transactionId`. El monto va en unidades menores con la moneda de la municipalidad, y cada movimiento
guarda `source` (`MUNICIPAL_COUNTER`, `PARTNER`, `CITIZEN`, `ADJUSTMENT`, `DEV`) y quién lo registró.

**Socio externo (contrato preparado, no implementado).** Una cadena de supermercados **no** puede usar
el endpoint del cajero: aquél autentica a una *persona* con sesión de portal y municipalidad, éste es
un *sistema* sin asiento en ninguna municipalidad. El contrato reservado es
`POST /api/v1/partner/wallets/topups`, autenticación servidor a servidor (mTLS o client-credentials
con una credencial por comercio), `merchantReference` obligatorio como llave de idempotencia y de
conciliación, `tenantId` explícito en el cuerpo, `source = PARTNER` y un reporte de liquidación por
comercio y día. Ver `backend/README.md`.

## Catálogo de zonas para fiscalización

`GET /api/v1/inspector/zones` (`PERM_CITATION_READ`) devuelve las zonas activas con `id`, `code`,
`name`, `description` y `spaceCodes {first, last, count}`. Cierra el hueco de que la consulta de placa
pide zona y bahía mientras la app sólo podía aprenderlas de sus propias boletas — un dispositivo nuevo
no tenía ninguna. **Sin tarifa**: un fiscalizador no cotiza precios.

El catálogo de infracciones del fiscalizador (`GET /inspector/enforcement/infraction-types`) y el de
administración (`GET /admin/enforcement/infraction-types`) salen de la **misma entidad y el mismo
mapper**; el del fiscalizador es exactamente el subconjunto activo del de administración, campo por
campo, de modo que el monto que ve el funcionario es el que se cobra.

## Códigos de error

`APPEAL_NOTICE_NOT_FOUND` (404), `APPEAL_NOTICE_OUTDATED` (409), `APPEAL_NOT_FOUND` (404),
`APPEAL_ALREADY_FILED` (409), `APPEAL_ALREADY_RESOLVED` (409), `APPEAL_WINDOW_CLOSED` (409),
`TOPUP_CODE_INVALID` (422), `TOPUP_CODE_NOT_FOUND` (404), `TOPUP_REFERENCE_ALREADY_USED` (409).

---

# v0.9 — Árbol territorial de Costa Rica y documento predeterminado (normativo)

## El árbol completo

`V19_0` carga la División Territorial Administrativa con los códigos oficiales — provincia `1`,
cantón `101`, distrito `10101`, que concatenados son el código postal — resolviendo el padre **por
código** y con `ON CONFLICT DO NOTHING`, de modo que se aplica igual sobre una base virgen que sobre
una que ya tenía sembrada parte del árbol, sin pisar nombres existentes.

`V19_1` corrige lo que la carga dejó duplicado: Monteverde (6-12, Ley 9903) y Puerto Jiménez (6-13,
Ley 10276) se crearon **segregando un distrito que ya existía**, así que el mismo territorio quedaba
ofrecido dos veces. Las dos filas viejas —`6-01-09 Monte Verde` y `6-07-02 Puerto Jiménez`— se
**desactivan, no se borran**: el catálogo sólo ofrece filas activas, y la fila sobrevive porque puede
haber direcciones guardadas que la referencian.

Estado resultante, verificado contra PostgreSQL: **7 provincias, 84 cantones, 484 filas de distrito
de las cuales 482 activas**; cero distritos sin cantón, cero cantones sin provincia, cero códigos con
longitud equivocada, y cero divisiones llamadas «Central» — los cantones primeros llevan su nombre
oficial (San José, Alajuela, Cartago, Heredia, Liberia, Puntarenas, Limón).

**Faltan 12 territorios** respecto de los 494 que declara la DTA vigente, todos creados después de la
instantánea de 2020 de la que salió la carga. No se nombran en el código: sin acceso a la fuente
oficial, inventar nombres de distritos sería peor que la falta, porque quedarían escritos en
direcciones reales. Se completan por el back-office de plataforma
(`POST /api/v1/platform/countries/CR/divisions`), sin otra migración; el encabezado de `V19_1` trae
la consulta que lista distritos por cantón para compararla con la DTA.

**Lectura por niveles.** `GET /api/v1/catalog/countries/{code}/divisions?parentId=` devuelve los
hijos de una división y `?level=` todas las de un nivel; cada llamada es **una consulta**, servida por
`ix_administrative_divisions_country_parent`, con tope de 500 filas. El desplegable pide un nivel a la
vez, así que un cantón de 15 distritos o una provincia de 20 cantones son una consulta y no una por
elemento.

## Tipo de documento predeterminado y orden de presentación

`identity_document_types` gana dos columnas (`V20_0`):

* `sort_order` — orden de presentación ascendente, **no alfabético**: el documento que porta la
  mayoría va primero y `OTHER` al final;
* `is_default` — el que el formulario trae marcado al abrir.

**Dos columnas y no una** porque son dos hechos distintos —un país puede querer mostrar el pasaporte
arriba y aun así preseleccionar la cédula— y porque con dos el invariante es verificable por la base:
`uq_identity_document_types_default`, índice único parcial sobre `country_code WHERE is_default`,
garantiza **como máximo un predeterminado por país**. Si alguien marca dos, falla el `INSERT`, no la
interfaz. Cero predeterminados es legítimo: un país nuevo puede quedar sin preselección.

Predeterminado sembrado: `NATIONAL_ID` para CR, ES, MX, PA y US — el documento que porta la mayoría
residente, nunca el pasaporte, que es el de quien viene de visita. La salvedad está escrita en la
migración: en Estados Unidos el documento de un trámite de tránsito es la licencia de conducir y el
catálogo todavía no tiene ese tipo, así que esa fila hay que revisarla el día que sea un mercado real.

```
GET /api/v1/catalog/countries/CR/document-types
-> [{type: "NATIONAL_ID", labelKey, pattern, example, default: true},
    {type: "FOREIGN_RESIDENT_ID", …, default: false},
    {type: "PASSPORT", …}, {type: "TAX_ID", …}, {type: "OTHER", …}]
```

La lista llega **ya ordenada** y con `default` marcado, de modo que el cliente sólo respeta lo que
recibe: la regla «en Costa Rica, cédula» es dato, no código de frontend —escrita en el cliente sería
la equivocada para el segundo país y no se podría corregir sin desplegar—. El miembro JSON se llama
`default` porque es lo que significa para el formulario; en Java el componente no puede llamarse así
(palabra reservada) y va mapeado.

`PUT /api/v1/platform/countries/{code}/document-types` acepta `sortOrder` e `isDefault` (ambos
opcionales: ausentes significan «dejalo como está»). Marcar un predeterminado **limpia el anterior en
la misma transacción**, y un tipo inactivo no puede ser el predeterminado: preseleccionar una opción
que el formulario no ofrece dejaría todo registro abriendo en algo que nadie puede elegir.

# v0.10 — Cronómetro arriba y redondeo hacia abajo (normativo)

## Dónde vive el cronómetro

La barra de la sesión activa va **arriba**, no abajo. Es la primera cosa de cada pantalla del
ciudadano mientras haya al menos un estacionamiento corriendo, y desaparece sola cuando no hay
ninguno.

Abajo competía por atención con cinco destinos y quedaba justo donde descansa el pulgar, que es
donde se tapa; arriba se lee como el estado de la aplicación y no como una sexta pestaña. La barra
superior de la app (marca, municipalidad activa, campana) y el cronómetro forman **un solo bloque
`sticky`** pegado a `top: 0`:

- `sticky` y no `fixed`: en el borde superior la posición estática del elemento ya es la correcta,
  así que reserva su propio espacio en el flujo y no puede tapar contenido. No hace falta medir
  nada. (Abajo sigue siendo `fixed` + `padding` medido, por la razón contraria: ahí la posición
  estática está al final del documento.)
- El *notch* se paga una sola vez: lo paga la barra de la app cuando hay, y el cronómetro cuando es
  el único elemento del bloque (pantallas sin barra de app).
- Lo que cubre un borde de la ventana se marca a sí mismo — `data-lx-top-chrome`,
  `data-lx-bottom-chrome` — y los desplegables miden esas marcas en vez de asumir un alto fijo: el
  cronómetro sólo está mientras haya sesión, de modo que cualquier constante estaría mal la mitad
  del tiempo.

## Redondeo: siempre hacia abajo

**Todo tiempo restante que se le muestra al ciudadano se trunca, nunca se redondea al más cercano.**
El servidor ya lo hacía (`Duration.between(...).toMinutes()` trunca), así que la regla existe para
que el cliente no prometa de más: con 44:30 restantes, redondear al más cercano ofrecía «45 minutos»
en el diálogo de finalizar y acreditaba 44. El número que se ve es el que el municipio va a honrar,
o un segundo de frontera menos —nunca al revés—.

Aplica a la cuenta regresiva de la barra, a la de la tarjeta de sesión activa, al formateo del
componente `Timer` y a los minutos que anuncia el diálogo de finalizar.

# v0.11 — Estacionar el carro de otra persona (normativo)

## El caso

Un ciudadano le paga el parqueo a un amigo. Hasta aquí la única forma era registrar la placa ajena
en su propia lista de vehículos y dejarla ahí para siempre; el favor de un día le ensuciaba la lista
y le dejaba en la cuenta un carro que no es suyo.

Ahora el paso «Vehículo» del flujo de estacionar ofrece, después de los vehículos propios, una opción
más: **Otro vehículo**. Al escogerla se piden dos cosas —**placa** y **tipo (carro o moto)**— y con
eso arranca la sesión.

**La placa escrita no se guarda en ningún lado más que en la sesión.** Esa fue la decisión de
producto y es la razón de ser de la función. La placa vive en `plate_snapshot`, que es exactamente lo
que necesita el fiscalizador, el comprobante y una eventual multa, y desaparece del sistema con el
historial de esa sesión. No hay casilla de «guardarlo»: quien quiera el carro en su lista lo registra
por Vehículos, donde ya existe «soy el propietario» sin marcar para justamente ese caso.

## Esquema

`parking_sessions.vehicle_id` pasa a ser **opcional**. NULL significa una sola cosa —placa escrita, no
hay vehículo del ciudadano detrás— y por eso no hay bandera aparte.

`parking_sessions.vehicle_type` es nueva y se copia en la fila, igual que la placa y por la misma
razón: es lo que el fiscalizador tiene enfrente en ese momento, el ciudadano puede editar su vehículo
después, y para una placa ajena esa fila es el **único** lugar donde el dato existe.

## API

```
POST /api/v1/citizen/parking/sessions
{ zoneId, spaceCode, minutes,
  vehicleId }                      // un vehículo propio
{ zoneId, spaceCode, minutes,
  plate, vehicleType }             // el carro de un tercero
```

Se manda **exactamente uno** de `vehicleId` y `plate`. Mandar los dos, o ninguno, es un error de
validación y no se resuelve por precedencia: un cliente que quiere decir una cosa y manda dos tiene un
error, y elegir un ganador lo escondería.

La respuesta de sesión gana `vehicleType` y su `vehicleId` puede ser `null`. `plateSnapshot` y
`vehicleType` siempre vienen, de modo que ninguna pantalla que sólo muestra el carro tiene que
preguntar cuál de los dos casos es.

La placa escrita se valida con **la misma regla** que una placa registrada: se normaliza (mayúsculas,
sin separadores) y sólo se rechaza si no queda nada utilizable o no cabe. Ninguna forma nacional de
placa se valida —eso es un hecho del registro vehicular de cada país, no de esta plataforma—.

## Una placa, un estacionamiento

`SESSION_ALREADY_ACTIVE_FOR_PLATE` (409) rechaza una segunda sesión activa sobre la misma placa en la
misma municipalidad **cuando alguno de los dos lados es una placa escrita**. Una placa que alguien
teclea es el carro que tiene enfrente, así que ahí la plataforma sí sabe que es el mismo vehículo y
cobrarlo dos veces sería un error, no una coincidencia.

Entre dos **vehículos registrados** la regla no cambia: las placas son únicas por ciudadano y no
globalmente (v0.2, regla 2), dos personas pueden legítimamente tener la misma placa registrada, y
estrechar eso ahora rechazaría estacionamientos que siempre se permitieron. En el esquema el índice
único parcial cubre sólo las placas escritas; el traslape entre una escrita y una registrada lo
rechaza el servicio dentro de la transacción. Cerrarlo también en el esquema exige primero revisar
los datos de producción, y queda anotado como tal.

## Lo que no cambia

El precio no depende del tipo de vehículo. `vehicleType` se pide y se guarda porque es lo que el
fiscalizador busca y porque es el dato por el que una municipalidad cobraría distinto el día que
decida hacerlo —no porque hoy cambie el monto—.

# v0.12 — Gastar los minutos guardados enteros (normativo)

## El caso

Los minutos guardados vienen de finalizar antes de tiempo (v0.2, regla 5) y casi nunca caen sobre una
de las opciones que vende la municipalidad: 44 minutos sobrantes de una hora, contra una lista de 30,
60 y 120.

Hasta aquí sólo se podían gastar **dentro** de una estadía más larga —pedís 60 y los 44 se descuentan
de ahí, o pedís 30 y 14 se quedan guardados—. No había forma de decir «usá justo lo que tengo», que es
lo único que quiere hacer alguien que tiene minutos guardados.

## La regla

Al iniciar un estacionamiento, las duraciones que se ofrecen son **las de la municipalidad más una
que es del ciudadano**: exactamente su saldo de minutos guardados en esa municipalidad, cuando tiene y
cuando ese número no coincide ya con un incremento publicado.

Va **primera** en el desplegable y las demás siguen en el orden de la municipalidad (30 min, 1 hora,
2 horas…). Sale siempre en **₡0**: el saldo cubre por definición todos los minutos que se están
pidiendo. En pantalla dice por qué —«Tus minutos guardados»— porque un ₡0 sin explicación es un número
sobre el que nadie puede decidir.

**El mínimo de la municipalidad no le aplica.** `sessionMinMinutes` es la estadía más corta que la
municipalidad **vende**, y esta no se está vendiendo: ya se pagó, y la plata se movió cuando se pagó.
Aplicarle el mínimo rechazaría justo el caso para el que existe la regla, porque una municipalidad
normalmente pone el mínimo igual a su incremento más chico. El **máximo sí aplica**: es sobre cuánto
tiempo puede un carro ocupar una bahía, y eso es cierto sin importar quién pagó el tiempo.

## No queda preseleccionada

La opción va de primera en la lista, pero **el desplegable abre con la estadía vendida más corta**, no
con ella. Los minutos guardados son lo que haya sobrado y pueden ser tres; abrir la pantalla ya puesta
en tres minutos dejaría que alguien que venía a parquear una hora arranque una estadía de tres con un
toque y se entere en el parabrisas. Estar de primera es lo que la hace fácil de escoger; estar
escogida por defecto la haría una trampa.

## Dónde se valida

`POST /citizen/parking/sessions` y `POST /citizen/parking/quote` aceptan esa duración además de los
incrementos; cualquier otra sigue siendo `INVALID_INCREMENT` y **nunca** se redondea a la más cercana.

El saldo se lee **una sola vez y con bloqueo** al inicio de la transacción que va a gastarlo, y ese
mismo número valida la duración y cotiza la estadía. Leerlo dos veces dejaría que el saldo se moviera
en el medio y que la validación y el precio no estuvieran de acuerdo sobre qué quiere decir «todo lo
que tengo».

## Pendiente

Ampliar tiempo todavía ofrece sólo los incrementos de ampliación de la municipalidad. La misma regla
tiene sentido ahí y no se aplicó en esta versión: la ampliación tiene además el tope
`extensionMaxTotalMinutes`, y cómo se combinan las dos cosas es una decisión de producto que no se
inventa acá.
