# LuParX Inspector — Fase 3: diagnóstico y correcciones

**22-10-2026** · rama `main` · commit base al empezar `882e7c0` · **sin commit, push, merge, rebase ni despliegue**

---

## 1. Estado inicial, y una advertencia

```
git branch --show-current → main
git rev-parse --short HEAD → 882e7c0
git status --porcelain     → 12 modificados · 3 sin seguimiento
git diff --check           → exit 0
```

Lo modificado al empezar era trabajo ajeno a esta orden: el vehículo del ciudadano (`HomePage`,
`ParkingPage`, `VehiclesPage`, `VehicleImage`, `catalogoPrototipo`, `VehicleThumb`, las dos
traducciones) y la prueba de integración de la billetera con Testcontainers (`pom.xml`,
`WalletChargeIntegrationTest`, `WalletService`). **Nada de eso se tocó.**

> **Advertencia que conviene leer antes que nada.** Durante esta sesión aparecieron **dos commits
> nuevos** en el mismo árbol (`785ea14` y `e35cdff`, ambos del vehículo del ciudadano): hay otra
> sesión trabajando sobre el repositorio. Verifiqué que ninguna de mis claves de traducción quedó
> dentro de esos commits —`git log -S` no las encuentra en ninguno— y que el delta sin confirmar de
> `es-CR.ts`/`en-US.ts` son **exactamente** mis 11 líneas por archivo y nada más. Pero el riesgo es
> real: un `git add -A` desde la otra sesión barrería mis cambios del Inspector hacia un commit del
> ciudadano. Conviene confirmarlos por separado y pronto.

Estado al terminar: **10 modificados · 7 sin seguimiento · `git diff --check` exit 0**.

---

## 2. Los ocho puntos de la auditoría F3.0/F3.1, verificados

| # | Lo que decía la auditoría | Verificado | Evidencia |
|---|---|---|---|
| 1 | `/` usa `PlateLookupPage`; `HomePage.tsx` no está ruteado | **Confirmado** | `App.tsx:77-86` rutea `PlateLookupPage`; `grep HomePage App.tsx` → vacío; nadie la importa |
| 2 | No hay rutas rotas en los contratos inspeccionados | **Confirmado** | los 13 extremos de `InspectorEnforcementController` responden en la integración real (§5) |
| 3 | Consulta de placa: `POST /inspector/plate-checks` | **Confirmado** | `InspectorEnforcementController.java:161` |
| 4 | Zonas `GET /inspector/zones`; el resto en el controlador de fiscalización | **Confirmado** | `:260`, `:288`, `:300`, `:341`, `:371`, `:392`, `:426`, `:445`, `:475` |
| 5 | `deviceCitationId` e `Idempotency-Key` no detectan dos boletas por el mismo hecho | **Confirmado** | cada captura nace con identificadores propios (`citationQueue.ts:enqueueCitation`); para el servidor son dos actos. **Corregido con un aviso no bloqueante** (D3) |
| 6 | Mis boletas acepta `page` y `size`, sin filtros | **Confirmado** | `MyCitationsPage.tsx` sólo pasa página y tamaño; `useMyCitations(page, PAGE_SIZE)`. **No corregido**: ver §6 |
| 7 | La cola usa `navigator.onLine`; `probeServer` sólo en Help | **Confirmado, y era peor de lo descrito** | `flushQueue` se rendía en silencio y el botón se deshabilitaba con la misma señal: callejón sin salida. **Corregido** (D2) |
| 8 | Los errores de escritura ya avisan; falta el aviso proactivo de poco espacio | **Confirmado las dos mitades** | `escrituraDegradada` se dibuja en `QueuePage:56` y `NewCitationPage:601`; `estimarAlmacenamiento` existía y **no la llamaba nadie**. **Corregido** (D4) |

---

## 3. Defectos y correcciones

### D1 · P0 · Una fotografía que no se puede guardar perdía la boleta y dejaba basura

**Archivo:** `frontend/apps/inspector/src/lib/citationQueue.ts:261-293` (`enqueueCitation`)

**Reproducción:** capturar una boleta con dos o más fotografías en un aparato cuyo IndexedDB está
lleno o en ventana privada, de modo que `putPhoto` falle en la segunda.

**Qué pasaba:** la excepción salía de `enqueueCitation`, la fila **no se comprometía** y las
fotografías ya escritas quedaban en IndexedDB sin que ninguna fila las reclamara. El peor par
posible: el fiscalizador pierde la boleta **y** el aparato queda más lleno que antes, así que el
intento siguiente falla más temprano. Con seis fotografías por boleta, dos capturas bastan para
dejar inservible el almacenamiento de la jornada. Arriba, `submit` mostraba
`apiErrorMessage(error)` → «algo salió mal», que no dice qué hacer.

