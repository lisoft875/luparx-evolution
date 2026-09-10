# 0019 — Pagos, liquidaciones y conciliación

- **Estado**: Aceptado
- **Fecha**: 2026-09-10
- **Amplía**: [0009](0009-money-minor-units.md), [0015](0015-wallet-topup-code.md)

## Contexto

Punto 10 del pliego: *«Separar claramente ParkingSession → Payment → Transaction →
Settlement/Reconciliation. LUPARX necesita poder demostrar qué se cobró, qué confirmó la
pasarela/banco y qué corresponde a la Municipalidad.»*

De esa cadena existían dos eslabones. La estadía (V11_0) y el movimiento de billetera
(`wallet_transactions`, apéndice puro con el signo atado al tipo por CHECK). Desde la v0.32 la
estadía apunta a su movimiento. Faltaban los dos extremos, y son justo los dos que miran hacia afuera
de la plataforma:

- **Payment** no existía. `wallet_transactions` tiene `source` y `external_reference`, que es un
  muñón: no hay intento, ni estado, ni comisión, ni fallo. **Un cobro que falló no dejaba rastro en
  ninguna parte**, y «qué se cobró» no se puede contestar con una tabla donde sólo están los que
  salieron bien.
- **Settlement** no existía en ninguna forma. «Qué confirmó la pasarela» era una hoja de cálculo que
  alguien cuadraba a mano una vez al mes.

---

## Decisión 1 — Un módulo propio, que no depende de parqueo

`module-billing`, con `platform-core` y `module-tenancy` como únicas dependencias internas.

La tentación era ponerlo en `module-parking`, donde ya vive la billetera. Se rechazó porque **la
plata que entra es una pregunta distinta de en qué se gasta después**: las multas van a cobrarse por
aquí, y un permiso, y lo que la municipalidad venda después. Un módulo que dependiera de parqueo
habría que reescribirlo la primera vez que algo distinto de parqueo recibiera dinero, y dejaría «qué
recaudó la municipalidad» como una pregunta que sólo el módulo de parqueo puede contestar.

Lo que este módulo sabe de la billetera es **un identificador que le entregaron**
(`payments.target_id`, sin llave foránea, a propósito). Quien une los dos contextos es
`TopupPaymentService`, en el `app`, que es donde tiene que estar una composición: abre el pago,
acredita la billetera y captura el pago, todo en una transacción.

La billetera misma es el próximo inquilino natural de este módulo. Moverla ahora habría sido una
refactorización grande a cambio de nada inmediato.

---

## Decisión 2 — Payment es un intento, no un éxito

Una fila desde que alguien lo intenta, y se queda si falla.

Es la diferencia entre un libro contable y un talonario de recibos. **«Yo pagué y no me subió el
saldo» tiene que poder contestarse**, y una tabla que sólo guarda los intentos exitosos convierte un
problema del banco en la palabra del ciudadano contra la de la municipalidad.

Tres montos y no dos: **bruto** (lo que pagó el ciudadano — el número que él ve en su estado de
cuenta y el único que puede citar, así que es el que manda), **comisión** y **neto**. El neto se
**guarda** en vez de calcularse, porque los proveedores redondean a su manera y un neto derivado que
difiera del depositado por un colón convierte cada conciliación en una investigación.

Todos los canales entran, no sólo la tarjeta: caja municipal, socio, transferencia, SINPE y ajuste.
Si el modelo cubriera sólo la pasarela, en una municipalidad pequeña la mitad del dinero quedaría
fuera del único lugar donde se puede demostrar qué entró.

---

## Decisión 3 — El reconocimiento del ingreso es a la recarga

**Decisión de negocio de Javier (2026-09-10).** El ingreso de la municipalidad se reconoce cuando el
ciudadano recarga, no cuando estaciona.

