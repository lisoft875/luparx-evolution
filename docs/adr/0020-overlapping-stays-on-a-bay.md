# 0020 — Una bahía puede sostener más de una estadía viva

- **Estado**: Aceptado
- **Fecha**: 2026-09-10

## Contexto

Alguien paga dos horas, se va a los quince minutos y no finaliza su estadía. La bahía queda física y
legítimamente libre, pero para la plataforma sigue ocupada durante una hora y cuarenta y cinco
minutos. Hasta la v0.37 el siguiente ciudadano que llegaba a ese espacio recibía `SPACE_OCCUPIED` al
intentar iniciar.

Lo caro de esa negativa no es la fricción. Negarle el cobro **no libera la bahía**: el carro ya está
ahí y va a seguir ahí. Lo que produce es un ciudadano estacionado, dispuesto a pagar, sin poder
hacerlo, y por lo tanto **sin nada que mostrarle a un fiscalizador**. La plataforma le impedía
comprar la única prueba que lo protege y luego lo dejaba expuesto a la boleta. El incumplimiento del
conductor anterior —que no finalizó su estadía— terminaba costándoselo el segundo.

El supuesto que hacía falta revisar era otro, y estaba escrito en el esquema: `parking_sessions`
tenía un índice parcial único por `space_id` con `status = 'ACTIVE'`, es decir «una bahía, una
estadía viva». Ese enunciado suena a invariante físico —un espacio, un carro— pero no lo es: una
estadía no es la ocupación de la bahía, es **un pago con una placa, una bahía y una ventana de
tiempo**. Dos pagos que se traslapan sobre el mismo metro cuadrado no son un dato corrupto; son dos
personas que pagaron.

Lo que hace viable esta lectura es que fiscalización ya funcionaba así. `PlateVerdict` (ADR 0014)
resuelve la consulta como «¿tiene **esta placa** una estadía viva en **esta bahía**?»:
`PlateStatusService` recorre las estadías de la placa consultada y se queda con la del `space_id`
que el fiscalizador tiene enfrente. Nunca pregunta «¿de quién es esta bahía?». Dos estadías vivas de
dos placas distintas sobre una misma bahía dan `COVERED` cada una por su lado, y una tercera placa
que nunca pagó sigue dando `NOT_COVERED`: el traslape no absuelve a nadie más que a quien pagó.

## Alternativas consideradas

1. **Dejarlo como estaba y empujar la finalización temprana.** Recordatorios, notificaciones al
   vencer, un botón más visible. Ayuda al margen y ya existe (`earlyFinishEnabled`, minutos a
   favor), pero no resuelve el caso: quien se fue sin finalizar ya se fue, y el que llega no tiene
   forma de arreglarlo. Rechazada porque el costo lo sigue pagando la persona equivocada.
2. **Liberar la bahía automáticamente cuando llega un segundo pago**, cerrando la estadía anterior.
   Rechazada de plano: es cancelarle a un tercero un servicio que compró, sin su consentimiento y
   sin poder saber si de verdad se fue. Si el primero seguía ahí, la plataforma acaba de convertir
   su estadía pagada en una infracción.
3. **Permitir el traslape siempre, sin configuración.** Menos código. Pero cobrarle a dos personas
   por la misma bahía en la misma ventana es defendible (la culpa es de quien no finalizó) y también
   objetable (se vendió dos veces un espacio), y esa discusión es política municipal, no una
   decisión de plataforma. CONTRACT.md v0.2 ya dice que estas reglas son columnas y no constantes.
4. **Permitir el traslape, configurable por municipalidad, encendido por defecto (elegida).**

## Decisión

- **`parking_policies.overlapping_stays_enabled`**, `NOT NULL DEFAULT true`. En `false`,
  `ParkingSessionService.start` sigue respondiendo `SPACE_OCCUPIED` exactamente como antes de la
  v0.37; el código de error no se retira del vocabulario.
- **El valor permisivo es el predeterminado** porque el restrictivo tiene una víctima concreta y el
  permisivo no tiene ninguna. La municipalidad que prefiera vender cada bahía una sola vez lo apaga
  y ve en pantalla qué implica hacerlo.
