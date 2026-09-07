# 0002 — Multi-tenancy: base y esquema compartidos con `tenant_id` + defensa en profundidad

- **Estado**: Aceptado
- **Fecha**: 2026-09-07

## Contexto

Cada municipalidad (`tenants`) debe tener sus datos operativos y financieros aislados de las
demás. El sistema debe soportar decenas o cientos de municipalidades sin que el costo operativo
de la infraestructura crezca linealmente con el número de tenants, y sin comprometer el
aislamiento (`CONTRACT.md` §1: "prohibido filtrar sólo en frontend").

## Alternativas consideradas

1. **Base de datos por tenant (DB-per-tenant)**: aislamiento máximo, pero costo operativo alto
   (una conexión/pool, migración y backup por tenant); inviable para cientos de municipalidades
   pequeñas con tráfico bajo cada una.
2. **Esquema por tenant (schema-per-tenant)**: aislamiento fuerte a nivel de motor, pero Flyway
   debe correr N veces por deploy (uno por esquema), y el pool de conexiones se complica al
   necesitar cambiar de `search_path` por request. Escala peor que esquema compartido a partir de
   cientos de tenants (límite práctico de PostgreSQL en catálogos de esquema).
3. **Esquema compartido con `tenant_id` explícito + defensa en profundidad (elegida)**: una sola
   base y esquema, cada tabla operativa con `tenant_id` obligatorio, aplicado en cada capa
   (repositorio, servicio, API, jobs, caché, exportes, logs — ver `docs/ARCHITECTURE.md` §4).
4. **Row-Level Security (RLS) de PostgreSQL** como capa adicional (no alternativa excluyente):
   políticas `USING (tenant_id = current_setting('app.tenant_id')::uuid)` sobre las tablas de
   tenant, con el backend fijando `SET LOCAL app.tenant_id` al inicio de cada transacción.

## Decisión

Esquema compartido con `tenant_id` obligatorio como estrategia base para v0.1–v0.4. `TenantContext`
resuelve el tenant activo desde el claim `tid` del JWT (nunca desde un parámetro del cliente) y lo
propaga a cada repositorio. Se define **RLS como capa de defensa en profundidad a activar** cuando
ocurra cualquiera de estas condiciones: (a) el número de tablas/tenants crece lo suficiente como
para que un error humano en un `WHERE tenant_id = ...` sea un riesgo real, (b) se requiere
certificación de un cliente municipal grande que exija aislamiento a nivel de motor, o (c) se
introduce acceso de solo-lectura de terceros (BI, auditoría externa) a la base. Activarlo no
requiere cambio de esquema: se agregan políticas `CREATE POLICY` y `ALTER TABLE ... ENABLE ROW
LEVEL SECURITY` en una migración Flyway adicional; el código de aplicación ya fija `tenant_id` por
transacción para el filtrado explícito, así que sólo se añade `SET LOCAL app.tenant_id` en el
mismo punto.

**Aislamiento financiero por municipalidad**: todas las tablas de finanzas (`module-parking` v0.3+:
tarifas, sesiones de parqueo, cobros) llevan `tenant_id` no nulo con `FOREIGN KEY` a `tenants` y
`CHECK`/`NOT NULL`; ningún reporte financiero puede agregar entre tenants salvo un reporte de
plataforma explícito ejecutado por `PLATFORM_ADMIN` y auditado como tal (`audit_events`). Las
claves de idempotencia y los `outbox_events` de pagos también llevan `tenant_id` para que un
reintento o replay nunca cruce de un tenant a otro.

## Consecuencias / trade-offs

- (+) Un solo pool de conexiones, una sola ejecución de Flyway por deploy, backups y monitoreo
  centralizados; costo operativo constante sin importar el número de tenants.
- (+) Camino de mejora incremental (RLS) sin migración disruptiva cuando se necesite.
- (−) El aislamiento depende de disciplina de código en cada repositorio/servicio hasta que RLS
  esté activo; mitigado con revisión obligatoria de todo repositorio nuevo y pruebas de
  integración que verifiquen fuga entre tenants.
- (−) Un bug en la resolución de `TenantContext` podría, en teoría, filtrar datos entre tenants
  antes de activar RLS — este es el riesgo principal que motiva activar RLS tan pronto como el
  volumen de datos sensibles lo justifique.

## Impacto de migración

Ninguno en v0.1 (decisión de arranque). Activar RLS más adelante es aditivo: nuevas migraciones
Flyway, sin cambio de forma de las tablas existentes.

## Estrategia de rollback

Si RLS se activa y causa una regresión de rendimiento o un bug de compatibilidad, se puede
`DISABLE ROW LEVEL SECURITY` por tabla como mitigación inmediata (la aplicación sigue filtrando
explícitamente por `tenant_id` en todas las capas, por lo que deshabilitar RLS no abre una fuga
por sí solo) mientras se corrige la política, y luego reactivar.
