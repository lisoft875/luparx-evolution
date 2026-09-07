# LupaRX — Modelo de datos

> Derivado de `docs/CONTRACT.md` §5. Ante cualquier discrepancia, `CONTRACT.md` prevalece; este
> documento añade el diagrama visual y las notas de índices/restricciones/invariantes.

## 1. Diagrama entidad-relación

```mermaid
erDiagram
  COUNTRIES ||--o{ COUNTRY_ADMIN_LEVELS : "define niveles"
  COUNTRIES ||--o{ ADMINISTRATIVE_DIVISIONS : "contiene"
  COUNTRIES ||--o{ IDENTITY_DOCUMENT_TYPES : "define tipos de documento"
  ADMINISTRATIVE_DIVISIONS ||--o{ ADMINISTRATIVE_DIVISIONS : "parent_id (árbol N niveles)"

  COUNTRIES ||--o{ TENANTS : "país del tenant"
  COUNTRIES ||--o{ USERS : "nacionalidad / documento / dirección"
  ADMINISTRATIVE_DIVISIONS ||--o{ USERS : "dirección (level1/2/3)"

  TENANTS ||--o{ TENANT_SETTINGS : "configuración jsonb"
  TENANTS ||--o{ TENANT_MEMBERSHIPS : "otorga acceso"
  USERS ||--o{ TENANT_MEMBERSHIPS : "solicita/tiene"

  USERS ||--o| USER_CREDENTIALS : "contraseña local"
  USERS ||--o{ USER_FEDERATED_IDENTITIES : "identidades externas"
  USERS ||--o| USER_MFA_TOTP : "segundo factor"
  USERS ||--o{ USER_MFA_RECOVERY_CODES : "códigos de un solo uso"
  USERS ||--o{ REFRESH_TOKENS : "sesiones"
  USERS ||--o{ VERIFICATION_TOKENS : "verificación email / reset password"

  TENANTS ||--o{ REFRESH_TOKENS : "tenant activo de la sesión"
  TENANTS ||--o{ AUDIT_EVENTS : "alcance (nullable = plataforma)"
  TENANTS ||--o{ OUTBOX_EVENTS : "alcance"
  USERS ||--o{ AUDIT_EVENTS : "actor"

  COUNTRIES {
    char2 code PK
    string name_key
    string dial_code
    string default_locale
    string default_currency
    string default_time_zone
    bool active
  }

  COUNTRY_ADMIN_LEVELS {
    char2 country_code PK_FK
    int level PK
    string label_key
    bool required
  }

  ADMINISTRATIVE_DIVISIONS {
    uuid id PK
    char2 country_code FK
    uuid parent_id FK
    int level
    string code
    string name
    bool active
  }

  IDENTITY_DOCUMENT_TYPES {
    char2 country_code PK_FK
    string type PK
    string label_key
    string pattern
    string normalizer
    string example
  }

  TENANTS {
    uuid id PK
    string slug UK
    string legal_name
    string display_name
    char2 country_code FK
    string currency_code
    string locale
    string time_zone
    string status
    string self_registration_policy
    timestamptz created_at
  }

  TENANT_SETTINGS {
    uuid tenant_id PK_FK
    string key PK
    jsonb value
  }

  USERS {
    uuid id PK
    citext email UK
    timestamptz email_verified_at
    string given_name
    string family_name
    string second_family_name
    date birth_date
    char2 nationality_code FK
    string phone_e164
    string phone_country_code
    char2 document_country_code FK
    string document_type FK
    string document_number
    string document_number_normalized
    char2 address_country_code FK
    uuid address_level1_id FK
    uuid address_level2_id FK
    uuid address_level3_id FK
    string address_line1
    string address_line2
    string address_postal_code
    string locale
    string time_zone
    string status
    string blocked_reason
    bool mfa_required
    string accepted_terms_version
    int credentials_version
    timestamptz created_at
    timestamptz updated_at
    bigint version
  }

  USER_CREDENTIALS {
    uuid user_id PK_FK
    string password_hash
    string algorithm
    timestamptz updated_at
    bool must_change
  }

  USER_FEDERATED_IDENTITIES {
    uuid id PK
    uuid user_id FK
    string provider
    string subject
    string email
    timestamptz linked_at
  }

  USER_MFA_TOTP {
    uuid user_id PK_FK
    string secret_encrypted
    string status
    timestamptz activated_at
  }

  USER_MFA_RECOVERY_CODES {
    uuid id PK
    uuid user_id FK
    string code_hash
    timestamptz used_at
  }

  REFRESH_TOKENS {
    uuid id PK
    uuid user_id FK
    string portal
    uuid tenant_id FK
    string token_hash UK
    uuid family_id
    timestamptz expires_at
    timestamptz revoked_at
    uuid replaced_by
    string user_agent
    string ip_hash
  }

  AUTH_ATTEMPTS {
    uuid id PK
    string email_hash
    string portal
    string ip_hash
    bool success
    timestamptz occurred_at
  }

  VERIFICATION_TOKENS {
    uuid id PK
    uuid user_id FK
    string purpose
    string token_hash UK
    timestamptz expires_at
    timestamptz used_at
  }

  TENANT_MEMBERSHIPS {
    uuid id PK
    uuid tenant_id FK
    uuid user_id FK
    string portal
    string role
    string status
    uuid approved_by
    timestamptz approved_at
    timestamptz requested_at
    timestamptz revoked_at
    bigint version
  }

  AUDIT_EVENTS {
    uuid id PK
    uuid tenant_id FK "nullable = alcance plataforma"
    uuid actor_user_id FK
    string actor_portal
    string action
    string resource_type
    string resource_id
    string ip_hash
    string user_agent
    jsonb metadata
    timestamptz occurred_at
  }

  OUTBOX_EVENTS {
    uuid id PK
    string aggregate_type
    string aggregate_id
    uuid tenant_id FK
    string type
    jsonb payload
    timestamptz created_at
    timestamptz published_at
  }
```

