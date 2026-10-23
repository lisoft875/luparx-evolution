# LuParX Inspector — Matriz de pruebas Fase 3

**Fecha:** 22-10-2026
**Rama:** `main`
**Commit base:** `882e7c0` al empezar · `e35cdff` al terminar (dos commits ajenos entraron durante la sesión)
**Entorno:** PostgreSQL 16.15 + PostGIS 3.4 · JDK 21 · backend propio con `SPRING_PROFILES_ACTIVE=dev` en `:8095` · Chromium 1194 (Playwright 1.49.1) · ocho viewports de 320×568 a 1920×1080

**Qué significa cada nivel, para que la tabla no prometa de más:**

* **Nivel 1 — estático/UI.** Comprobaciones de `node` sobre el código y arneses de navegador contra el transporte simulado.
* **Nivel 2 — contrato.** Los campos, códigos y estados que el cliente espera, verificados contra el simulador servido por HTTP, que es el mismo módulo que usa la aplicación.
* **Nivel 3 — integración real.** HTTP contra el backend de Spring Boot corriendo sobre PostgreSQL con las 43 migraciones de Flyway aplicadas por el propio arranque. **Sin simulador en ningún punto.**

---

| Pantalla/operación | Nivel 1 estático/UI | Nivel 2 contrato | Nivel 3 integración real | Resultado | Evidencia |
|---|---|---|---|---|---|
| Login / municipalidad | ✅ `fiscalizacion-boleta-1a` entra por la interfaz | ✅ credencial con inquilino | ✅ login 200 + `session/tenant` 200 | **ACEPTADA** | integración §1 (4 afirmaciones) |
| Consulta placa: FIX | ✅ | ✅ veredicto + `checkId` | ✅ 200 con coordenadas; **sólo FIX las guarda** | **ACEPTADA** | integración §3 |
| Consulta placa: NO_FIX | ✅ | ✅ | ✅ 200, estado anotado distinto | **ACEPTADA** | integración §3 |
| Consulta placa: NOT_GRANTED | ✅ | ✅ | ✅ 200, estado anotado distinto | **ACEPTADA** | integración §3 (`FIX,NOT_GRANTED,NO_FIX` en `enforcement_checks`) |
| Zonas / tipos / `ZONE_NOT_ASSIGNED` | ✅ | ✅ | ✅ 8 zonas, 5 tipos; **403 `ZONE_NOT_ASSIGNED`** y el rechazo queda en la bitácora; la zona propia sigue contestando | **ACEPTADA** | integración §2 y §4 (8 afirmaciones) |
| Emisión / idempotencia | ✅ 27 afirmaciones de la cola | ✅ | ✅ **201** la primera · **200** el mismo `deviceCitationId` con otra clave · misma clave no crea nada · **1 sola fila tras tres envíos** | **ACEPTADA** | integración §5 |
| Foto / descarga evidencia | ✅ | ✅ | ✅ subida 200, bajada 200, **mismo tamaño de bytes**; un tipo que exige foto queda `DRAFT` y se emite después | **ACEPTADA** *(con reserva: sólo se probó un PNG de 1×1)* | integración §6 y §7 |
| Mis boletas / paginación / detalle | ✅ carga, error con reintento, vacío, lista | ✅ `totalElements` | ✅ lista 200 con la boleta, detalle 200 con su número y su evidencia | **ACEPTADA sin filtros** — la carencia está en §6 del diagnóstico, con propuesta | integración §8 |
| Resumen de turno | ✅ `inspector-resumen-turno` 46 · 0 fallos | ✅ los cuatro campos | ✅ cuenta 10 consultas y 6 boletas del día; ventana invertida **422**, no ceros | **ACEPTADA** | integración §9 + arnés |
| Cola offline / reconexión / reintento | ✅ 27 afirmaciones, incluida la compuerta transcrita con sus 6 casos | ✅ los cuatro resultados de envío tienen frase | ❌ **BLOQUEADO — nivel 3 pendiente** | **PARCIAL** | `colaForzadaYHuerfanas.check.mjs`; falta un arnés que apunte al backend real y alterne la red |
| Almacenamiento / Safari | ✅ aviso de escritura fallida y aviso proactivo de poco espacio | n/a | ❌ **BLOQUEADO — nivel 3 pendiente** | **PARCIAL** | el desalojo de Safari en iPadOS no se puede provocar en este entorno |

**Ninguna aceptación global.** Nueve pantallas quedan aceptadas, dos parciales. Las dos parciales son
precisamente las que dependen del aparato, y ninguna de las correcciones de esta sesión las deja peor
que antes: las dos mejoran con evidencia de nivel 1/2 y les falta el aparato.

---

## Defectos

