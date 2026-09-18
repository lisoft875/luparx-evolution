# Inventario de estilos inline — qué migrar y en qué orden

Medido el 2026-09-18 sobre `apps/` y `packages/`. Base: **382 estilos inline**.

Este archivo existe para que la migración se haga por frecuencia y no por archivo: cada patrón de
abajo se repite, y cada repetición es una copia donde un defecto hay que arreglar por separado —
como ya pasó dos veces con la cabecera de shell y el grid zona/bahía.

## Los patrones que más se repiten

| Veces | Patrón inline | Equivalente Tailwind |
|---|---|---|
| 61 | `margin: 0` | `m-0` |
| **39** | `display:flex; flexDirection:column; gap:var(--lx-space-N)` | `flex flex-col gap-N` |
| 16 | `minWidth: N` | `min-w-*` |
| 16 | `fontVariantNumeric: 'tabular-nums'` | `tabular-nums` |
| 13 | `width: N` | `w-*` |
| 13 | `marginTop: var(--lx-space-N)` | `mt-N` |
| 18 | fila flex con `flexWrap:'wrap'` | `flex flex-wrap gap-N` |

Desglose de la columna flex (39 casos), que es el patrón dominante:

- 20 × `gap: var(--lx-space-3)` → `flex flex-col gap-3`
- 14 × `gap: var(--lx-space-4)` → `flex flex-col gap-4`
- 5 × `gap: var(--lx-space-2)` → `flex flex-col gap-2`

## El hallazgo que justifica la migración

La fila con wrap usa **`gap: 6`** en 5 lugares. **6px no existe en la escalera de LupaRX**
(`--lx-space-1` es 4px, `--lx-space-2` es 8px): es un valor inventado a mano que ningún token
respalda, y que nadie va a encontrar nunca revisando `tokens.css`.

Lo mismo con `gap: 8` (4 casos) y `gap: 12` (1 caso), que sí corresponden a tokens
(`--lx-space-2` y `--lx-space-3`) pero están escritos como números crudos: invisibles a cualquier
cambio de la escalera.

**Ese es exactamente el problema que Tailwind vuelve imposible**: `gap-1.5` no se escribe por
accidente, y `gap-2` siempre es el token.

## Orden recomendado de migración

1. **`flex flex-col gap-N`** (39 casos) — el patrón dominante, mecánico y de bajo riesgo.
2. **`m-0` / `mt-N`** (85 casos entre los tres) — trivial, y limpia mucho ruido.
3. **`tabular-nums`** (16) — una clase, cero decisiones.
4. **Las filas con wrap** (18) — acá hay que decidir qué pasa con los `gap: 6`: o se redondean al
   token más cercano (`gap-2` = 8px) o se agrega un `--lx-space-1-5` a la escalera. **Requiere
   decisión de diseño, no es mecánico.**
5. El resto, caso por caso.

Después de cada tanda: `node tests/visual/snapshot.cjs`. Los pasos 1–3 deberían dar **0 cambiaron**;
el paso 4 va a cambiar píxeles a propósito (2px por gap) y hay que aprobarlo a ojo.