## 2. Índices mínimos (CONTRACT.md §5)

- `users(email)` — login por email, ya cubierto por el `UNIQUE` de `citext`.
- `users(document_country_code, document_type, document_number_normalized)` — ya cubierto por el
  `UNIQUE` compuesto; además un índice de sólo lectura para búsquedas administrativas por
  documento.
- `tenant_memberships(tenant_id, status)` — listar miembros activos/pendientes de un tenant.
- `tenant_memberships(user_id)` — resolver membresías de un usuario al hacer login/cambio de tenant.
- `audit_events(tenant_id, occurred_at desc)` — consulta de auditoría filtrada por tenant y rango
  de fecha (endpoint `GET /admin/audit-events`).
- `refresh_tokens(user_id)` — revocar/listar sesiones de un usuario.
- `administrative_divisions(country_code, parent_id)` — recorrer el árbol de divisiones por nivel
  al pedir hijos de una división (`GET /catalog/countries/{code}/divisions?parentId=`).

Índices adicionales recomendados a evaluar según volumen real (no bloqueantes para v0.1):
`refresh_tokens(family_id)` (detección de reuso), `outbox_events(published_at)` parcial
(`WHERE published_at IS NULL`, cola de pendientes), `auth_attempts(email_hash, portal,
occurred_at)` (ventana de rate limiting).

## 3. Restricciones e invariantes que deben vivir en la base de datos

- **Unicidad de identidad**: `users(email)` único (case-insensitive vía `citext`);
  `users(document_country_code, document_type, document_number_normalized)` único — dos personas
  no pueden compartir el mismo documento normalizado del mismo país y tipo.
- **Unicidad de membresía**: `tenant_memberships(tenant_id, user_id, portal)` único — una persona
  tiene a lo sumo una membresía activa por combinación de tenant y portal (no puede duplicar
  solicitudes).
- **Unicidad de tenant**: `tenants(slug)` único — el slug es el identificador público/URL-safe del
  tenant.
- **Unicidad de identidad federada**: `user_federated_identities(provider, subject)` único — el
  mismo `subject` de un proveedor no puede vincularse a dos usuarios distintos.
- **Unicidad de tokens**: `refresh_tokens(token_hash)` y `verification_tokens(token_hash)` únicos
  — un hash de token nunca se reutiliza entre filas.
- **Integridad referencial obligatoria (`NOT NULL FK`)**: `tenant_memberships.tenant_id`,
  `tenant_memberships.user_id`, `users.nationality_code`, `users.document_country_code`,
  `users.address_country_code` — ninguna de estas relaciones es opcional una vez que el registro
  existe (`CONTRACT.md` §2: todos los campos de registro son obligatorios salvo los marcados `?`).
- **`tenant_id` obligatorio en datos de tenant**: cualquier tabla del dominio de parquímetros
  (v0.3+: zonas, tarifas, sesiones, citaciones, finanzas) debe declarar `tenant_id NOT NULL` con
  `FOREIGN KEY -> tenants(id)` desde su primera migración — no se acepta una tabla de negocio de
  tenant sin esa columna.
- **Money nunca `float`/`double`**: cualquier columna monetaria es `amount_minor bigint NOT NULL`
  + `currency_code char(3) NOT NULL` (ADR 0009); un `CHECK (amount_minor >= 0)` donde el dominio
  no permita montos negativos (p. ej. una tarifa), y sin esa restricción donde sí se permitan
  (p. ej. un ajuste/reembolso).
- **Optimistic locking**: `version bigint` en `users`, `tenant_memberships` y cualquier entidad
  mutable concurrentemente — el `UPDATE` debe incluir `WHERE version = :version` y fallar
  (conflicto) si no coincide, en vez de sobrescribir silenciosamente un cambio concurrente (p. ej.
  dos administradores aprobando/editando la misma membresía a la vez).
- **Divisiones administrativas**: `administrative_divisions(country_code, level, code)` único —
  el código de una división es único dentro de su país y nivel, no globalmente (dos países pueden
  reutilizar el mismo código de división).
- **`audit_events.tenant_id` nullable con propósito**: nulo únicamente para acciones de alcance de
  plataforma; toda acción dentro de un tenant debe llevar su `tenant_id` no nulo (ADR 0013) — se
  recomienda un `CHECK` o validación de aplicación estricta que impida `tenant_id NULL` cuando
  `actor_portal` no corresponde a una acción de plataforma.
- **Soft-delete selectivo**: sólo donde se justifique (p. ej. `tenants.status` en vez de borrar
  filas, para preservar integridad referencial de datos históricos como `audit_events`); las
  tablas de catálogo (`countries`, `administrative_divisions`) usan `active bool` en vez de borrado
  físico, para no romper referencias históricas de usuarios ya registrados con una división que
  luego se desactiva.
- **PK `uuid` v7 generado en aplicación** (`CONTRACT.md` §5): permite orden temporal aproximado sin
  exponer un contador secuencial entre tenants (evita enumeración de IDs como vector de fuga entre
  tenants — ver `SECURITY.md` §4).