| ID | Severidad | Archivo:línea | Reproducción | Corrección | Prueba de regresión |
|---|---|---|---|---|---|
| D1 | **P0** | `lib/citationQueue.ts:261-293` | capturar con 2+ fotos y que `putPhoto` falle en la segunda (IndexedDB llena, ventana privada) | se borran las claves ya escritas, se enciende el aviso de almacenamiento y se lanza `EVIDENCE_STORE_FAILED` con frase propia | `colaForzadaYHuerfanas.check.mjs` §«las fotografías que no se pudieron guardar» (7) |
| D2 | **P0** | `lib/citationQueue.ts:425-452`, `lib/queries.ts`, `pages/QueuePage.tsx:156` | con `navigator.onLine === false` y boletas pendientes, pulsar «Reintentar el envío» | `flushQueue({forzado})` no consulta `onLine`; devuelve `ResultadoEnvio`; el botón ya no se apaga por falta de red; la pantalla dice en qué terminó | ídem §«el reintento que pide una persona», §«la pantalla cuenta qué pasó», §«la compuerta, caso por caso» (20) |
| D3 | **P1** | `lib/posibleDuplicado.ts` (nuevo), `pages/NewCitationPage.tsx:201` | capturar dos veces la misma placa en pocos minutos | aviso **no bloqueante** desde la cola local, con la regla documentada (pendiente de cualquier edad; enviada, 30 min; la bahía refina) | `posibleDuplicado.check.mjs` (19, la mitad sobre cuándo **no** avisar) |
| D4 | **P2** | `pages/NewCitationPage.tsx:176-200` | abrir la captura con menos de una boleta de espacio libre | se llama a `estimarAlmacenamiento()` —que existía sin usar— y se avisa antes de capturar; `null` no se trata como cero | cubierto por tipos y por el aviso en pantalla; sin check propio |
| D5 | **P3** | `pages/HomePage.tsx` (102 líneas) | — | **no corregido a propósito**: documentado como código muerto en vez de borrado, con otra sesión confirmando commits en el mismo árbol | — |
| D6 | **P2** | `scripts/inspector-checks.sh` | `bash scripts/inspector-checks.sh` | tres defectos del propio script de diagnóstico: `require` de una ruta como módulo, `frontend/` duplicado en el bucle de arneses (36 fallos falsos) y arneses de navegador corriendo sin `MOCKS` | el script ya ejecuta typecheck y lint de verdad e informa por qué no corre los arneses |

---

## Bloqueos externos

* **Credenciales de staging.** Cinco de los siete arneses del Inspector (`fiscalizacion-nav`,
  `fiscalizacion-perfil-y-ayuda`, `fiscalizacion-permisos-dispositivo`, `fiscalizacion-visual`,
  `campana-fiscalizacion`) no tienen modo simulado: sólo apuntan a `staging.luparx.com` con
  contraseña. **BLOQUEADO — nivel 3 pendiente** para lo que esos cinco cubren. Requisito exacto: la
  contraseña del fiscalizador de staging, o un modo `MOCKS=1` en cada arnés.
* **Maven Central.** `repo.maven.apache.org:443` → 403 en el proxy de egreso. Las pruebas JUnit del
  backend no se ejecutaron. Requisito: `./mvnw test` en la Mac.
* **Aparato físico / Safari / iPadOS.** No alcanzables. Requisito: un iPad con la aplicación
  instalada para provocar el desalojo de almacenamiento que motiva D1 y D4.
* **Docker.** No hay Docker en este entorno; el backend se levantó compilando las fuentes contra las
  dependencias del jar ya construido y arrancándolo contra una PostgreSQL local. No fue un bloqueo.

---

## Archivos modificados

```
 M frontend/apps/inspector/src/lib/apiErrors.ts
 M frontend/apps/inspector/src/lib/citationQueue.ts
 M frontend/apps/inspector/src/lib/queries.ts
 M frontend/apps/inspector/src/pages/NewCitationPage.tsx
 M frontend/apps/inspector/src/pages/QueuePage.tsx
 M frontend/packages/i18n/src/locales/en-US.ts
 M frontend/packages/i18n/src/locales/es-CR.ts
?? frontend/apps/inspector/src/lib/posibleDuplicado.ts
?? frontend/apps/inspector/src/lib/__checks__/posibleDuplicado.check.mjs
?? frontend/apps/inspector/src/lib/__checks__/colaForzadaYHuerfanas.check.mjs
?? backend/tools/integracion-inspector/integracion-inspector.sh
?? scripts/inspector-checks.sh
?? docs/inspector/
```

Intactos: el vehículo del ciudadano y la prueba de la billetera con Testcontainers
(`backend/app/pom.xml`, `WalletChargeIntegrationTest.java`, `WalletService.java`).

---

## Comandos y resultados

```
git branch --show-current                      → main
git status --porcelain (inicio)                → 12 M · 3 ??
git diff --check (inicio y fin)                → exit 0
bash scripts/inspector-checks.sh               → corregido; typecheck y lint reales
npm run typecheck                              → rc=0
npm run lint                                   → rc=0
npm run checks                                 → 20 archivos · 740 afirmaciones · 0 fallos
node …/posibleDuplicado.check.mjs              → 19 · 0 fallos
node …/colaForzadaYHuerfanas.check.mjs         → 27 · 0 fallos
MOCKS=1 node …/fiscalizacion-boleta-1a.cjs     → 57 ok · 0 fallos · «✓ Fase 1A verde»
MOCKS=1 node …/inspector-resumen-turno.cjs     → 46 · 0 fallos
javac -parameters … (461 archivos, JDK 21)     → 0 errores
arranque + Flyway                              → 43 migraciones aplicadas; Tomcat en :8095
bash …/integracion-inspector.sh                → 48 comprobaciones · 0 fallos
git status --porcelain (fin)                   → 10 M · 7 ??
```
