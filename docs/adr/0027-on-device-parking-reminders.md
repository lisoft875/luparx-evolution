# 0027 — El aviso de vencimiento lo agenda el teléfono, no el servidor

- **Estado**: Aceptado
- **Fecha**: 2026-09-15

## Contexto

El ciudadano quiere que le avisen antes de que se le venza el parqueo. La plataforma ya tiene desde
la v0.38 un módulo de notificaciones (ADR 0021): calcula «te quedan N minutos», lo escribe en la
campana dentro de la transacción y manda el correo por el outbox, con reintentos. Lo que no tiene es
forma de llegar al teléfono.

El referente del mercado (ePark) hace tres cosas distintas que conviene no confundir: avisos
(«le restan 10 min»), una tarjeta con cronómetro en la pantalla de bloqueo, y la isla dinámica. Las
dos últimas son *Live Activities* de iOS: extensión nativa en Swift, sólo iOS, y actualizaciones por
APNs especiales. Este ADR **no** las cubre.

Un hecho del dominio decide casi todo lo demás: **el instante de fin se conoce al empezar**. Una
estadía de parqueo no es un evento impredecible que el servidor deba anunciar; es una cuenta regresiva
cuyo final está fijado desde el primer segundo.

## Alternativas consideradas

1. **Push del servidor (FCM + APNs).** Lo que haría cualquiera por reflejo, y lo que ya sugiere el
   outbox existente. Rechazada como primer paso por dos razones. La técnica: exige registro de tokens
   por dispositivo (tabla nueva con dueño por tenant, rotación, limpieza de tokens muertos),
   credenciales de dos proveedores y una cuenta de Apple Developer de pago. La de producto, que pesa
   más: **el push no llega justo donde más se necesita**. El momento crítico es el ciudadano parqueado
   en un sótano a punto de pasarse, que es precisamente donde no hay señal.
2. **Avisos locales agendados en el dispositivo (elegida).** Al conocerse el fin, el teléfono pone su
   propia alarma. Funciona en modo avión, no necesita credenciales, no agrega infraestructura y no
   guarda un dato personal más. Su límite es real y queda escrito: **sólo sabe lo que el teléfono
   sabe**. Si la estadía cambia desde otro dispositivo, este teléfono se entera cuando vuelva a
   hablar con el servidor.
3. **Las dos.** Es el destino probable, y el orden importa: las locales cubren el caso común y el
   peor caso de conectividad; el push se agrega para lo que el dispositivo no puede saber solo. Se
   deja para cuando exista una app publicada y haya con qué medir si hace falta.

Y sobre **cuándo** reprogramar:

4. **Agendar al iniciar, cancelar al terminar** (por eventos). Descartada. Falla en tres situaciones
   ordinarias: extender desde otro teléfono, tener la app cerrada cuando algo cambió, y reinstalar.
   En las tres, las alarmas del teléfono y la verdad del servidor se separan — y un aviso de una
   estadía que ya terminó es **peor** que no avisar: enseña a ignorar los avisos.
5. **Reconciliar contra las estadías activas (elegida).** Cada vez que cambia la lista de estadías
   vivas, se compara lo agendado contra lo que dice el servidor y se corrige. Cubre gratis el arranque
   de la app, y las mutaciones ya invalidan esa consulta.

## Decisión

Avisos locales, reconciliados. Dos por estadía: uno antes del vencimiento y otro al vencer.

El «cuántos minutos antes» **viaja en la política** (`ParkingPolicy.expiryWarningBeforeMinutes`,
alimentado por `NOTIFY_SESSION_EXPIRING_BEFORE_MINUTES`) y no se escribe en el cliente. Quince minutos
le sirven a una municipalidad que vende medias horas y le sobran a una que vende jornadas de ocho;
escrito en el cliente, corregirlo sería una revisión de tienda en vez de un cambio de configuración.
Cero es una respuesta legítima: la instalación que no quiere avisar previo no avisa.

El permiso se pide **al iniciar la primera estadía**, no al abrir la app. Y negarlo no degrada nada:
el cronómetro en pantalla es la fuente de verdad y siempre estuvo ahí.

## Consecuencias

- **A favor**: funciona sin red; sin credenciales, sin tokens, sin infraestructura ni datos personales
  nuevos; el mismo código sirve para iOS y Android; en web se desactiva solo.
- **En contra**: sólo existe con la app instalada, y sólo sabe lo que este teléfono sabe. Una
  extensión hecha desde otro dispositivo no corrige este teléfono hasta que vuelva a consultar.
- **Deuda declarada**: los proyectos nativos (`ios/`, `android/`) todavía no están en el repositorio y
  `@capacitor/local-notifications` no es dependencia. El adaptador carga el plugin dinámicamente y
  responde «no disponible» cuando no está, que es el mismo camino que el de un ciudadano que negó el
  permiso — un camino que la app ya tiene que soportar. Hasta que se corra `npx cap add`, esto no
  suena en ningún lado y no rompe nada.
- **Vuelta atrás**: quitar el hook de `ActiveSessionsBar`. El campo de la política es aditivo y puede
  quedarse sin lector.
- **Cuándo se revisa**: cuando haya app publicada y se pueda medir cuántos avisos no llegaron por
  estar el teléfono apagado o la estadía cambiada desde otro lado. Ese número decide si entra el push
  (alternativa 1) y si la Live Activity vale su costo.
