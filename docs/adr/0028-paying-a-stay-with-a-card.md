# 0028 — Pagar una estadía o una multa con tarjeta, junto a la billetera

- **Estado**: Propuesto
- **Fecha**: 2026-09-19
- **Amplía**: [0019](0019-payments-and-reconciliation.md) (pagos y conciliación),
  [0023](0023-payment-gateway-port.md) (puerto de pasarela), [0025](0025-paying-a-fine-from-the-wallet.md)
  (pagar una multa desde el saldo)
- **Decisión de negocio de Javier (2026-09-19)**

## Contexto

Hoy una estadía se paga **sólo de la billetera**: `ParkingSessionService.start` descuenta los minutos
guardados primero (regla 5) y debita el resto del saldo, todo en una transacción — «cobro y sesión
son una sola cosa». Una multa se paga igual, desde el saldo (ADR 0025). La billetera es **por
municipalidad**: cada una maneja sus propios fondos (Decisión 4 del ADR 0019), y el saldo de San José
no vale en Escazú.

Javier quiere **dos formas de pagar conviviendo**:

1. **Tarjeta directa** — pagar la estadía (15/30/60 min) o la multa con tarjeta, en el momento, sin
   pasar por el saldo.
2. **Billetera** — como hoy, con un aviso explícito de que **el saldo es sólo para esa
   municipalidad**, porque cada una maneja sus fondos.

El motor de pagos con tarjeta ya existe (ADR 0023): `PaymentGateway`, checkout alojado, webhook
firmado, `WalletCheckoutService.resolve` como «un solo camino, tres disparadores». Lo que este ADR
decide es **cómo se conecta ese motor a cobros que no son una recarga de billetera**.

---

## Decisión 1 — La tarjeta convive con la billetera; el ciudadano elige al pagar

Al confirmar una estadía o al pagar una multa, el ciudadano ve dos opciones: **pagar con saldo**
(mostrando cuánto tiene) o **pagar con tarjeta**. No se reemplaza nada: el camino de billetera queda
intacto, y la tarjeta es un segundo camino.

Se rechazó reemplazar la billetera: hay municipalidades y vecinos que la prefieren (una sola recarga
al mes en vez de un cobro por estadía), y quitarla rompería el flujo de minutos guardados de la
regla 5, que sólo tiene sentido contra un saldo.

---

## Decisión 2 — Con tarjeta, la estadía arranca DESPUÉS de confirmar el pago

**La decisión más importante, y la conservadora a propósito.**

El pago con tarjeta es **asincrónico**: el ciudadano se va a la página del proveedor y no sabemos si
pagó hasta que el proveedor confirma (retorno, webhook o barrido — ADR 0023). La billetera es
sincrónica: se debita y la sesión arranca en la misma transacción.

Dos opciones se consideraron:

| Opción | Qué pasa | Por qué se rechazó / aceptó |
|---|---|---|
| **Arrancar al confirmar** ✅ | La sesión no existe hasta que el pago está confirmado | **Elegida.** Nadie parquea sin haber pagado |
| Arrancar al volver, confirmar en paralelo | La sesión arranca apenas vuelve; el pago se confirma después | Rechazada: si el pago falla, quedó una estadía sin pagar que hay que anular, y el inspector pudo haberla visto como pagada mientras tanto |

La consecuencia aceptada: **hay una espera de segundos** entre que el ciudadano vuelve del proveedor
y que el reloj arranca. Es el precio de no tener estadías fantasma. La interfaz lo cubre mostrando
«confirmando tu pago…» mientras `resolve` hace su trabajo.

---

## Decisión 3 — Entre pagar y confirmar hay un LIMBO, y el inspector no debe multar en él

Este es el riesgo que obliga a escribir un ADR y no sólo código.

El inspector consulta una placa contra `PlateStatusService`, que mira `activeStays`. **Una estadía
pagada por tarjeta pero no confirmada todavía no está en `activeStays`** — así que hoy el inspector
la vería `NOT_COVERED` y podría multar a alguien que **acaba de pagar**. Es exactamente la clase de
error que enoja a un vecino con razón y que una municipalidad no perdona en una demostración.

La regla: **una estadía no arranca sin pago confirmado (Decisión 2), pero la consulta de placa tiene
que saber que hay un pago en vuelo.** `PlateStatusService` gana un estado intermedio —
`PAYMENT_PENDING` — que se da cuando hay un `payment_checkout` abierto para esa placa en esa zona,
aunque la sesión no exista aún. El inspector ve «pago en proceso», no «sin pagar», y no multa.

La ventana es corta por diseño: el `checkout-ttl` (20 min, ADR 0023) y el barrido acotan cuánto puede
durar ese limbo. Un checkout que expira sin confirmarse deja la placa en `NOT_COVERED`, que para
entonces es la verdad.

