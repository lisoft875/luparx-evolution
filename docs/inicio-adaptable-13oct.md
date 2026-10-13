# Inicio de Administración · adaptable (13-10-2026)

Commit **`4819316`** · especificación «LuParX Administración | Inicio adaptable».

---

## 1. Inventario de archivos y estilos modificados

| Archivo | Qué cambia |
|---|---|
| `frontend/packages/ui/src/tokens.css` | Techo de ancho del tablero; fila inferior a tres columnas; escala propia para portátil pequeño (`@media (max-width: 1400px)`); dos cortes nuevos en los accesos rápidos; se borra `.lx-home-stack`. |
| `frontend/apps/admin/src/pages/HomePage.tsx` | Se desenvuelve la pila de la derecha: actividad, accesos y zonas pasan a ser tres hijos directos de la fila. |
| `frontend/tests/responsive/inicio-admin.cjs` | El arnés se corrige **con** la especificación: tres columnas, reparto 36/31/33, y una sección nueva que comprueba la tabla §3 completa en 1920, 1440 y 1366. |

Reglas concretas que se tocaron en `tokens.css`:

- `.lx-page-layout__content:has(> .lx-home)` → `max-width: 1560px` (venía de `none`).
- `.lx-home-grid--operation` → `minmax(0,36fr) minmax(0,31fr) minmax(0,33fr)` a partir de 1200; entre 1000 y 1199 sigue en dos columnas con el tercer bloque a lo ancho.
- Bloque nuevo `@media (max-width: 1400px)` acotado a `:root[data-portal='admin']`: barra, menú, KPI, glifo del KPI, acceso rápido y fila de gráficos.
- `@container (max-width: 410px)` → título del acceso en dos renglones; `@container (max-width: 300px)` → las cuatro baldosas en una columna.
- `.lx-home-stack` eliminada (ya no hay pila).

---

## 2. Causa del tamaño excesivo

Tres causas distintas, no una:

1. **A 1920 no había techo.** El 12-10 se quitó el tope de 1200px del área de contenido con una razón buena —un tablero no es un formulario— pero sin poner otro en su lugar. Resultado medido: 1672px de contenido y KPI de 399px de ancho para una palabra y un número.
2. **Había una sola escala por encima de 1200.** Un 1366×768 recibía exactamente las alturas calculadas para un monitor de 1080, que tiene 312px más de alto. Nada se adaptaba: barra 64, menú 248, KPI 105, gráficos 260, igual que en el escritorio grande.
3. **La fila inferior era una pila.** Actividad a la izquierda y dos tarjetas apiladas a la derecha sumaban 397px contra 241 de la actividad: 156px de desnivel y una composición que no es la de la referencia aprobada.

---

## 3. Medidas antes / después

| Elemento | 1920 antes → después | 1440 antes → después | 1366 antes → después |
|---|---|---|---|
| Ancho del contenido | 1672 → **1560** (centrado) | 1192 → 1192 | 1118 → **1138** |
| Encabezado fijo | 64 → 64 | 64 → 64 | 64 → **60** |
| Menú lateral | 248 → 248 | 248 → 248 | 248 → **228** |
| Separación entre cards | 12 → 12 | 12 → 12 | 12 → 12 |
| KPI (alto) | 104 → 104 | 104 → 104 | 105 → **100** |
| KPI (ancho) | 399 → **371** | 279 → 279 | 261 → **266** |
| Glifo del KPI | 20 → 20 | 20 → 20 | 20 → **18** |
| Gráficos (alto) | 260 → 260 | 260 → 260 | 260 → **228** |
| Relleno de cards | 14 → 14 | 14 → 14 | 14 → 14 |
| Acceso rápido (alto) | 53 → 53 | 53 → **66** | 53 → **51** |
| Fila inferior | 2 col · 923/697 → **3 col · 539/464/494** | 2 col · 650/490 → **3 col · 406/350/372** | 2 col · 608/458 → **3 col · 387/333/354** |
| Desnivel de la fila inferior | 156 → sin pila | 156 → sin pila | 156 → sin pila |
| Alto del documento | 1117 → **1080** (sin scroll) | 1145 → **989** | 1146 → **949** |

