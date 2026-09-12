# 0021 — Notificaciones al ciudadano: contexto propio, campana en la transacción y correo por el outbox

- **Estado**: Aceptado
- **Fecha**: 2026-09-10

## Contexto

La campanita del portal ciudadano mostraba un `badgeCount: 7` quemado en `CitizenShell.tsx` y un
`onClick: () => undefined`, con un `TODO(domain)` apuntando a un endpoint que no existía. Detrás no
había nada: ni tabla, ni API, ni evento.

Lo que sí existía era la mitad difícil: el puerto `NotificationSender` con su adaptador SMTP, un
`MessageSource` con los cuerpos en tres bundles, `@Scheduled` funcionando con `PlatformJobLock`, y
**`outbox_events` desde la V1_0 sin un solo consumidor** — se escribían filas y nadie las publicaba.

El hecho que obliga a construir esto es uno solo: **una estadía que vence no tiene ninguna petición
detrás**. Todo lo demás que esta plataforma podría avisar ocurre porque alguien hizo algo —se levantó
una boleta, entró plata— y hay un ciclo de vida donde colgarse. El vencimiento no. La barra del
temporizador ya avisa, pero sólo con la app abierta y en ese teléfono, que es exactamente donde el
ciudadano **no** está cuando se le está acabando el tiempo. Sin esto, la forma confiable de enterarse
de que la estadía venció es la boleta en el parabrisas.

## Alternativas consideradas

1. **Renderizar la oración en el servidor y guardarla.** Una columna `message` y listo. Rechazada:
   congela el texto en el idioma en que se escribió, así que quien cambie la app a inglés lee su
   historial en español para siempre, y corregir una redacción torpe obliga a reescribir filas de un
   historial. Es la misma razón por la que `NotificationSender` recibe clave y modelo desde la v0.1.
2. **Notificaciones dentro de `module-parking`.** Es donde nace la mayoría. Pero también nacen en
   fiscalización y en billetera, y el módulo de parqueo ya es el más grande del sistema: sería
   convertirlo en el lugar donde todos los demás tienen que entrar a escribir.
3. **Todo por el outbox, incluida la campana.** Un relay que convierte filas de `outbox_events` en
   notificaciones. Rechazada: la notificación es estado de **esta misma base**, así que escribirla de
   forma asíncrona introduce una ventana en la que el hecho existe y el aviso no, a cambio de nada.
4. **Todo síncrono, incluido el correo.** Rechazada por lo contrario: el correo sale de esta base, y
   un SMTP caído no puede tumbar el inicio de una estadía ni la emisión de una boleta.
5. **Contexto propio, campana en la transacción y correo por el outbox (elegida).**

## Decisión

- **`module-notifications`**, con `platform-core` y `module-tenancy` y nada más. No depende de
  identidad, ni de parqueo, ni de fiscalización, ni de billetería. Lo que necesita de identidad
  —dónde escribir y en qué idioma— es el puerto `RecipientDirectory`, con su adaptador en `app`:
  mismo costado y misma razón que `ParkingStatusPort` (ADR 0014).
- **La fila se escribe en la transacción del hecho; el correo se encola.** `NotificationService.record`
  guarda la notificación y, sólo si la persona lo pidió, publica un `outbox_events` de tipo
  `notification.email.requested`. Eso hace que «la campana siempre tiene razón» y «el servidor de
  correo estaba caído» sean dos hechos independientes.
- **El evento encolado lleva un solo campo: el id de la notificación.** Dirección, idioma, nombre de
  la municipalidad y cada número de la oración se leen al enviar. Quien cambie su dirección entre que
  venció la estadía y la siguiente pasada del relay recibe el mensaje donde corresponde, y **ninguna
  dirección queda guardada en una tabla de cola** (SECURITY.md §11).
