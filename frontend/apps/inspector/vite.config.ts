import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
