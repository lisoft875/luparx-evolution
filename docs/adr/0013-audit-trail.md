# 0013 — Auditoría y trazabilidad de accesos

- **Estado**: Aceptado
- **Fecha**: 2026-09-07

## Contexto

Un sistema municipal con datos personales y financieros necesita responder de forma confiable
"quién hizo qué, cuándo, y sobre qué recurso", tanto para investigar incidentes como para cumplir
requisitos regulatorios que variarán por país en la expansión internacional. `CONTRACT.md` §7
exige que toda escritura relevante emita un evento de auditoría.

## Alternativas consideradas

1. **Solo logs de aplicación (no estructurados en base de datos)**: más simple, pero difícil de
   consultar de forma confiable con filtros de negocio (por tenant, por actor, por rango de fecha)
   y con retención dependiente de la infraestructura de logging, no del dominio.
2. **Tabla de auditoría dedicada en la misma base transaccional (elegida)**: `audit_events (id,
   tenant_id NULLABLE, actor_user_id, actor_portal, action, resource_type, resource_id, ip_hash,
   user_agent, metadata jsonb, occurred_at)`.

## Decisión

Qué se registra: toda escritura relevante de negocio (alta/baja/bloqueo de usuario, aprobación o
rechazo de membresía, cambio de rol, ejecución de export, y — cuando exista el dominio de
parquímetros — emisión de citaciones, cobros, reembolsos) emite una fila en `audit_events` **en la
misma transacción** que el cambio (consistencia garantizada por la base de datos, no por un job
asíncrono separado). `tenant_id` es explícito por fila y **nullable sólo** para acciones de
alcance de plataforma (p. ej. `PLATFORM_ADMIN` dando de alta una municipalidad) — nunca nulo para
una acción que ocurre dentro de un tenant.

**Qué no se registra en texto plano**: `ip_hash` almacena un hash de la IP de origen, no la IP en
claro (minimización de datos personales, ver `SECURITY.md`); `metadata jsonb` no debe incluir
secretos (contraseñas, tokens, secretos TOTP) ni el número completo de documento de identidad sin
necesidad — sólo lo estrictamente necesario para reconstruir el "qué pasó".

**No filtrado entre tenants**: `GET /api/v1/admin/audit-events?actor=&action=&from=&to=` filtra
siempre por el tenant activo del solicitante salvo `PLATFORM_ADMIN` explícito consultando el
alcance de plataforma; el índice `audit_events(tenant_id, occurred_at desc)` existe precisamente
para que ese filtro sea eficiente incluso con alto volumen histórico.

**Retención**: la retención de `audit_events` es configurable por política de plataforma/tenant
(pendiente de definir el valor exacto por jurisdicción en `docs/ROADMAP.md`, ya que la regulación
de retención de logs de acceso varía por país); el borrado, cuando corresponda, es un job
explícito y auditado él mismo (quién/qué proceso ejecutó el borrado y bajo qué política), nunca un
`DELETE` manual directo contra producción.

## Consecuencias / trade-offs

- (+) Un evento de auditoría nunca puede "perderse" por una falla asíncrona: si el cambio de
  negocio se comiteó, el evento de auditoría también.
- (+) Consultable con filtros de negocio reales (tenant, actor, acción, rango de fecha) con
  rendimiento razonable gracias al índice dedicado.
- (+) Compatible con requisitos regulatorios variables por país (la retención se parametriza, no
  se hardcodea un plazo único).
- (−) Escribir auditoría en la misma transacción añade una escritura más a cada operación sensible
  (costo de rendimiento marginal, aceptado por la garantía de consistencia que da).
- (−) Volumen de `audit_events` crece de forma indefinida — mitigado con la política de retención
  configurable y, si el volumen lo justifica más adelante, particionamiento por tiempo/tenant (ver
  `docs/ARCHITECTURE.md` §7).

## Impacto de migración

Ninguno (decisión de arranque; `audit_events` ya está en el esquema desde v0.1).

## Estrategia de rollback

No aplica como rollback de código. Si una política de retención resulta demasiado agresiva o
demasiado laxa para un país/regulación específica, se ajusta como configuración por tenant sin
migración de esquema.
