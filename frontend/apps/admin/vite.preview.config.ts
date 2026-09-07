import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Self-contained demo build: one HTML file with every asset inlined, running against the
 * mock transport. Used to share a clickable preview without deploying anything.
 * Not a production build — `npm run build` is.
 */
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  define: {
    'import.meta.env.VITE_USE_MOCKS': JSON.stringify('true'),
    'import.meta.env.VITE_ROUTER': JSON.stringify('hash'),
  },
  build: { outDir: 'dist-preview', sourcemap: false, cssCodeSplit: false, assetsInlineLimit: 100000000 },
});