- **La idempotencia vive en el esquema.** `uq_notifications_subject` sobre
  `(user_id, type, subject_id)`. Es lo que permite que un job que corre cada minuto sobre «estadías
  que vencen en quince» no mande quince avisos: el segundo intento choca contra un índice en vez de
  depender de que el job recuerde algo que la otra réplica no puede ver.
- **Preferencia por persona, no por municipalidad**, con interruptor maestro y categorías
  (`PARKING`, `FINES`, `WALLET`) en tabla hija: la fila **es** el permiso, y la próxima categoría es
  una fila y no una migración. **Apagado por defecto**: la campana es la app y no pide permiso; la
  bandeja de entrada de alguien sí.
- **El relay reclama un solo tipo.** `outbox_events` acumula eventos de parqueo e identidad desde la
  V1_0 sin consumidor; un relay que barriera todo trataría dos años de filas viejas como una cola
  por entregar. Cada consumidor reclama lo suyo.
- **`NotificationSender` gana `sendOrThrow`.** El `send` de siempre sigue tragándose el fallo, que es
  el trato correcto para un mensaje que alguien está esperando con una pantalla abierta. Es el trato
  equivocado para uno que nadie pidió: un fallo tragado ahí es un aviso que silenciosamente nunca
  existió. El relay usa el que lanza y decide por su cuenta.

## Consecuencias / trade-offs

- **La campana se consulta por sondeo**, cada sesenta segundos. La alternativa es un socket abierto
  por cada teléfono de cada municipalidad para entregar un número que cambia unas pocas veces al día.
- **La boleta y el descargo notifican DESPUÉS del acto y se tragan su propio fallo.** Es un hueco real
  y conviene nombrarlo: una emisión cuyo aviso falla no se reintenta. Las estadías no tienen ese
  problema porque el job vuelve a leer su ventana cada minuto. Cerrarlo bien significa poner el
  endpoint de emisión detrás de un servicio de aplicación que sea dueño de la transacción, y eso es
  más grande que lo que esta función pedía. La recarga sí es transaccional, porque `TopupPaymentService`
  ya era dueño de esa transacción.
- **`CITATION_ISSUED` sólo llega si exactamente una persona tiene esa placa registrada.** Heredado de
  `findUniqueVehicleByPlate` y deliberado: las placas son únicas por ciudadano y no globalmente
  (CONTRACT.md v0.2, regla 2), y decirle a la persona equivocada que la multaron es peor que no
  decirle a nadie. La mayoría de las boletas se levantan contra carros que nunca usaron la app.
- **Los correos siguen siendo texto plano.** `SimpleMailMessage`, como todo lo demás desde la v0.1.
  Un motor de plantillas HTML es un punto de extensión que no cambia este puerto.
- **`orderedArguments` es posicional y ahora tiene seis ranuras.** Se anexaron al final, así que las
  plantillas anteriores no cambian, pero sigue siendo una lista fija: la séptima categoría de dato
  que haga falta obliga a tocar el adaptador. Un modelo con nombres sería mejor y es un cambio
  aparte.

## Impacto de migración

`V35_0` sólo **agrega**: dos tablas nuevas, una tabla hija, y cuatro columnas en `outbox_events` con
valor por defecto. Sustituye `ix_outbox_events_pending` por `ix_outbox_events_due`, que es un índice y
no un dato. Una versión anterior de la aplicación corriendo contra el esquema nuevo ignora todo esto
y sigue funcionando: es compatible con despliegue en rolling.

Contratos: `/api/v1/citizen/notifications/**` es una superficie nueva, así que no rompe nada. No se
tocó ningún endpoint existente.

## Rollback

Volver la aplicación atrás basta: las tablas quedan sin uso, los jobs dejan de correr y las filas
pendientes de `outbox_events` se quedan pendientes, que es donde estaban antes de esta versión. Si
además hiciera falta soltar el esquema, un `V35_1` que elimine las tres tablas y las cuatro columnas
lo hace sin tocar nada previo — pero borra el historial de lo que se le dijo a cada ciudadano, así que
esa decisión es del municipio y no de una migración automática.