**Corrección:** el bucle recuerda las claves escritas; si una falla, borra las anteriores, enciende
`marcarEscrituraFallida('fotos')` y lanza el código propio `EVIDENCE_STORE_FAILED`.
`apiErrorMessage` aprendió a reconocer los códigos propios —antes sólo entendía `ApiError` y
`NetworkError`— y hay frase en los dos idiomas: «Este aparato no pudo guardar la fotografía, así que
la boleta NO quedó en cola. Liberá espacio —o salí del modo privado— y volvé a capturarla.»

**Regresión:** `__checks__/colaForzadaYHuerfanas.check.mjs`, sección «las fotografías que no se
pudieron guardar» (7 afirmaciones).

### D2 · P0 · El reintento explícito no hacía nada, y no lo decía

**Archivos:** `citationQueue.ts:425-452` (`flushQueue`), `queries.ts` (`useCitationQueue`),
`pages/QueuePage.tsx:156`

**Reproducción:** con `navigator.onLine === false` y boletas pendientes, abrir la cola y pulsar
«Reintentar el envío».

**Qué pasaba, y por qué es P0:** `flushQueue` hacía `if (navigator.onLine === false) return;` sin
devolver nada, y el botón se deshabilitaba con `disabled={!online || ...}`. Las dos cosas con la
**misma señal**, que el propio navegador documenta como no confiable: `onLine` se queda pegado en
`false` al despertar de suspensión y con algunas VPN. Resultado: la cola congelada, el botón muerto,
el barrido automático rindiéndose cada veinte segundos y **ninguna forma de forzar el envío ni de
enterarse de por qué**. Un turno entero de boletas atrapado en un teléfono. `probeServer` —que
contesta exactamente esa pregunta y ya existe— vivía sólo en la Ayuda.

**Corrección:**

* `flushQueue(apiClient, tenantId, { forzado })` — un intento forzado **no** consulta `onLine`.
* devuelve `ResultadoEnvio`: `intentado` | `nada-pendiente` | `sin-red` | `en-curso`. Se llama
  `intentado` y no `enviado` a propósito: dice que se intentó, no que todo llegó.
* `retryAll` fuerza y devuelve el resultado; su tipo (`() => Promise<ResultadoEnvio>`) obliga a quien
  lo llame a recibirlo.
* el botón sólo se deshabilita si no hay nada que enviar, y la pantalla dibuja en qué terminó.
* **el barrido automático sigue respetando `onLine === false`**: ahí la señal es un atajo barato y
  equivocarse cuesta veinte segundos. Lo que no puede depender de ella es la decisión de una persona.

Si de verdad no hay red, el intento forzado falla y cada fila queda con `NETWORK_ERROR` y su
mensaje. Eso es información; un botón muerto no lo es.

**Regresión:** `colaForzadaYHuerfanas.check.mjs`, secciones «el reintento que pide una persona», «la
pantalla cuenta qué pasó» y «la compuerta, caso por caso» (20 afirmaciones, incluida la transcripción
de la compuerta con sus seis casos).

### D3 · P1 · Dos capturas del mismo hecho: aviso, no bloqueo

**Archivos nuevos:** `lib/posibleDuplicado.ts`, `__checks__/posibleDuplicado.check.mjs`
**Integrado en:** `pages/NewCitationPage.tsx:201`

`deviceCitationId` protege el reenvío; `Idempotency-Key` protege la petición. Ninguno ve **dos
capturas distintas del mismo hecho** —el fiscalizador vuelve a la pantalla porque duda de haber
guardado, o dos personas marcan el mismo carro—, porque cada captura nace con identificadores
propios.

Siguiendo el punto 4 de la orden —*no inventar reglas que puedan bloquear multas legítimas*— esto
**avisa y no bloquea**: el mismo carro puede infringir dos veces en media hora, y eso es justo lo que
una zona de rotación castiga. El costo de equivocarse bloqueando es peor que una boleta repetida, que
la municipalidad puede anular.

**La regla, documentada:** se avisa cuando hay en **este aparato** una captura de la misma placa
(normalizada como el contrato: mayúsculas, sin espacios ni guiones) que esté **todavía pendiente**
—sin importar su edad— o que se haya **enviado en los últimos 30 minutos**. Si además coincide la
bahía, se dice. El dato sale de la cola local y no del servidor: un aviso que sólo apareciera con
cobertura no serviría justo cuando más hace falta. Por eso la frase dice «en ESTE aparato»: lo que
capturó otro teléfono no se ve desde acá, y prometer lo contrario sería una garantía falsa.

