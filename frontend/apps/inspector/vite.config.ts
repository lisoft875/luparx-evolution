import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const paquete = require('./package.json') as { version: string };

/**
 * Qué compilación es ésta.
 *
 * <p>El §6 del encargo del Centro de soporte pide mostrar «versión, entorno y build reales, sin
 * inventar datos». El dato de verdad existe en el servidor —`/actuator/info` contesta
 * `LUPARX_ENVIRONMENT`— pero nginx NO enruta `/actuator` a propósito, y la razón escrita en
 * `infra/nginx/luparx.conf` es buena: métricas y esquema de la API son reconocimiento gratis para
 * quien busque por dónde entrar. Abrir esa puerta para pintar un renglón de «Acerca de» sería un
 * mal negocio.</p>
 *
 * <p>Así que el dato entra al compilar. `LUPARX_BUILD` lo pone `scripts/deploy.sh`, que ya exporta
 * el hash corto del commit como `LUPARX_VERSION` antes de construir; `LUPARX_ENVIRONMENT` ya vive
 * en `infra/.env` para el backend. Cuando no vienen —un `npm run dev`, un build de alguien en su
 * máquina— valen `null`, y la pantalla dice que no están disponibles en esta compilación en vez de
 * inventar un número.</p>
 */
const INFO = {
  __LUPARX_VERSION__: JSON.stringify(paquete.version),
  __LUPARX_BUILD__: JSON.stringify(process.env.LUPARX_BUILD ?? null),
  __LUPARX_ENV__: JSON.stringify(process.env.LUPARX_ENVIRONMENT ?? null),
  // Siempre real: es el momento en que corrió este build.
  __LUPARX_BUILT_AT__: JSON.stringify(new Date().toISOString()),
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Ver apps/citizen/vite.config.ts: el prefijo lo decide el build.
  base: process.env.VITE_BASE_PATH ?? '/',
  define: INFO,
  server: {
    port: 5185,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