La recomendación técnica era la contraria —la recarga como pasivo (saldo del ciudadano) y el ingreso
al prestarse el servicio—, y queda escrita aquí para que la decisión sea revisable, no para
discutirla otra vez. **La consecuencia que hay que tener presente**: el saldo sin consumir figura
como ingreso ya devengado, así que una devolución, un traslado a otra municipalidad o un cierre de
cuenta se resta de un ingreso que ya se reportó.

Lo que sí se hizo fue **no cerrar la otra lectura**: el libro de billetera no se toca, así que
«cuánto de lo recaudado todavía no se ha prestado como servicio» sigue siendo calculable en cualquier
momento. Costaba nada dejarlo así, y significa que si un auditor pregunta, la respuesta está en los
datos en vez de tener que reconstruirse.

---

## Decisión 4 — Cada municipalidad recauda en su cuenta

**Decisión de negocio de Javier.** La pasarela deposita directo en la cuenta de la municipalidad;
LupaRX concilia y demuestra, pero nunca tiene la plata.

Por eso aquí no hay liquidaciones salientes ni comisión de plataforma: el `Settlement` es del
proveedor **hacia** la municipalidad. Es también bastante menos riesgo regulatorio — una plataforma
que recauda para terceros necesita otra conversación con el supervisor financiero — y la comisión de
LupaRX se factura aparte.

---

## Decisión 5 — Lo que no cuadra se reporta, no se acomoda

Los totales del corte se guardan **como los declaró el proveedor** y no se recalculan de sus propias
líneas. Si el encabezado no cuadra con las líneas, eso es un hallazgo sobre el proveedor, y
recalcular el encabezado borraría la única evidencia de que mandó algo mal.

Cuatro hallazgos, separados porque son problemas de personas distintas:

| Hallazgo | Qué significa | De quién es el problema |
|---|---|---|
| `AMOUNT_MISMATCH` | El mismo pago por otro monto | Conversación con el proveedor |
| `UNKNOWN_PAYMENT` | Liquidaron algo que aquí no existe | ¿De quién es esa plata? |
| `DUPLICATE` | La misma referencia dos veces en un corte | Error en su exportación |
| `MISSING_IN_SETTLEMENT` | Se cobró y el corte no lo menciona | **Plata que no llegó** |

El cuarto es el que cuesta, y es el que sólo aparece si además de revisar las líneas del corte se
revisa el otro sentido: **qué se cobró dentro del período que el corte nunca mencionó**. Mirar sólo
las líneas contesta «¿cuadra lo que mandaron?» dejando sin preguntar «¿mandaron todo?».

Una línea que no casa **se guarda igual**. Nunca se resuelve creando el pago que falta: una fila
inventada para que un total cuadre es exactamente lo que hace inútil un libro como evidencia.

`NOT_APPLICABLE` existe para el efectivo de caja, los ajustes y todo lo anterior a este módulo. Sin
ese valor se quedarían para siempre en la lista de «cobrado y no liquidado» — una alarma permanente
por algo que no es un problema, que es como una municipalidad aprende a no mirar la lista.

---

## Consecuencias

- Un tesorero abre una pantalla y ve tres cifras que salen de los mismos datos: cobrado, confirmado
  y sin confirmar. No pueden contradecirse entre sí porque no hay dos fuentes.
- La cadena del pliego se recorre entera y en los dos sentidos: la estadía dice cuál movimiento la
  pagó, el movimiento dice cuál pago lo fondeó, el pago dice en cuál línea de cuál corte apareció, y
  el corte dice con cuál referencia bancaria se depositó.
- Cuando llegue una pasarela real es un adaptador sobre `PaymentService.begin` / `capture` / `fail`,
  no un rediseño. Definir esto **antes** de tener proveedor es deliberado: un modelo de pagos con la
  forma del vocabulario de una pasarela hay que rehacerlo para la segunda.
- Queda pendiente: adaptador de una pasarela real, devoluciones y contracargos con su efecto en el
  saldo, importación del corte por archivo (hoy es JSON), y el estado de cuenta del ciudadano
  mostrando sus propios pagos.