Rangos de la tabla §3, comprobados contra la columna que toca:

| Elemento | 1920 / 1440 | Rango grande/mediano | 1366 | Rango portátil pequeño |
|---|---|---|---|---|
| Encabezado fijo | 64 | 60-68 ✔ | 60 | 56-64 ✔ |
| Sidebar | 248 | 230-250 ✔ | 228 | 210-235 ✔ |
| Separación entre cards | 12 | 12-16 ✔ | 12 | 10-12 ✔ |
| KPI (alto) | 104 | 100-112 ✔ | 100 | 88-102 ✔ |
| Íconos KPI | 20 en caja de 36 | 18-20 ✔ | 18 en caja de 36 | 18 ✔ |
| Gráficos | 260 | 240-275 ✔ | 228 | 205-235 ✔ |
| Relleno de cards | 14 | 14-18 ✔ | 14 | 12-14 ✔ |
| Acceso rápido | 53 / 66 | 46-54 ✔ / **desviación** | 51 | 42-50 **+1** |

---

## 4. Desviaciones, con su razón

- **Acceso rápido de 66px a 1440 y 1536.** A esos anchos la cuadrícula de accesos mide 322 y 351; un título en un solo renglón necesita 404 porque «Registrar espacio» pide 109px de texto. Las dos salidas posibles eran dos renglones o un título recortado. La referencia aprobada de la página 1 dibuja **dos renglones**, y el §3 dice que sus rangos son «de partida, no restricciones rígidas: nunca cortar números, etiquetas, barras ni controles para cumplir un número».
- **Acceso rápido de 51px a 1366**, uno por encima de 50: es el alto natural de dos renglones de 14px con su relleno. Bajar a 50 recortaría la segunda línea.
- **A 1920 queda holgura dentro de la tarjeta de ocupación** entre el nombre de la zona y su barra. El remedio que la especificación nombra para 1920 es el techo de ancho, que está puesto; estrechar además la lista sería rediseñar, y el §5 lo prohíbe. Queda señalado por si querés que se toque.

---

## 5. Pruebas

**Ejecutadas en la réplica local** (Chromium 1194, tokens reales del commit, monto real ₡135.000), ocho anchos: 1920×1080, 1536×960, 1440×900, 1366×768, 1280×800, 1152×720, 1100×700, 1024×768.

- Cuatro KPI en una fila desde 1100 en los ocho: ✔
- Ningún monto partido ni desbordado: ✔
- Ningún texto con puntos suspensivos (KPI, accesos, zonas, ranking, actividad): ✔
- Ningún texto de encabezado impreso encima de otro: ✔
- Sin scroll horizontal en ninguno de los ocho: ✔
- Tres columnas en la fila inferior a partir de 1200; dos columnas con el tercer bloque a lo ancho entre 1000 y 1199; apilado por debajo: ✔
- Todos los bloques presentes en los ocho: ocupación, ingresos, actividad, accesos, zonas, atención requerida y estado de los servicios: ✔

**Pendientes hasta que corras el despliegue**: el arnés Playwright contra staging (`inicio-admin.cjs`), que añade los estados de 0, 1 y muchos registros, el error del gráfico, los permisos y las rutas de los accesos, y deja las capturas de 1920, 1440 y 1366 en `tests/responsive/capturas/`.

**No ejecutable acá**: `vite build` en el equipo falla por un problema de entorno previo (`@rollup/rollup-linux-arm64-gnu` ausente en `node_modules`), ajeno a este cambio. El `tsc --noEmit` del portal administrativo pasa, y el build real lo hace Docker en staging.

---

## 6. Commit y versión

- Commit: **`4819316`**
- Base: `89fecaa` (corrección del 2×2)
- Despliegue: pendiente de tu comando; la versión desplegada queda impresa por `deploy.sh`.
