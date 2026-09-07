# LupaRX — Sistema de diseño (v0.1)

Referencias visuales aportadas por el producto:

- `docs/brand/luparx-logo.png` — logotipo (monograma LK + wordmark LUPARX + tagline "Estacionamiento inteligente").
- `docs/brand/citizen-app-reference-screens.png` — 8 pantallas de referencia de la app **Ciudadano**:
  1. Inicio (sin sesión activa) · 2. Inicio (con sesión activa) · 3. Estacionamiento (flujo en 4 pasos) ·
  4. Vehículos · 5. Multas · 6. Billetera · 7. Pagos / Historial · 8. Perfil.

Estos lineamientos son la fuente de verdad visual. Los tokens viven en `frontend/packages/ui/src/tokens.css`
y **ningún componente define colores literales**: siempre `var(--lx-*)`.

## 1. Identidad

- **Tema base: oscuro.** El tema claro existe como variante secundaria (`[data-theme="light"]`), no como default.
- Fondo profundo azul-negro, tarjetas elevadas con borde sutil, acento azul eléctrico con glow.
- Tipografía: sistema (SF Pro / Roboto / Inter fallback). Números tabulares en montos y contadores
  (`font-variant-numeric: tabular-nums`) para que el temporizador no "baile".

## 2. Tokens

### Color (tema oscuro, default)

| Token | Valor | Uso |
|---|---|---|
| `--lx-bg` | `#070C18` | Fondo de app |
| `--lx-bg-elevated` | `#0E1526` | Sheets, barra inferior |
| `--lx-surface` | `#121A2E` | Tarjeta |
| `--lx-surface-2` | `#18213A` | Tarjeta anidada / fila |
| `--lx-border` | `rgba(255,255,255,.08)` | Bordes de tarjeta |
| `--lx-text` | `#F5F8FF` | Texto primario |
| `--lx-text-muted` | `#9AA8C7` | Texto secundario |
| `--lx-text-subtle` | `#67769A` | Etiquetas, metadatos |
| `--lx-primary` | `#1D7BFF` | Acción principal, tab activo |
| `--lx-primary-strong` | `#0A4DFF` | Fin del degradado |
| `--lx-primary-soft` | `rgba(29,123,255,.14)` | Fondo de chip/badge activo |
| `--lx-success` | `#22C55E` | Sesión activa, verificado |
| `--lx-success-soft` | `rgba(34,197,94,.12)` | Fondo de tarjeta de sesión activa |
| `--lx-warning` | `#F5A524` | Por vencer |
| `--lx-danger` | `#F04438` | Multas, montos de cargo, errores |
| `--lx-info` | `#38BDF8` | Informativo |

- **Degradado primario**: `linear-gradient(135deg, var(--lx-primary), var(--lx-primary-strong))`.
- **Glow primario**: `box-shadow: 0 8px 24px rgba(29,123,255,.35)` — sólo en la acción principal de la
  pantalla (una por vista, como "Estacionar ahora" o "Iniciar estacionamiento").
- Semántica de montos: cargos en `--lx-danger` (`₡400`), recargas/ingresos en `--lx-success` (`₡10.000`).
  Nunca comunicar estado sólo por color: siempre icono o texto acompañante (accesibilidad).

### Forma y espacio

| Token | Valor |
|---|---|
| `--lx-radius-sm` | `10px` (chips, campos) |
| `--lx-radius-md` | `16px` (tarjetas internas, botones) |
| `--lx-radius-lg` | `20px` (tarjetas principales) |
| `--lx-radius-pill` | `999px` (tabs de filtro, badges) |
| Escala de espacio | `4 · 8 · 12 · 16 · 20 · 24 · 32` |
| Padding de tarjeta | `16px` móvil |
| Separación entre tarjetas | `12px` |

### Elevación

`--lx-shadow-card: 0 1px 0 rgba(255,255,255,.04) inset, 0 8px 24px rgba(0,0,0,.35)`.
Sin sombras duras; la jerarquía la da el color de superficie.

### Tipografía

| Rol | Tamaño / peso |
|---|---|
| Título de pantalla | 28 / 700 |
| Saludo ("Hola, Leana 👋") | 24 / 700 |
| Título de tarjeta | 17 / 600 |
| Cuerpo | 15 / 400 |
| Metadato | 13 / 400, `--lx-text-muted` |
| Monto grande (saldo) | 28 / 700, tabular |
| Temporizador | 34 / 700, tabular, `letter-spacing: .02em` |