**Alternativa rechazada:** no mostrar nada especial y confiar en que el pago es rápido. Se rechazó
porque «rápido» no es «siempre», y el caso que falla es el que le cuesta la multa a un inocente.

---

## Decisión 4 — Un `PaymentPurpose` por lo que se cobra, no un target genérico

`PaymentPurpose` gana **`PARKING_SESSION`**; `FINE` ya existe (usado hoy sólo desde billetera, ADR
0025). Con eso, la tabla `payments` distingue una recarga de una estadía de una multa sin mirar el
`target_id`. Es la misma razón del ADR 0023: nombrarlos ahora cuesta un varchar, descubrirlos después
cuesta migrar la tabla financiera más ocupada.

El `payment_checkout` ya tiene `target_type` / `target_id` genéricos (ADR 0023), así que **no hace
falta tabla nueva**: la «intención de estadía» (zona, placa, minutos, precio congelado) se guarda
atada al checkout hasta que se confirma. Al confirmar, `resolve` la lee y arranca la sesión.

---

## Decisión 5 — `resolve` sigue siendo un solo camino; gana un efecto, no una copia

`WalletCheckoutService.resolve` (o su sucesor) ya acredita la billetera al confirmar una recarga.
Ahora, según el `PaymentPurpose` del pago, al confirmar hace una de tres cosas:

- `WALLET_TOPUP` → acredita el saldo (como hoy)
- `PARKING_SESSION` → arranca la sesión con `ParkingSessionService.startPrepaid(...)`
- `FINE` → marca la multa pagada (`citation.markPaidFromCard(...)`, gemelo de `markPaidFromWallet`)

`startPrepaid` es un refactor pequeño: del `start` actual se extrae la parte «arrancar sin cobrar de
la billetera» y se llama desde los dos lados (billetera y tarjeta). El cobro ya ocurrió por tarjeta,
así que no se toca ningún saldo. **No se duplica la lógica de arranque**, se comparte.

Que sea un solo camino con tres disparadores es lo que hace que un webhook perdido no cueste nada: el
barrido rescata igual una estadía prepagada que una recarga, porque las dos pasan por `resolve`.

---

## Decisión 6 — La billetera avisa que es de una sola municipalidad

En la pantalla de billetera del ciudadano, un aviso: **«Este saldo es sólo para la Municipalidad de
[nombre]»**. No es cosmético: un vecino de tres municipalidades (como Ana, la cuenta de demo) tiene
tres saldos separados, y gastar en la equivocada es una confusión real. Es texto internacionalizable
(`wallet.balance.perTenantNotice`), en los tres bundles, con el nombre del tenant activo interpolado.

---

## Lo que este ADR NO hace

- **Reembolsos de una estadía pagada por tarjeta.** Si el ciudadano termina antes (regla 5), los
  minutos vuelven como **crédito de tiempo**, nunca como dinero — igual que hoy. La tarjeta no cambia
  eso: se cobró la estadía completa, y lo no usado es crédito, no una devolución a la tarjeta.
- **Contracargos** sobre una estadía ya consumida. Abierto desde el ADR 0023; una estadía que el banco
  revierte después de usada es el mismo problema sin resolver que un saldo ya gastado.
- **Pago con tarjeta guardada / un clic.** Cada pago es un checkout alojado nuevo (SAQ A, ADR 0023).
  Tokenizar la tarjeta para no re-teclearla es otra conversación y sube el alcance PCI.

## Consecuencias

- El ciudadano puede pagar sin mantener saldo, que baja la barrera de entrada para quien parquea una
  vez al mes.
- El inspector nunca multa a alguien con un pago en vuelo (Decisión 3), que es lo que protege la
  demostración y al vecino.
- La cadena del pliego se recorre igual: la estadía dice cuál pago la fondeó, y ese pago —de tarjeta o
  de saldo— aparece en la conciliación del tesorero sin que la pantalla sepa cuál fue cuál.
- `payments` gana un `PaymentPurpose`; `PlateStatusService` gana un estado; `ParkingSessionService`
  gana un `startPrepaid` extraído del `start`. Ninguna tabla nueva.

## Pendiente de implementación

1. `PaymentPurpose.PARKING_SESSION` + migración V42_0 (una línea de enum, una de CHECK).
2. `startPrepaid` extraído de `start`.
3. `resolve` despacha por `PaymentPurpose`.
4. `PlateStatusService.PAYMENT_PENDING` cuando hay checkout abierto para la placa/zona.
5. `citation.markPaidFromCard` (gemelo de `markPaidFromWallet`).
6. Endpoints: `POST /citizen/parking/sessions/checkout` y `POST /citizen/fines/{id}/checkout`.
7. Frontend: pantalla de elección saldo/tarjeta, estado «confirmando pago…», aviso de saldo por
   municipalidad.
8. Pruebas Playwright del flujo completo (elección, redirección simulada, confirmación, arranque) y
   del caso del limbo visto desde el inspector.