**Regresión:** `posibleDuplicado.check.mjs` — 19 afirmaciones, la mitad dedicada a *cuándo NO avisa*,
que es la mitad que protege las multas legítimas.

### D4 · P2 · El aviso de poco espacio llegaba cuando la foto ya se había perdido

**Archivo:** `pages/NewCitationPage.tsx:176-200`

`estimarAlmacenamiento()` estaba escrita, comentada y **sin usar**. El aparato sólo avisaba cuando la
escritura ya había fallado. Ahora se mira una vez al abrir la pantalla de captura —no en cada tecla:
la estimación cuesta y no cambia entre dos pulsaciones— y se avisa si lo que queda no alcanza para
una boleta completa (`MAX_PHOTOS_PER_CITATION × MAX_EVIDENCE_BYTES`). No bloquea.

`null` no es cero: Safari no publica la cuota en varias versiones, y «no sé cuánto queda» no es una
alarma. Sin número, no se dice nada.

### D5 · P3 · `HomePage.tsx` es código muerto — documentado, no borrado

`frontend/apps/inspector/src/pages/HomePage.tsx` (102 líneas) no está ruteado y nadie la importa.
**No la borré**: la orden autoriza «limpieza segura» y la lectura conservadora de *segura*, con otra
sesión confirmando commits en el mismo árbol, es dejar constancia en vez de borrar archivos ajenos a
los defectos. Recomendación concreta: borrarla en un commit propio titulado como lo que es, para que
`git` conserve la decisión.

### D6 · El script de diagnóstico de la propia orden no diagnosticaba nada

`scripts/inspector-checks.sh`, tres defectos medidos:

1. `require('frontend/package.json')` es un especificador de **módulo** para Node, no una ruta.
   Fallaba con `MODULE_NOT_FOUND`, de modo que el script no imprimía ningún script npm **y** la
   comprobación que decide si correr `typecheck`/`lint`/`test` devolvía siempre «no existe»: el
   diagnóstico terminaba sin haber ejecutado ninguno.
2. El bucle de arneses hacía `cd "$FRONTEND"` y después pasaba una ruta que ya empezaba por
   `frontend/`: buscaba `frontend/frontend/tests/...`. **Los 36 arneses fallaban con
   `MODULE_NOT_FOUND`** — 36 fallos falsos, ninguno sobre el código.
3. Los arneses son de navegador y necesitan `MOCKS=1` y un Chromium de Playwright; sin eso apuntan a
   staging y se detienen por falta de contraseña. Correrlos por omisión producía una pared roja que
   no dice nada, así que ahora son opt-in (`ARNESES=1`).

---

## 4. Archivos tocados

| Archivo | Qué |
|---|---|
| `frontend/apps/inspector/src/lib/citationQueue.ts` | D1 y D2 |
| `frontend/apps/inspector/src/lib/queries.ts` | D2: `enviar(forzado)`, `retryAll` devuelve resultado |
| `frontend/apps/inspector/src/pages/QueuePage.tsx` | D2: botón y aviso del resultado |
| `frontend/apps/inspector/src/pages/NewCitationPage.tsx` | D3 y D4 |
| `frontend/apps/inspector/src/lib/apiErrors.ts` | D1: códigos propios con frase |
| `frontend/packages/i18n/src/locales/{es-CR,en-US}.ts` | 11 claves nuevas por idioma |
| `frontend/apps/inspector/src/lib/posibleDuplicado.ts` | **nuevo** · D3 |
| `frontend/apps/inspector/src/lib/__checks__/posibleDuplicado.check.mjs` | **nuevo** · 19 afirmaciones |
| `frontend/apps/inspector/src/lib/__checks__/colaForzadaYHuerfanas.check.mjs` | **nuevo** · 27 afirmaciones |
| `backend/tools/integracion-inspector/integracion-inspector.sh` | **nuevo** · nivel 3 |
| `scripts/inspector-checks.sh` | **nuevo** (venía en el ZIP) · D6 |
| `docs/inspector/*` | **nuevo** · estos dos documentos |

Sin cambios en el backend: ningún defecto del Inspector lo exigió.

---

## 5. Pruebas ejecutadas — comando y resultado

| Comando | Resultado |
|---|---|
| `npm run typecheck` | **rc=0** |
| `npm run lint` | **rc=0** |
| `npm run checks` | **20 archivos · 740 afirmaciones · 0 fallos** (rc=0) |
| `node .../posibleDuplicado.check.mjs` | **19 · 0 fallos** |
| `node .../colaForzadaYHuerfanas.check.mjs` | **27 · 0 fallos** |
| `MOCKS=1 node tests/responsive/fiscalizacion-boleta-1a.cjs` | **57 ok · 0 fallos** · «✓ Fase 1A verde» |
| `MOCKS=1 node tests/responsive/inspector-resumen-turno.cjs` | **46 · 0 fallos** |
| `javac -parameters … @fuentes.txt` (461 archivos, JDK 21) | **0 errores** |
| arranque de la aplicación · Flyway | **43 migraciones aplicadas por el propio arranque**, Tomcat en :8095 |
| `bash backend/tools/integracion-inspector/integracion-inspector.sh` | **48 comprobaciones · 0 fallos** |
| `git diff --check` | **rc=0** |

