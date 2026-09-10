# Architecture Decision Records — LupaRX

Índice de decisiones arquitectónicas significativas. Cada ADR sigue el formato: contexto,
alternativas consideradas, decisión, consecuencias/trade-offs, impacto de migración, estrategia
de rollback, estado y fecha.

| # | Título | Estado |
|---|---|---|
| [0001](0001-modular-monolith.md) | Monolito modular con fronteras explícitas (vs microservicios) | Aceptado |
| [0002](0002-multitenancy-shared-schema.md) | Multi-tenancy: base y esquema compartidos con `tenant_id` + defensa en profundidad | Aceptado |
| [0003](0003-global-identity-tenant-memberships.md) | Identidad global única con membresías por municipalidad | Aceptado |
| [0004](0004-separate-portals-jwt-audiences.md) | Portales separados con audiencias JWT distintas | Aceptado |
| [0005](0005-auth-argon2-jwt-rs256-refresh-rotation.md) | Autenticación: Argon2id + JWT RS256 con rotación + refresh opaco con detección de reuso | Aceptado |
| [0006](0006-identity-federation.md) | Federación de identidad (Google, Microsoft Entra ID, Facebook) | Aceptado |
| [0007](0007-mfa-totp.md) | MFA TOTP (RFC 6238) con códigos de recuperación | **Reemplazado por [0016](0016-remove-mfa.md)** |
| [0008](0008-internationalization-catalogs.md) | Internacionalización: ISO 3166/4217, BCP 47, IANA, catálogo de divisiones administrativas | Aceptado |
| [0009](0009-money-minor-units.md) | Dinero en unidades menores enteras + código de moneda | Aceptado |
| [0010](0010-flyway-expand-contract.md) | Migraciones versionadas con Flyway y patrón expand-and-contract | Aceptado |
| [0011](0011-api-errors-versioning.md) | Errores de API con RFC 9457, versionado `/api/v1` y política de cambios incompatibles | Aceptado |
| [0012](0012-idempotency-transactional-outbox.md) | Idempotencia y outbox transaccional para pagos, webhooks y eventos | Aceptado |
| [0013](0013-audit-trail.md) | Auditoría y trazabilidad de accesos | Aceptado |
| [0014](0014-enforcement-bounded-context.md) | Fiscalización como contexto propio (`module-enforcement`), con puerto hacia parqueo | Aceptado |
| [0015](0015-wallet-topup-code.md) | Código de recarga dedicado (en vez de la cédula) para acreditar saldo en caja | Aceptado |
| [0016](0016-remove-mfa.md) | Retirar el segundo factor (MFA/TOTP) del producto | Aceptado |
| [0017](0017-audit-actor-and-origin.md) | Identidad del actor y origen en la bitácora: nombre resuelto al leer, dirección cotejada sin guardarse | Aceptado |

Las decisiones 0001–0013 datan del scaffold inicial (2026-09-07); 0014 y 0015 se tomaron al construir
el módulo de fiscalización y el flujo de recargas (2026-09-09); 0017 amplía la 0013 al hacer legible la
bitácora (2026-09-10). Todas se revisan cuando cambian los supuestos que las
motivaron (volumen, número de tenants, regulación por país, etc.).