## 3. Patrones de la app Ciudadano

- **App bar**: logo LupaRX a la izquierda, campana con contador de notificaciones a la derecha.
  En pantallas de detalle: flecha atrás + título + subtítulo opcional.
- **Barra inferior de 5 destinos**: Inicio · Estacionar · Vehículos · Billetera · Más.
  Icono + etiqueta siempre visibles; activo en `--lx-primary`; área táctil ≥ 44×44 px;
  respetar `env(safe-area-inset-bottom)`.
- **Tarjeta de sesión activa**: superficie `--lx-success-soft` con borde verde, placa, zona y espacio,
  temporizador grande, hora de vencimiento y acción "Extender tiempo". Cambia a `--lx-warning`
  cuando falten ≤ 10 min (umbral configurable por municipalidad).
- **Flujo de estacionamiento**: pasos numerados en la misma pantalla (1 Zona y espacio · 2 Vehículo ·
  3 Tiempo · 4 Resumen y pago), con chips de duración (30 min / 1 hora / 2 horas / Otro) y CTA fija abajo.
- **Estados vacíos**: icono circular, título positivo ("¡Todo en orden!") y frase de apoyo;
  siempre con la municipalidad activa nombrada ("en esta municipalidad").
- **Filtros**: chips tipo pill (Todos / Parqueo / Recargas / Multas), scroll horizontal, uno activo.
- **Listas de movimientos**: icono en cuadro redondeado, título, metadatos en segunda línea
  (fecha · zona · espacio) y monto alineado a la derecha con signo semántico.
- **Perfil**: filas con icono, etiqueta y valor secundario; badges de estado ("Verificado").

## 4. Reglas que no se negocian

1. **Nada de texto hardcodeado**: todo pasa por claves i18n. Las capturas están en español porque
   `es-CR` es el locale por defecto, no porque el idioma sea fijo.
2. **Nada de formato manual de moneda, fecha ni número**: `Intl.NumberFormat` / `Intl.DateTimeFormat`
   con el locale y la moneda del tenant. `₡` y `es-CR` son *defaults de configuración*, no constantes.
3. **Ningún componente escribe un color literal**: sólo tokens.
4. **Contraste mínimo AA** (4.5:1 texto normal, 3:1 texto grande e iconos significativos).
   El azul `--lx-primary` sobre `--lx-bg` cumple; texto blanco sobre `--lx-primary` también.
5. **Un solo CTA con glow por pantalla.**
6. **Marca**: el logo se usa como SVG monocromo + degradado del token; no se recolorea el monograma
   ni se estira. Assets fuente en `docs/brand/`.

### Política de presentación numérica (`packages/i18n/src/presentation.ts`)

El diseño pide `₡48.800` y `20:27`. ICU para `es-CR` produce `₡48 800,00` y `8:27 p. m.`, así que la
diferencia se resuelve con **configuración declarada**, nunca formateando a mano:

- `CURRENCY_DISPLAY`: dígitos decimales por moneda (CRC → 0; por defecto, el exponente ISO 4217).
  Sólo afecta la **presentación**; el almacenamiento sigue en unidades menores enteras.
- `LOCALE_NUMBER_SYMBOLS`: separadores de miles y decimal por locale (`es-CR` → `.` y `,`), aplicados
  sobre `Intl.NumberFormat(...).formatToParts()` reemplazando únicamente las partes `group` y `decimal`.
  El orden del símbolo de moneda y el resto del formato los sigue decidiendo ICU.
- `LOCALE_HOUR_CYCLE`: `es-CR` → `h23`.

Estas tablas son defaults de plataforma y están preparadas para sobreescribirse por tenant.

## 5. Aplicación por app

| App | Tema | Densidad | Notas |
|---|---|---|---|
| `citizen` | Oscuro (referencia adjunta) | Cómoda, móvil primero | Barra inferior de 5 destinos |
| `inspector` | Oscuro, mismo lenguaje | Alta legibilidad en exteriores: tamaños +1 paso, contraste reforzado, botones grandes con guantes | Modo offline visible en la app bar |
| `admin` (municipal) | Oscuro con densidad de escritorio | Tablas, filtros, paneles laterales | Ancho máximo 1440, navegación lateral |
| `platform` (back-office) | Oscuro, acento diferenciado (`--lx-primary` con matiz distinto) para que nadie confunda el entorno de plataforma con el municipal | Densa | Banner permanente con el tenant/entorno bajo administración |