**Navegador:** Chromium 1194 (Playwright 1.49.1), transporte simulado servido por HTTP.
**Viewports:** 320×568, 390×844, 430×932, 768×1024, 1024×768, 1280×800 / 1366×768, 1536×960,
1920×1080.
**Entorno nivel 3:** PostgreSQL 16.15 + PostGIS 3.4, JDK 21, backend con `SPRING_PROFILES_ACTIVE=dev`.

### Dos expectativas mías que estaban equivocadas, y lo que enseñaron

Las anoto porque el valor está en la corrección, no en el verde:

1. La integración afirmaba que una boleta recién capturada queda en `DRAFT` y hay que emitirla. Falso
   para un tipo de infracción que **no** exige fotografía: la captura ya sale `ISSUED`. La prueba
   ahora ejercita **los dos** caminos y afirma cada uno.
2. La integración mandaba una consulta con `zoneId` y sin `spaceCode` y esperaba 200. El servidor
   contesta **422 nombrando `spaceCode`**: «Send the zone and the bay code together to identify a
   bay.» Es correcto —media consulta no identifica una bahía— y ahora está fijado como afirmación.

---

## 6. Lo que NO hice, y por qué

**Filtros en Mis boletas (P2).** Confirmado que no existen, y no los implementé. Exigen parámetros
nuevos en el extremo del servidor más el control en pantalla, y es una **carencia**, no un defecto:
la pantalla ya cubre carga, error con reintento, vacío, lista y paginación. Preferí gastar la sesión
en los dos P0 de pérdida de datos. Propuesta concreta para la próxima: `status` y `from`/`to` en
`GET /inspector/citations` —reutilizando `CitationService.search`, que ya los acepta— y dos controles
en la cabecera de la lista; el tope de ventana del resumen de turno (31 días) es el precedente de
cómo acotarlo.

**`probeServer` en la compuerta automática.** Sería la corrección completa del punto 7: decidir con
una señal que de verdad mide alcance en vez de con `navigator.onLine`. No lo hice porque cambia la
cadencia de red de la aplicación —una petición extra cada barrido— y eso es una decisión de alto
impacto, no una corrección ordinaria. Lo que sí quité es el daño: la persona ya puede forzar el
envío. **Propuesta:** sondear sólo cuando `onLine === false` y haya filas pendientes, con un intervalo
propio (p. ej. 2 min) distinto del barrido de 20 s.

**Borrar `HomePage.tsx`.** Explicado en D5.

---

## 7. Riesgos y bloqueos

| | |
|---|---|
| **Otra sesión en el mismo árbol** | Dos commits aparecieron mientras trabajaba. Mis cambios siguen sin confirmar y son separables, pero un `git add -A` ajeno los barrería. **Confirmarlos por separado.** |
| **Cinco de los siete arneses del Inspector no tienen modo simulado** | `fiscalizacion-nav`, `-perfil-y-ayuda`, `-permisos-dispositivo`, `-visual` y `campana-fiscalizacion` sólo apuntan a `staging.luparx.com` y exigen contraseña. **No se pudieron ejecutar**: no tengo credenciales y no las adiviné. Sólo `fiscalizacion-boleta-1a` e `inspector-resumen-turno` corren en local. |
| **Cola sin conexión: nivel 3 pendiente** | Lo corregido está fijado por 27 afirmaciones estáticas y por la transcripción de la compuerta, pero **nadie ha visto la cola vaciarse contra el backend real desde un navegador que perdió y recuperó la red**. Falta un arnés que corra el portal apuntado a `:8095` y alterne la red. |
| **Safari / iPadOS / aparato físico** | No alcanzables desde este entorno. El desalojo de almacenamiento de Safari —la causa de D1 y D4— no se puede provocar aquí. |
| **Maven** | `repo.maven.apache.org` devuelve 403 en el proxy de egreso: las pruebas JUnit del backend no se ejecutaron. El backend **compila entero** (461 archivos) y arranca. |
| **Fotografía de evidencia** | La integración sube un PNG de 1×1. Que una fotografía de teléfono de varios MB pase por la reducción del cliente y el límite del servidor **no** se probó aquí. |
