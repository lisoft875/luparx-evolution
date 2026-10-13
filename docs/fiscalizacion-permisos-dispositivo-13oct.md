# Fiscalización · Permisos del dispositivo (13-10-2026)

Commit **`b8550bb`** · prompt «Permisos de cámara y ubicación».

---

## 1. Causa encontrada y diagnóstico

No faltaba código: faltaba usar el que ya existe.

`@luparx/features/device/webCamera.ts` se escribió el 09-10 para el portal del Ciudadano y ya trae todo lo que pide el §2 — `abrirCamara()` con sus cinco motivos de fallo, `probarCamara()` que abre y cierra de verdad, `detenerCamara()` que apaga las pistas, y `CameraCaptureModal` con imagen en vivo y cierre. El Ciudadano lo usa en su propio panel de permisos desde entonces.

La Ayuda del fiscalizador nunca lo adoptó. Lo que tenía:

| Síntoma | Causa |
|---|---|
| «Probar cámara» abre un explorador de archivos en la laptop | Pulsaba un `<input type="file" capture="environment">`. En un teléfono eso abre la cámara; en escritorio el atributo `capture` se ignora por especificación y queda un selector de archivos. |
| La fila podía estar en verde sin haber abierto nada | El estado salía de `permissions.query`, o sea del registro de permisos. Es el defecto que el §2 nombra: «no considerar la cámara funcional solo porque el permiso aparece concedido». |
| Sin vista en vivo, sin botón de cerrar, sin pistas que liberar | No había `MediaStream`: el input no produce ninguno. |
| «Volver a comprobar» sólo reintentaba la ubicación | El §4 pide cámara, ubicación, sincronización y sesión. |
| «Permitir la cámara» no abría nada en navegador | Llamaba a `requestCameraPermission()`, que en navegador devuelve `granted` sin preguntar — ahí el aviso lo dispara la primera lectura. |

La **ubicación** ya había quedado correcta el 13-10 por la mañana (commit `46c2705`): botón que intenta una lectura real, las cuatro causas separadas y registro de la última comprobación. No se tocó.

---

## 2. Archivos modificados y componentes reutilizados

**Modificados**

| Archivo | Qué cambia |
|---|---|
| `apps/inspector/src/pages/HelpPage.tsx` | La fila de cámara pasa a la precedencia aparato > prueba > permiso; «Comprobar la cámara» abre la vista en vivo; se va el `<input type="file">` y `permitirCamara()`; «Volver a comprobar» actualiza los cuatro estados. |
| `packages/features/src/device/CameraCaptureModal.tsx` | Dos propiedades **aditivas**: `soloVista` (sin obturador, con botón de cerrar) y `onEstado` (cómo terminó el intento). Sin ellas la ventana se comporta exactamente como antes. |
| `packages/i18n/src/locales/es-CR.ts`, `en-US.ts` | Tres textos nuevos para el modo prueba, uno para el matiz del permiso denegado, y ocho claves que quedaron sin uso, retiradas. |

**Reutilizados sin tocar**

- `soporteDeCamara()`, `abrirCamara()`, `detenerCamara()`, `fotoDelFotograma()` — el módulo compartido.
- `DiagnosticList` y su regla de resumen, que ya impide el «todo está funcionando correctamente» con una fila en ámbar.
- Las claves `device.camera.*`, las mismas que usa el Ciudadano: si dos pantallas del mismo aparato describieran el mismo fallo con frases distintas, una de las dos estaría equivocada.
- `comprobarUbicacion()` y `probePosition()`, intactas.

**Nuevo**: `tests/responsive/fiscalizacion-permisos-dispositivo.cjs`.

---

## 3. Lo que ahora hace la pantalla

- **La prueba es una prueba.** «Comprobar la cámara» abre la cámara de verdad y muestra el vídeo en vivo. Sin obturador: en una prueba no se toma ninguna fotografía, así que no hay ninguna que pueda terminar en una boleta.
- **El permiso solo no pinta verde.** Concedido y sin probar dice «Sin comprobar». Verde sólo después de que el aparato entregó imagen.
- **Cada fallo con su nombre y su sitio**: bloqueada para este sitio / no hay cámara / la tiene otra aplicación / sin HTTPS / navegador sin soporte.
- **La cámara se libera** al cerrar, con Escape, al tocar el fondo y al salir de la pantalla.
- **Una ventana a la vez.** La vista se abre con el panel de permisos cerrado y lo reabre al cerrarse. Dos ventanas modales apiladas comparten el oyente de Escape sobre `document` en fase de captura, y `stopPropagation` no detiene al hermano registrado en el mismo nodo: una pulsación habría cerrado las dos, y las dos trampas de foco se habrían peleado por el tabulador.
- **«Volver a comprobar»** relee el permiso de cámara, intenta una lectura real de ubicación, vacía la cola y le pregunta al servidor por la sesión. La cámara **no** se reabre: eso sería pedir el permiso sin que nadie lo pulse.

