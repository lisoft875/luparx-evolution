# 0025 — Pagar la multa con el saldo: el pago retira el reclamo, y el saldo insuficiente se rechaza

- **Estado**: Aceptado
- **Fecha**: 2026-09-11

## Contexto

`POST /citizen/fines/{id}/payments` estaba declarado desde la v0.7 y contestaba `501`. La pantalla
del ciudadano tenía el botón puesto y apagado, con la razón escrita al lado. Mientras tanto existían
las dos mitades que faltaban: la billetera con movimientos **sólo-anexado** (`wallet_transactions`,
v0.32) y el ciclo de vida de la boleta con su tabla de transiciones en un solo lugar
(`CitationStatus`). Lo único que no existía era el acto de unirlas.

El segundo hecho del contexto es el que hace difícil la decisión: desde la v0.17 un ciudadano puede
presentar un **reclamo** (hasta esta versión, «descargo» — ver abajo) y, mientras está en trámite, la
multa no se cobra. Así que al habilitar el pago aparece una pregunta que no es técnica: **¿puede
pagar quien tiene un reclamo esperando?**

Y hay un tercero, de plata: mientras la ventana de pronto pago está abierta el monto exigible es el
rebajado. Un reclamo que la municipalidad tarda tres semanas en resolver se come esa ventana. Prohibir
el pago durante el trámite es, en la práctica, cobrarle al ciudadano el tiempo de la oficina.

## Alternativas consideradas

1. **Prohibir el pago mientras el reclamo esté en trámite.** Es la lectura literal del contrato
   («mientras esté en trámite la multa no se cobra») y la más simple: cero estados nuevos. Rechazada
   por el tercer hecho: convierte la demora de la municipalidad en un recargo para el ciudadano, y
   deja sin salida a quien sólo quiere terminar el asunto.
2. **Permitir el pago y dejar el reclamo vivo.** El más cómodo de implementar: no toca
   `AppealStatus`. Rechazado por incoherente — una oficina resolviendo un reclamo sobre una boleta ya
   pagada tendría que inventar qué significa «aceptado» ahí (¿devolución? ¿nota de crédito? ¿nada?),
   y esa pregunta es un proceso de reembolso que esta plataforma no tiene.
3. **Permitir el pago y marcar el reclamo como `REJECTED`.** Un estado menos. Rechazado con fuerza:
   pone en boca de la municipalidad una decisión que nunca tomó, y el ciudadano leería en su
   historial que perdió un argumento que nadie escuchó.
4. **Permitir el pago y retirar el reclamo, con estado propio `WITHDRAWN` (elegida).**

Y, sobre el saldo que no alcanza:

5. **Cobro parcial** — descontar lo que haya y dejar el resto. Rechazado: media multa pagada es una
   multa impaga con la plata gastada, y obliga a un modelo de saldos por boleta que hoy no existe.
6. **Saltar a la tarjeta desde aquí.** Rechazado por ahora: la pasarela entra por `PaymentGateway`
   (ADR 0023) y mezclarla en este flujo ataría dos caminos de dinero antes de que el segundo exista.
7. **Rechazar y ofrecer recargar (elegida).**

## Decisión

- **`AppealStatus.WITHDRAWN`**, un cuarto valor. Lleva `resolved_at` —dejó de esperar, y cuándo— y
  **nunca** `resolved_by` ni motivo, porque no hubo funcionario que nombrar. El esquema lo sostiene:
  `ck_citation_appeals_resolution` exige autor y motivo para `ACCEPTED`/`REJECTED` y los prohíbe para
  `WITHDRAWN`. En el código la distinción es `isResolved()` («ya no espera») frente a `isDecided()`
  («la municipalidad falló»), y lo que la base comprueba es lo segundo.
- **`APPEALED → PAID`** entra en la tabla de transiciones. Es la única forma de salir de `APPEALED`
  sin depender de la oficina.
- **El reclamo de otra persona no se retira nunca.** Dos ciudadanos pueden tener registrada la misma
  placa; si el reclamo en trámite lo presentó el otro, el pago se **rechaza**
  (`APPEAL_BY_ANOTHER_CITIZEN`) en vez de destruirle el caso sin avisarle.