- **`uq_parking_sessions_active_space` se sustituye por `uq_parking_sessions_active_space_plate`**
  sobre `(space_id, plate_snapshot) WHERE status = 'ACTIVE'`. El invariante que queda en la base es
  el que sigue siendo cierto bajo cualquier política: **una placa no puede tener dos estadías vivas
  en la misma bahía**, que es una persona cobrada dos veces por el mismo espacio. La carrera entre
  dos réplicas se sigue resolviendo en la base para ese caso, que es el único que corrompe algo.
  Un índice parcial no puede consultar `parking_policies`, así que el esquema deja de opinar sobre
  cuántas placas distintas caben y esa parte queda en el servicio, dentro de la transacción.
- **`ParkingSessionRepository.findBySpaceIdAndStatus` pasa de `Optional` a `List`**
  (`findAllBySpaceIdAndStatus`), y se agrega `existsBySpaceIdAndStatus`. No es cosmético: Spring
  Data lanza con más de un resultado, así que dejarlo en `Optional` habría convertido el caso
  ordinario —una bahía que alguien no liberó— en un 500 la próxima vez que alguien intentara
  parquear ahí.
- **Fiscalización no cambia.** Ni una línea de `module-enforcement`. Que no haga falta tocarla es la
  evidencia de que la regla vieja era una restricción de esquema y no una regla del dominio.
- **El ciudadano no ve nada nuevo.** No hay aviso ni pantalla adicional: lo único que cambia para él
  es que un inicio que antes se rechazaba ahora funciona. Añadir un «este espacio ya tiene otra
  estadía» sería informarlo de un estado interno sobre el que no puede hacer nada.

## Consecuencias / trade-offs

- **Una bahía puede recaudar dos veces la misma ventana.** Es el punto discutible y por eso es
  configurable. En los reportes de ocupación, dos estadías vivas sobre una bahía se cuentan como
  dos: la ocupación deja de poder derivarse contando estadías activas y hay que contar bahías
  distintas. Ningún reporte actual lo hacía, pero es la trampa que dejamos puesta para el próximo.
- **Se pierde una red de seguridad de esquema.** Antes la base impedía dos estadías vivas por bahía
  aunque el servicio se equivocara; ahora sólo impide dos de la misma placa. A cambio, el caso que
  la restricción vieja impedía era mayoritariamente legítimo.
- **`SPACE_OCCUPIED` cambia de significado según el municipio.** Con la bandera encendida ya sólo
  aparece para la misma placa sobre la misma bahía. El texto que ve el ciudadano
  (`citizen.parking.error.SPACE_OCCUPIED`) sigue sirviendo para ambos, pero es un candidato a
  desdoblarse si alguna vez conviene distinguir «alguien más lo tiene» de «vos ya lo tenés».
- **La disputa se desplaza a la calle.** Si el primer conductor no se había ido, ahora hay dos
  estadías pagadas y un solo espacio. La plataforma no puede resolver eso y no intenta hacerlo: deja
  a los dos cubiertos ante el fiscalizador, que es lo único que sí puede garantizar.

## Impacto de migración

`V34_0__parking_overlapping_stays.sql` agrega una columna con valor por defecto y sustituye un
índice. Es compatible con despliegue en rolling: una versión anterior de la aplicación que corra
contra el esquema nuevo ignora la columna y sigue rechazando el segundo inicio en código, así que
sólo pierde el respaldo del índice mientras dura el despliegue. No se reescribe ninguna fila.

Contratos de API: `ParkingPolicyResponse` gana un campo (aditivo; un cliente viejo lo ignora) y
`UpdateParkingPolicyRequest` gana un campo **opcional** —ausente conserva lo que la municipalidad
tenga— por la misma razón que `freeMinutes`: un portal de administración escrito antes de la v0.37
no debe voltear en silencio una regla que no conoce (ADR 0011).

## Rollback

Volver la aplicación a la versión anterior basta: el código viejo rechaza el segundo inicio por su
cuenta y la columna queda sin leer. Las estadías traslapadas que ya se hubieran creado siguen siendo
válidas y siguen cubriendo a su placa; ninguna consulta de fiscalización depende de que sean únicas
por bahía.

Si además hiciera falta restaurar el índice viejo, no se puede hacer a ciegas: `CREATE UNIQUE INDEX
uq_parking_sessions_active_space` falla si existe cualquier bahía con dos estadías vivas. Habría que
cerrarlas primero, y decidir cuál se cierra es una decisión del municipio sobre plata cobrada, no
algo que una migración pueda tomar sola.
