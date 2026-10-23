import { defineConfig } from 'vite';
import { createRequire } from 'node:module';
import { infoDeCompilacion } from '../../build/infoDeCompilacion.mjs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const require = createRequire(import.meta.url);
const paquete = require('./package.json') as { version: string };

/*
  Qué compilación es ésta: versión, commit, entorno e instante del build. Entra al compilar —Vite
  lo resuelve a literales— y alimenta el sello que se dibuja al pie de cada vista. En producción el
  sello no se dibuja, y eso lo decide `packages/ui/src/selloDeCompilacion.ts`, no esto: acá los
  valores se declaran siempre, porque un «Acerca de» puede querer el commit aunque no haya sello.
*/
const INFO = infoDeCompilacion(paquete.version);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: INFO,
  // Ver apps/citizen/vite.config.ts: el prefijo lo decide el build.
  base: process.env.VITE_BASE_PATH ?? '/',
  server: {
    port: 5186,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
