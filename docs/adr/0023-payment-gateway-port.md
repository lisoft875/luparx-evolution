# 0023 — Puerto de pasarela: checkout alojado, simulador y la notificación que no se cree

- **Estado**: Aceptado
- **Fecha**: 2026-09-10
- **Amplía**: [0019](0019-payments-and-reconciliation.md)

## Contexto

El 0019 dejó el modelo de pagos escrito y dijo explícitamente qué faltaba: *«cuando llegue una
pasarela real es un adaptador sobre `PaymentService.begin` / `capture` / `fail`, no un rediseño»*.
Este ADR construye ese borde. Visa y Mastercard, cobradas de verdad.

Hasta hoy el único camino por el que una recarga llegaba a la billetera era `DevWalletController`:
un `POST` que acredita saldo sin que exista tarjeta, cobro ni proveedor. Sirve para probar el
parqueo; no es un pago.

## Decisión 1 — Checkout alojado, y por eso el PAN nunca entra a LupaRX

**Decisión de negocio de Javier (2026-09-10).** El ciudadano se va al dominio del proveedor, digita
la tarjeta allá y vuelve.

Las tres opciones eran checkout alojado (SAQ A), campos embebidos en iframes del proveedor (SAQ A-EP)
y formulario propio con el PAN llegando al backend (SAQ D). Se escogió la primera, y la razón no es
la comodidad: **LupaRX va a operar dinero público de varias municipalidades**. La pregunta que se
contesta en una auditoría no es «¿guardamos bien las tarjetas?» sino «¿pueden guardarlas?», y la
única respuesta que no abre una conversación es *no pasan por aquí*.

El costo es real y se acepta: una redirección se ve peor que un formulario propio, y el ciudadano ve
por un momento una marca que no es la de su municipalidad. Se revisita si el proveedor ofrece campos
embebidos y alguien mide que la redirección cuesta recargas — no antes, y nunca hacia SAQ D.

Consecuencia de código: **no existe ni existirá un DTO con `cardNumber`, `cvv` o `expiry`.** Si
alguna vez aparece uno en una revisión, es un defecto de seguridad, no una funcionalidad nueva.

## Decisión 2 — Un puerto neutral, dibujado contra tres proveedores y no contra uno

`cr.luparx.billing.port.PaymentGateway`. Antes de escribirlo se revisaron Tilopay, ONVO Pay y BAC
Credomatic, porque un puerto con la forma del vocabulario de una sola pasarela es un puerto que hay
que rehacer para la segunda — la misma trampa que el 0019 evitó en el modelo de datos.

Las dos formas que existen en el mercado caben en cuatro operaciones:

| Forma del mercado | Cómo entra al puerto |
|---|---|
| Página alojada con formulario firmado y URL de retorno (Tilopay) | `createCheckout` devuelve una URL y una referencia |
| *Payment intent* estilo Stripe con sesión de checkout (ONVO Pay) | idéntico: el intent es la referencia |
| Notificación asincrónica (todos) | `parseNotification` verifica y traduce |
| Consulta de estado (todos) | `fetchStatus` — ver decisión 3 |

Lo que **no** entra al puerto: el vocabulario del proveedor. `GatewayOutcome` tiene siete valores que
son los del dominio, no los de nadie. El código y el motivo de fallo se guardan **tal cual los dijo
el proveedor**, por la misma razón que en el 0019: traducirlos pierde justo el dato con el que se
reclama.

## Decisión 3 — La notificación es una pista; el proveedor es la autoridad

Esta es la decisión que más cambia el código y viene de leer la documentación en vez de suponerla.

**Hallazgo:** ONVO Pay autentica sus webhooks con un **secreto compartido en un header**
(`X-Webhook-Secret`), sin firma HMAC del cuerpo, sin timestamp y **sin identificador de evento**. Su
propia documentación pide tolerar eventos fuera de orden y no describe política de reintentos.

Un secreto en un header prueba que alguien conoce el secreto — no prueba que el cuerpo no fue
alterado, y sin id de evento no hay forma limpia de detectar un duplicado. **Acreditar saldo con eso
sería regalar plata a quien logre reproducir un POST.**

Así que el flujo no cree a la notificación nunca:

1. Llega la notificación. Se verifica lo que el proveedor permita verificar.
2. **Se guarda cruda, antes de procesarla** (`payment_gateway_notifications`). Es evidencia y es el
   guardia contra repeticiones: llave única por `(provider, event_id)`, y cuando el proveedor no da
   id, por el SHA-256 del cuerpo.
3. La notificación **sólo dispara una consulta**: `fetchStatus` contra el proveedor.
4. El estado que devuelve **esa** consulta es el que acredita, falla o no hace nada.

Cuesta una llamada HTTP por pago y elimina una clase entera de defectos. La regla queda en una
frase: **el webhook avisa, el proveedor confirma.** Un proveedor con firma criptográfica real no
necesitaría el paso 3, y aun así lo hace: una regla con excepciones por proveedor es una regla que
alguien va a aplicar al proveedor equivocado.

