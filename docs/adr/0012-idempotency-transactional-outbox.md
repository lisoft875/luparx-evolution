# 0012 — Idempotencia y outbox transaccional para pagos, webhooks y eventos

- **Estado**: Aceptado
- **Fecha**: 2026-09-07

## Contexto

Operaciones como pagos, reservas, registros y procesamiento de webhooks pueden duplicarse por
reintentos del cliente, reintentos de red, o replay de un proveedor externo. El sistema correrá
con múltiples instancias backend (sin estado local), por lo que la protección contra duplicados
debe vivir en la base de datos, no en memoria.

## Alternativas consideradas

1. **Confiar en que el cliente no reintente**: no realista; los clientes HTTP reintentan por
   timeout, y los proveedores de pago/webhook reintentan activamente en caso de error o falta de
   ACK.
2. **Deduplicación en memoria por instancia**: no funciona con múltiples instancias (una request
   puede reintentar contra una instancia distinta) — incompatible con `docs/ARCHITECTURE.md` §7
   (backend stateless).
3. **Idempotency-Key + outbox transaccional en base de datos (elegida)**.

## Decisión

- **Idempotency-Key**: toda escritura sensible (`CONTRACT.md` §4: pagos, reservas, registros,
  compras, reembolsos, procesamiento de webhooks) exige el header `Idempotency-Key` provisto por
  el cliente. El backend almacena la clave junto al resultado de la primera ejecución (scoping por
  `tenant_id` + usuario/origen); una repetición de la misma clave devuelve la respuesta original
  sin re-ejecutar el efecto, dentro de una ventana de expiración configurable.
- **Webhooks externos**: se persiste el `event_id` del proveedor antes de procesar (o en la misma
  transacción); un `event_id` ya visto se responde como éxito sin duplicar el efecto de negocio
  (replay-safe), independientemente de cuántas veces el proveedor reintente la entrega.
- **Outbox transaccional**: cuando una escritura de negocio debe además emitir un evento que cruza
  el límite de un módulo o del proceso (`CONTRACT.md` §7: "toda escritura relevante emite
  `audit_events` y, si cruza frontera, `outbox_events`"), el evento se inserta en
  `outbox_events (aggregate_type, aggregate_id, tenant_id, type, payload, created_at,
  published_at)` **en la misma transacción** que el cambio de estado. Un publicador separado
  (poll o CDC) lee `outbox_events` con `published_at IS NULL` y los entrega al destino final
  (broker, webhook saliente, proyección de lectura), marcando `published_at` tras confirmar
  entrega — nunca se publica un evento de negocio sin que su causa haya quedado commiteada, y
  nunca se pierde un evento por una falla entre el commit de negocio y la publicación.
- **Reintentos hacia integraciones externas**: backoff exponencial con jitter y timeout explícito
  por dependencia externa; sólo se reintenta lo que es seguro reintentar (operaciones marcadas
  idempotentes en el proveedor, o protegidas por la propia `Idempotency-Key`/`event_id`). Se
  introduce circuit breaker en integraciones externas cuando la tasa de fallo lo justifique.

## Consecuencias / trade-offs

- (+) Duplicados de red o de UI (doble clic, reintento de app móvil con conectividad intermitente)
  no producen doble cobro ni doble registro.
- (+) Consistencia entre estado de negocio y eventos emitidos garantizada por la misma transacción
  de base de datos (sin necesidad de un broker de mensajería configurado desde v0.1).
- (−) Requiere una tabla y un proceso de publicación adicional (`outbox_events` + publicador),
  algo de complejidad operativa que un evento "fire and forget" no tendría.
- (−) El cliente debe generar y enviar `Idempotency-Key` correctamente (UUID por intento lógico de
  usuario, no por reintento técnico) — requiere disciplina en `packages/api-client`.

## Impacto de migración

Ninguno en v0.1 (`outbox_events` ya existe en el esquema desde el scaffold inicial, aunque el
publicador real se activa cuando exista un primer consumidor en v0.3 con pagos).

## Estrategia de rollback

Si el publicador de outbox falla o se detiene, los eventos quedan retenidos en `outbox_events`
sin pérdida (no se descartan); se puede pausar el publicador y reanudarlo sin duplicar publicación
gracias a `published_at`, y sin bloquear las escrituras de negocio que los generan (la tabla
outbox es independiente de la disponibilidad del publicador).
