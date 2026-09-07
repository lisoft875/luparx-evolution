# 0011 — Errores de API con RFC 9457 Problem Details, versionado `/api/v1` y política de cambios incompatibles

- **Estado**: Aceptado
- **Fecha**: 2026-09-07

## Contexto

La API pública es consumida por tres apps frontend (con posibles versiones desplegadas de forma
independiente, especialmente las apps Capacitor que pasan por revisión de tiendas móviles) y debe
tratarse como contrato de larga vida (instrucciones del proyecto: "treat APIs as long-lived
contracts").

## Alternativas consideradas

1. **Formato de error ad-hoc por endpoint** (`{error: "mensaje"}` inconsistente): rápido de
   escribir pero imposible de manejar de forma genérica en el cliente, sin código estable para
   internacionalizar el mensaje ni para telemetría.
2. **RFC 9457 Problem Details (elegida)**: formato estándar (`application/problem+json`) con
   `type, title, status, detail, instance` más extensiones propias `code` (estable,
   `SCREAMING_SNAKE`, apto para mapear a clave i18n en el cliente), `traceId` (correlación con
   logs/auditoría) y `errors[] {field, code, message}` para errores de validación de campo.

## Decisión

Todo error de la API (`/api/v1/**`) responde `application/problem+json` con el shape de
`CONTRACT.md` §4. `code` es el identificador estable que el frontend usa para mostrar un mensaje
localizado (nunca se parsea `detail` en el cliente, que es texto libre para diagnóstico humano).
`traceId` se correlaciona con los logs estructurados (`docs/ARCHITECTURE.md` §6).

**Versionado**: la API vive bajo `/api/v1`. Un cambio incompatible (remover un campo de respuesta,
cambiar su tipo/semántica, remover un endpoint, cambiar códigos de error existentes) requiere
`/api/v2` o una estrategia de negociación explícita (header `Accept-Version`) — nunca se cambia el
comportamiento de `/api/v1` de forma incompatible in-place. Cambios aditivos (nuevo campo opcional,
nuevo endpoint, nuevo valor de enum que el cliente debe tratar como desconocido de forma segura) sí
son compatibles con `/api/v1` y no requieren nueva versión.

Se documenta y mantiene OpenAPI (generado desde las anotaciones/contratos del backend) como fuente
de verdad técnica sincronizada con `CONTRACT.md`; cualquier discrepancia entre OpenAPI generado y
`CONTRACT.md` se resuelve a favor de `CONTRACT.md` hasta que se actualice explícitamente.

Idempotencia: toda escritura sensible (`CONTRACT.md` §4) exige header `Idempotency-Key`; ver ADR
0012.

## Consecuencias / trade-offs

- (+) El cliente maneja errores de forma genérica (interceptor único que lee `code`/`errors[]`),
  sin parseo frágil de mensajes.
- (+) Coexistencia de versiones de app (una app Capacitor vieja en revisión de tienda, otra ya
  actualizada) es segura mientras ambas hablen `/api/v1` con cambios sólo aditivos.
- (−) Requiere disciplina de revisión de PR para distinguir cambio aditivo de incompatible —
  mitigado con checklist de PR y pruebas de contrato (snapshot de OpenAPI en CI).
- (−) Mantener dos versiones de API en paralelo (cuando exista v2) implica costo de mantenimiento
  temporal — aceptado como costo necesario de compatibilidad hacia atrás.

## Impacto de migración

Ninguno (decisión de arranque).

## Estrategia de rollback

Un cambio que se creía aditivo pero rompió un cliente se revierte con un despliegue de rollback
del backend a la versión anterior de `/api/v1` (mismo mecanismo que cualquier rollback de deploy);
no se "corrige hacia adelante" un contrato ya roto sin coordinarlo con los clientes afectados.
