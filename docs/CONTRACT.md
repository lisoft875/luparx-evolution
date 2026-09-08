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
3. **Cronómetro siempre visible en móvil**: barra fija sobre la navegación inferior, presente en
   todas las pantallas mientras haya al menos una sesión activa. Muestra la que vence primero
   (placa + cuenta regresiva) y, si hay más, un indicador `+N` que abre la lista.
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
POST   /api/v1/citizen/parking/quote            {zoneId, minutes} -> {amount, creditMinutesApplied, payable}
GET    /api/v1/citizen/parking/sessions?status=ACTIVE|ALL
POST   /api/v1/citizen/parking/sessions         {zoneId, spaceCode, vehicleId, minutes}  (Idempotency-Key)
GET    /api/v1/citizen/parking/sessions/{id}
POST   /api/v1/citizen/parking/sessions/{id}/extend   {minutes}                          (Idempotency-Key)
POST   /api/v1/citizen/parking/sessions/{id}/finish                                       (Idempotency-Key)
GET    /api/v1/citizen/wallet                   saldo y movimientos del tenant activo
GET    /api/v1/citizen/time-credits             minutos a favor y su vencimiento

GET/PUT /api/v1/admin/parking/policy            (permiso TENANT_MANAGE)
GET/PUT /api/v1/admin/parking/zones|rates
```

Errores estables: `SESSION_ALREADY_ACTIVE_FOR_VEHICLE`, `SPACE_OCCUPIED`, `EXTENSION_DISABLED`,
`EARLY_FINISH_DISABLED`, `EXTENSION_EXCEEDS_MAX`, `INSUFFICIENT_BALANCE`, `INVALID_INCREMENT`.

## Invariantes

- El cálculo del monto y del crédito ocurre **siempre en el servidor**; el cliente sólo pide una
  cotización para mostrarla.
- Iniciar, extender y finalizar son **idempotentes** por `Idempotency-Key`: un doble toque en el
  botón no cobra dos veces.
- Cobro y sesión se escriben en la **misma transacción**; el saldo nunca queda debitado sin sesión.
- Toda operación queda auditada con tenant, usuario, vehículo y espacio.
