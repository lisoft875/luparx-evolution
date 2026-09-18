# Migración a Tailwind v4 — pasos que corre Javier

Claude no puede correr `npm install` desde el bridge: su VM es **linux/arm64** y tu `node_modules`
vive dentro de la carpeta montada, así que instalar desde ahí te reemplaza los binarios nativos de
macOS (`@rollup/rollup-darwin-arm64`, `@esbuild/darwin-arm64`) por los de Linux y te rompe
`npm run build` en tu terminal. Tailwind v4 trae `@tailwindcss/oxide`, que es nativo, así que el
problema aplica igual.

## Antes de capturar: que no haya una estadía activa

Una estadía en curso pone una cuenta regresiva en la barra superior de **todas** las pantallas del
ciudadano. El script ya oculta ese reloj (`.lx-sticky-timer-bar__more`), pero el resto de la barra
—placa, zona, espacio— sí sale en la captura, así que la referencia queda tomada "con estadía" y la
comparación posterior sólo es válida si el estado es el mismo.

Lo simple: **capturar y comparar con el mismo estado**. Si entre una cosa y la otra la estadía vence
(duran 30 minutos), las pantallas del ciudadano van a reportar diferencias que no son culpa de la
migración. Si eso pasa, volver a capturar la referencia.

## Paso 1 — capturas de referencia (ANTES de instalar nada)

Esto es la red de seguridad: sin estas capturas, "no rompí nada" es una opinión.

```bash
cd ~/Development/Proyectos/luparx-evolution/frontend
node tests/visual/snapshot.cjs --base
```

Deja ~40 PNG en `tests/visual/referencia/`. Tarda unos minutos: entra a los cuatro portales en
móvil y escritorio.

**No sigas al paso 2 hasta que esto termine.**

## Paso 2 — instalar Tailwind

```bash
cd ~/Development/Proyectos/luparx-evolution/frontend
npm install -D tailwindcss@4 @tailwindcss/vite@4
```

## Paso 3 — activar el plugin en los cuatro vite.config.ts

En `apps/{citizen,admin,inspector,platform}/vite.config.ts`, agregar el import y el plugin:

```ts
import tailwindcss from '@tailwindcss/vite';
// ...
plugins: [react(), tailwindcss()],
```

## Paso 4 — cambiar el import del CSS en los cuatro main.tsx

```diff
-import '@luparx/ui/tokens.css';
+import '@luparx/ui/tailwind.css';
```

`tailwind.css` ya importa `tokens.css` adentro, así que no se pierde nada: las 243 clases `lx-*`
siguen funcionando igual mientras dure la convivencia.

## Paso 5 — comprobar que no cambió nada

```bash
npm run typecheck && npm run build
node tests/visual/snapshot.cjs
```

El último compara contra la referencia del paso 1. **En este punto debería decir `0 cambiaron`**:
todavía no se migró ninguna pantalla, solo se agregó Tailwind al build. Si algo cambió acá, el
problema es la instalación y no la migración — avisá antes de seguir.

## Después

Con el arnés verde, Claude migra pantalla por pantalla empezando por el portal **inspector** (el más
chico: 5 pantallas), y cada tanda se comprueba con `node tests/visual/snapshot.cjs`.