- **Saldo insuficiente = rechazo con salida.** `INSUFFICIENT_BALANCE`, sin cobro parcial, y la
  pantalla ofrece «Recargar saldo». La comprobación se hace dos veces a propósito: en el cliente para
  no dejar apretar un botón que va a fallar, y en el servidor porque es la única autoridad sobre el
  saldo en el instante en que llega la petición.
- **El cuerpo nombra el medio y jamás un monto.** `{"method":"WALLET"}`. Cuánto se cobra lo decide el
  servidor con `amountPayableAt(now)` —el rebajado si la ventana sigue abierta—, y un cuerpo que
  pudiera traer cifra sería un cliente poniéndole precio a su propia multa. Un `method` desconocido
  se rechaza con `VALIDATION_FAILED`: quien pida `CARD` hoy tiene que oír que todavía no está, no
  que le cobraron la billetera.
- **`FINE_CHARGE`**, tipo propio de movimiento y siempre negativo por CHECK. No se reusa
  `SESSION_CHARGE`: el historial de la billetera es lo que el ciudadano lee para entender en qué se
  le fue la plata, y «cargo» a secas no es una respuesta.
- **`citations.paid_at` y `citations.paid_wallet_transaction_id`** en la boleta, sin llave foránea
  —cruzan contexto (ADR 0014)— y con `ck_citations_paid_movement`: sólo puede haber movimiento
  apuntado si la boleta está `PAID` y con fecha. Es el puente entre el acto administrativo y la plata,
  y es lo que permite responder «¿con qué se pagó esta boleta?» sin recorrer la billetera entera.
- **`Idempotency-Key` obligatoria** en la ruta (lista blanca del filtro, ADR 0012): un reintento por
  timeout no puede cobrar dos veces.
- **Orden del servicio, y es normativo**: pertenencia → no es espejo → el estado admite `PAID` →
  retirar el reclamo → calcular el monto → cobrar la billetera → marcar la boleta. El cobro va
  **después** de todos los rechazos, dentro de la misma transacción, y por eso ninguna negativa deja
  plata movida.

## Compromisos

- **Un reclamo retirado no se puede volver a presentar**: `APPEAL_ALREADY_FILED` sigue mirando la
  existencia de la fila, no su estado. Es deliberado —la boleta ya está pagada y es terminal— pero
  significa que quien pague por error pierde el reclamo de verdad. De ahí que el diálogo lo diga con
  todas las letras antes del botón, y no después en una fila del historial.
- **Sin reembolsos.** Un reclamo que se habría aceptado y se pagó antes no tiene vuelta dentro de la
  plataforma; queda como trámite de la municipalidad. Meter reembolsos aquí es la cadena de pagos
  completa (ADR 0019) y no cabía en esta versión.
- **La palabra cambia: «descargo» → «reclamo».** El término correcto en derecho administrativo no es
  el que entiende quien recibe la multa, y una pantalla que el ciudadano no entiende es una garantía
  que no puede ejercer. Cambia el texto visible y las claves de traducción **no**: `citizen.appeal.*`,
  `appeal.status.*` y `CitationAppeal` siguen llamándose igual en base, API y código. El vocabulario
  del dominio es estable; la palabra de la pantalla es traducción.

## Impacto de migración

`V39_0__fine_payment_from_wallet.sql`, aditiva y sin reescribir filas:

1. `FINE_CHARGE` entra en `ck_wallet_transactions_type` y en el CHECK de signo (negativo).
2. `WITHDRAWN` entra en `ck_citation_appeals_status`, con `ck_citation_appeals_resolution` ampliado.
3. `citations.paid_at` y `citations.paid_wallet_transaction_id` (nullable), con
   `ck_citations_paid_movement` e `ix_citations_paid`.

Una versión anterior de la aplicación corriendo contra este esquema sigue funcionando: no hay columna
obligatoria nueva ni valor retirado. Lo que **no** hace es entender `WITHDRAWN`; por eso el cliente
web trata el estado desconocido como «ya no espera» y no como rechazo.

## Reversa

Si hubiera que retirarlo: se apaga la ruta (deja de estar en la lista blanca de idempotencia y el
controlador contesta `501` otra vez) y el esquema se queda. Las columnas y los valores nuevos son
aditivos: las filas ya escritas siguen siendo ciertas —esa multa se pagó, ese reclamo se retiró— y
borrarlas sería falsear un historial. La contracción, si alguna vez se decide, es una migración
aparte y sólo después de que ninguna versión viva las lea.