## Decisión 4 — En la URL de retorno no se acredita nada

El ciudadano vuelve a `/wallet/topup/return`. Ese endpoint **no recibe el resultado del pago**: lo
consulta. Si aceptara un `?status=ok`, cualquiera se acreditaría saldo escribiendo esa URL en la
barra de direcciones, y ese es el defecto clásico de las integraciones de pago.

El retorno hace exactamente lo mismo que el webhook (consultar al proveedor y actuar), lo que además
da la respuesta inmediata que la interfaz necesita sin depender de que la notificación haya llegado
primero. Que los dos caminos hagan lo mismo no es duplicación: es que **hay un solo camino**, y dos
disparadores. La idempotencia de `TopupPaymentService` ya garantiza que el primero que llegue
acredita y el segundo no haga nada.

El retorno se autoriza igual que cualquier ruta del portal ciudadano —JWT y dueño del checkout— y
además lleva un token de un solo uso: el checkout es un objeto por tenant y por persona, y su id no
puede servirle a nadie más (BOLA, SECURITY.md §4).

## Decisión 5 — El que abandona también se resuelve, y lo resuelve un job

Un ciudadano cierra la pestaña en la página del proveedor. No hay retorno y puede no haber webhook.
Sin nada más, ese `Payment` se queda `PENDING` para siempre y aparece en la lista de «cobrado y no
liquidado» del tesorero, que es como se aprende a no mirar esa lista.

`PendingCheckoutReaperJob` consulta el estado de los checkouts sin resolver, acredita los que el
proveedor dice que sí (un ciudadano que pagó y se le cayó la red **queda cobrado y acreditado sin
que nadie llame a la municipalidad**) y cancela los vencidos. Idempotente, con lock de plataforma,
y por tenant.

## Decisión 6 — El simulador es un proveedor, no un atajo

`SimulatedPaymentGateway` implementa el mismo puerto y ejerce el camino completo: redirección a una
página de cobro, tarjetas de prueba con resultados deterministas, retorno y **webhook de vuelta al
backend**. No es un `if (dev) creditWallet()`.

Guarda su estado en una tabla propia (`sim_gateway_charges`) y no en memoria, a propósito: un
simulador con un `HashMap` estático miente en cuanto hay dos instancias, y esa es exactamente la
clase de defecto para la que sirve tener un simulador. La tabla queda vacía en producción y el bean
sólo existe cuando `luparx.payments.provider=simulated`.

Las tarjetas de prueba son números de la lista reservada para pruebas y los resultados se derivan
del número, no del monto:

| Tarjeta | Resultado |
|---|---|
| 4111 1111 1111 1111 | Aprobada (Visa) |
| 5555 5555 5555 4444 | Aprobada (Mastercard) |
| 4000 0000 0000 0002 | Rechazada por el emisor |
| 4000 0000 0000 9995 | Fondos insuficientes |
| 4000 0000 0000 3220 | Reto 3-D Secure y luego aprobada |
| 4000 0000 0000 0069 | Tarjeta vencida |

La página de cobro simulada dice **SIMULACIÓN** en grande, no usa las marcas de Visa ni de
Mastercard ni de ningún banco, y no existe fuera del perfil `dev`.

## Lo que este ADR no hace

- **Adaptador real.** Es la siguiente iteración. El puerto ya tiene la forma; falta credenciales de
  sandbox de un proveedor.
- **Credenciales por municipalidad.** La decisión 4 del 0019 (cada municipalidad recauda en su
  cuenta) exige que las credenciales sean por tenant. Aquí queda sólo el borde:
  `PaymentGatewayRegistry.forTenant(tenantId)`, hoy con una implementación que devuelve el proveedor
  configurado del despliegue. Se resuelve al mismo tiempo que el adaptador real, porque un simulador
  no tiene credenciales que aislar y una tabla de secretos escrita antes de saber qué secretos pide
  el proveedor es una tabla que hay que migrar.
- **Devoluciones y contracargos.** `PaymentState` ya los modela; falta el efecto en el saldo, que es
  una decisión de negocio abierta (un contracargo sobre saldo ya gastado deja la billetera negativa).
- **3-D Secure real.** El simulador ejerce el reto porque el flujo tiene que aguantarlo; quién lo
  exige y cuándo lo decide el proveedor.

## Consecuencias

- El camino de la tarjeta y el de la caja municipal terminan en la misma transacción
  (`TopupPaymentService`), así que la pantalla de conciliación ve los dos sin saber cuál es cuál.
- Un cobro que falló deja fila, con el código del emisor: «pagué y no me subió el saldo» se contesta
  con datos.
- Cada notificación recibida queda guardada cruda. Cuando un proveedor discuta lo que mandó, existe
  el cuerpo exacto que mandó.
- La demostración a una municipalidad se puede correr entera sin contrato con ninguna pasarela.
