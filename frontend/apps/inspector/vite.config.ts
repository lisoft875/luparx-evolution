import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Ver apps/citizen/vite.config.ts: el prefijo lo decide el build.
  base: process.env.VITE_BASE_PATH ?? '/',
  server: {
    port: 5185,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
