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
| [0006](0006-identity-federation.md) | Federación de identidad (Google, Microsoft Entra ID, Facebook) | **Superseded por 0022** |
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
| [0018](0018-external-citations.md) | Boletas levantadas en otro sistema: espejo que se lee aquí y se cobra allá | Aceptado |
| [0019](0019-payments-and-reconciliation.md) | Pagos, liquidaciones y conciliación en un módulo propio | Aceptado |
| [0020](0020-overlapping-stays-on-a-bay.md) | Una bahía puede sostener más de una estadía viva, configurable por municipalidad | Aceptado |
| [0021](0021-citizen-notifications.md) | Notificaciones al ciudadano: contexto propio, campana en la transacción y correo por el outbox | Aceptado |
| [0022](0022-retire-identity-federation.md) | Retirar la federación de identidad: LupaRX emite sus propias credenciales | Aceptado |
| [0024](0024-zone-geometry-postgis.md) | La zona es un lugar: geometría en PostGIS (MultiPolygon 4326) y GeoJSON en la API | Aceptado |
| [0025](0025-paying-a-fine-from-the-wallet.md) | Pagar la multa con el saldo: el pago retira el reclamo, y el saldo insuficiente se rechaza | Aceptado |
| [0026](0026-deployment-topology.md) | Despliegue en una instancia: un dominio con rutas, imágenes construidas en el servidor, perfil `demo` | Aceptado |
| [0027](0027-on-device-parking-reminders.md) | El aviso de vencimiento lo agenda el teléfono, reconciliado contra las estadías activas | Aceptado |

Las decisiones 0001–0013 datan del scaffold inicial (2026-09-07); 0014 y 0015 se tomaron al construir
el módulo de fiscalización y el flujo de recargas (2026-09-09); 0017 amplía la 0013 al hacer legible la
bitácora, 0018 abre el modelo de boletas a otros sistemas, 0019 separa la cadena de pagos y 0020 revisa el supuesto de «una bahía, una estadía» y 0021 le da un buzón al ciudadano y el primer consumidor al outbox, y **0022 supersede a la 0006**: la federación de identidad se retira sin haber llegado a funcionar, y la plataforma emite sus propias credenciales (2026-09-10). La **0024** pone geometría en el modelo antes de que ninguna municipalidad la pida, que es el punto 13 del plan (2026-09-11). La **0025** habilita el pago de la multa con el saldo y, al hacerlo, tiene que decidir qué pasa con un reclamo en trámite: se retira, con estado propio, porque ni dejarlo vivo ni llamarlo «rechazado» eran ciertos (2026-09-11). Todas se revisan cuando cambian los supuestos que las
motivaron (volumen, número de tenants, regulación por país, etc.). La **0026** saca la aplicación de
la laptop por primera vez y elige, para una instancia de demostración, lo barato con el costo escrito:
un dominio con rutas en vez de un subdominio por portal, y compilar en el servidor en vez de publicar
imágenes desde CI (2026-09-12).
