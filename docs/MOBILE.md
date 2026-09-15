# Las apps móviles del portal ciudadano

El portal ciudadano se publica de dos formas desde el mismo código: como sitio web y como app nativa
(Capacitor). La app existe por una razón concreta y no por moda: **el aviso de vencimiento se agenda
en el teléfono** (ADR 0027), y eso un navegador no lo puede hacer con la fiabilidad que hace falta —
menos todavía en iOS.

Los proyectos nativos viven en `frontend/apps/citizen/ios` y `frontend/apps/citizen/android`, y **se
versionan**: ahí están los permisos, los iconos, el identificador de la app y la firma. Lo derivado
(`Pods/`, `build/`, `.gradle/`, la copia del bundle web que `cap sync` regenera) está excluido.

## Qué hace falta en la máquina

| | Android | iOS |
| --- | --- | --- |
| Herramienta | Android Studio | **Xcode** — no bastan las Command Line Tools |
| Dependencias nativas | Gradle, lo resuelve solo | **CocoaPods** (`brew install cocoapods`) |

Si `npx cap sync` dice `Skipping pod install because CocoaPods is not installed` o
`xcodebuild requires Xcode, but active developer directory '/Library/Developer/CommandLineTools'`,
falta una de las dos cosas de la columna de iOS. Android queda igual de funcional mientras tanto: son
independientes, y el aviso se puede probar entero en un emulador Android.

Después de instalar Xcode, hay que apuntarle las herramientas de línea de comandos, que es el paso
que casi nadie recuerda:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
brew install cocoapods
cd frontend/apps/citizen && npx cap sync ios
```

## El ciclo de trabajo

```bash
cd frontend/apps/citizen
npm run build          # compila el sitio a dist/
npx cap sync           # copia dist/ a los dos proyectos y actualiza los plugins
npx cap open android   # o: npx cap open ios
```

`cap sync` hay que correrlo **cada vez que cambia el código web**: el proyecto nativo sirve una copia
de `dist/`, no el original. Un cambio que "no aparece" en el emulador casi siempre es un `sync` que
faltó.

## Los permisos de notificación, y por qué están ahí

`npx cap add android` genera un manifiesto con `INTERNET` y nada más. Para que el aviso funcione se
declararon cuatro permisos más en `android/app/src/main/AndroidManifest.xml`, cada uno por un motivo
que se nota en la calle y no en el emulador:

- **`POST_NOTIFICATIONS`** — obligatorio desde Android 13. Sin él la notificación se descarta **en
  silencio**: sin error, sin traza en el log. La alarma simplemente no aparece.
- **`SCHEDULE_EXACT_ALARM` y `USE_EXACT_ALARM`** — bajo Doze, una alarma inexacta en un teléfono que
  lleva dos horas en un bolsillo se difiere varios minutos. «Se le venció el parqueo» entregado tarde
  es igual a no entregado: la boleta ya está puesta.
- **`RECEIVE_BOOT_COMPLETED`** — Android descarta toda alarma programada al reiniciar. Sin esto,
  quien reinicie el teléfono a media estadía pierde el aviso que estaba esperando.

En iOS no hay nada que declarar: el permiso se pide en tiempo de ejecución y el `Info.plist` generado
alcanza.

## Probar que el aviso suena

1. `npx cap open android` y correr la app en un emulador.
2. Entrar como `citizen@luparx.test` / `Password123!` y elegir una municipalidad.
3. Iniciar una estadía **corta**. Con la municipalidad de Escazú el aviso previo es de 5 minutos
   (`expiryWarningBeforeMinutes`), contra los 15 de San José: se comprueba mucho más rápido.
4. El permiso se pide la primera vez. Aceptar.
5. Dejar la app en segundo plano y esperar. Deben llegar dos avisos: uno antes del vencimiento y otro
   al vencer.

Para verificar la reconciliación —que es donde estaba el error difícil— extender la estadía y
comprobar que el aviso se corre a la hora nueva en vez de sonar a la vieja. Las reglas están
verificadas aparte:

```bash
cd frontend && node packages/features/src/reminders/__checks__/parkingReminders.check.mjs
```

## Lo que todavía no está

- **El diálogo de permiso** no se muestra desde ninguna pantalla: `useParkingReminders` expone
  `requestPermission()` pero nadie lo llama todavía. Falta decidir dónde — al iniciar la primera
  estadía, o como interruptor en «Más».
- **Notificaciones push del servidor**: el aviso local no sabe de cambios hechos desde otro
  dispositivo. Es la alternativa 1 del ADR 0027 y se evalúa cuando haya app publicada.
- **Live Activity** (la tarjeta con cronómetro en la pantalla de bloqueo, la isla dinámica): exige
  una extensión nativa en Swift. Fuera del alcance del ADR 0027.
- **Publicación en tiendas**: no hay cuenta de Apple Developer ni de Google Play, ni configuración de
  firma para release.