---

## 4. Funciones que siguen operativas

- **Emisión de boletas y evidencia: sin tocar.** La fotografía de una boleta sigue entrando por la cámara nativa en el build de Capacitor y por el selector del sistema en navegador — el archivo original, sin recodificar, que es lo que vale como prueba meses después. Cambiar eso es lo que el §7 prohíbe sin justificación previa.
- Navegación inferior, ubicación, diagnóstico, sincronización, reporte, guías y «Acerca de»: sin cambios.
- Portal del Ciudadano: sin cambios. Las dos propiedades nuevas de la ventana compartida son opcionales.
- Administración: sin cambios.

---

## 5. Un matiz que hay que decir

En navegador, la prueba y la evidencia pasan por caminos distintos: `getUserMedia` para la prueba, el selector del sistema para la foto de la boleta.

- Si la prueba pasa, la cámara del aparato funciona.
- Si falla por «bloqueada para este sitio», **la foto de una boleta podría seguir funcionando**, porque el selector del sistema no necesita el permiso de la página.

Por eso la fila dice qué está bloqueado y añade esa frase, en vez de dejar que se lea como «no se pueden tomar fotos». Afirmar lo contrario sería un parte falso en la otra dirección.

---

## 6. Pruebas

**Automáticas** — `tests/responsive/fiscalizacion-permisos-dispositivo.cjs`, Chromium con un aparato de vídeo falso, viewport 390×844.

Cada escenario se fabrica interceptando la API del aparato antes de que arranque la aplicación, no simulándolo con una clase de CSS:

| Escenario | Qué se comprueba |
|---|---|
| Cámara, permiso concedido | Antes de probar la fila NO está en verde; «Comprobar» abre el vídeo en vivo; el panel se aparta; no hay obturador; hay botón de cerrar; al cerrar **todas** las pistas quedan `ended`; se vuelve al panel; la fila pasa a verde. |
| Cámara denegada | Dice «Bloqueada», explica dónde se habilita, no afirma que la boleta se quede sin fotos, y conserva el botón. |
| Sin cámara | Tono «no disponible», sin botón que no pueda arreglar nada. |
| Cámara tomada por otra aplicación | Lo dice así, no «bloqueada». |
| Ubicación concedida / denegada / sin receptor / tiempo agotado | Coordenadas reales; «denegado»; «no disponible» sin botón; «tiempo agotado» y no «denegado». |
| «Volver a comprobar» con dos permisos denegados | No declara que todo funciona; reintenta la ubicación de verdad; **no** marca la cámara como comprobada. |
| Sin regresiones | La barra inferior sigue completa al cerrar; la emisión de boletas conserva su acción de evidencia y su selector del sistema; cero errores de consola. |

**Estáticas, ya ejecutadas acá**: `tsc --noEmit` en los cuatro portales y los cinco paquetes, ESLint sobre todo el monorepo, y las comprobaciones del proyecto (51 casos, 0 fallos) incluidas paleta y contraste.

**Pendiente hasta el despliegue**: la corrida del arnés contra staging.

**No realizado, y no se afirma**:

- **Teléfono real.** Esto es Chromium de escritorio con un aparato de vídeo falso. La prueba en un teléfono de verdad la tiene que hacer una persona.
- **Build nativo (Capacitor).** El camino del plugin no corre en un navegador. Se conservó tal cual —`takeNativePhoto()`, el mismo mecanismo que la evidencia— pero no se ejecutó.
- `vite build` en el equipo falla por un problema de entorno previo (`@rollup/rollup-linux-arm64-gnu` ausente en `node_modules`), ajeno a este cambio; el build real lo hace Docker en staging.

---

## 7. Criterio de aceptación

| Requisito | Estado |
|---|---|
| El inspector puede probar la cámara con una acción clara | ✔ «Comprobar la cámara» abre la cámara y muestra lo que ve |
| …y verificar la ubicación | ✔ ya estaba desde `46c2705`, sin cambios |
| Entiende qué hacer si se deniega un permiso | ✔ una frase por motivo, con el sitio donde se arregla |
| La cámara se libera al terminar | ✔ comprobado contando pistas `ended`, no por inspección de código |
| La emisión de boletas, la evidencia y la navegación siguen funcionando | ✔ sin tocar, y comprobado en el arnés |
