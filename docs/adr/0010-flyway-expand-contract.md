# 0010 — Migraciones versionadas con Flyway y patrón expand-and-contract para cambios incompatibles

- **Estado**: Aceptado
- **Fecha**: 2026-09-07

## Contexto

El esquema de PostgreSQL es infraestructura crítica de producción (instrucciones del proyecto).
Se necesita un mecanismo de evolución de esquema reproducible, auditable, y compatible con
despliegues rolling (múltiples instancias del backend, posiblemente en dos versiones distintas
durante un deploy).

## Alternativas consideradas

1. **Cambios de esquema manuales o ad-hoc por entorno**: rápido pero no reproducible, no auditable
   y no compatible con rolling deploys — descartado explícitamente por las instrucciones del
   proyecto ("nunca modificar esquemas de producción manualmente").
2. **ORM con migración automática (`ddl-auto=update` de Hibernate)**: conveniente en desarrollo,
   pero no determinista ni versionado, riesgoso en producción (puede generar cambios destructivos
   implícitos).
3. **Flyway con migraciones versionadas + patrón expand-and-contract (elegida)**.

## Decisión

Todo cambio de esquema es un script SQL versionado en `backend/app/src/main/resources/db/
migration` (`V{n}__descripcion.sql`), aplicado por Flyway al arrancar `app`. Para cambios
incompatibles (renombrar o eliminar una columna, cambiar un tipo de forma no compatible, dividir
una tabla), se sigue expand-and-contract en al menos tres migraciones/despliegues:

1. **Expand**: agregar la columna/tabla nueva sin tocar la existente; el código sigue escribiendo
   en ambas (o sólo en la nueva, con la vieja aún legible) durante el despliegue de transición.
2. **Migrar datos**: backfill de datos existentes a la nueva forma (script de migración de datos,
   idealmente idempotente y por lotes para tablas grandes).
3. **Contract**: una vez que ninguna versión desplegada del backend depende de la columna/tabla
   vieja, se elimina en una migración separada.

Ninguna migración elimina o renombra una columna en el mismo despliegue que introduce el código
que deja de usarla — siempre hay una ventana donde ambas formas coexisten, precisamente para no
romper una instancia vieja aún corriendo durante un rolling deploy.

## Consecuencias / trade-offs

- (+) Historial de esquema completamente reproducible y versionado junto al código.
- (+) Rolling deploys seguros: nunca hay una ventana donde una instancia vieja falle por columna
  faltante.
- (−) Cambios incompatibles toman más despliegues que un cambio directo (aceptado como costo
  necesario de seguridad operativa).
- (−) Requiere disciplina de revisión para no mezclar "expand" y "contract" en la misma migración
  por conveniencia.

## Impacto de migración

Ninguno (decisión de arranque; define el proceso, no migra nada existente).

## Estrategia de rollback

Flyway no soporta down-migrations automáticas por defecto; el rollback de una migración fallida en
producción se hace mediante una migración "forward" nueva que revierte el efecto (nunca editando
o borrando una migración ya aplicada), preservando el historial y la reproducibilidad del
esquema en todos los entornos.
