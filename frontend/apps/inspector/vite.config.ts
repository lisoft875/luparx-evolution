import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createRequire } from 'node:module';
import { infoDeCompilacion } from '../../build/infoDeCompilacion.mjs';

const require = createRequire(import.meta.url);
const paquete = require('./package.json') as { version: string };

/*
  Qué compilación es ésta. El bloque entero vive en `build/infoDeCompilacion.mjs` desde el
  23-10-2026: lo necesitan los cuatro portales —el sello al pie de cada vista— y cuatro copias es
  cómo acaban mostrando cosas distintas. La explicación larga está allá.
*/
const INFO = infoDeCompilacion(paquete.version);

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
