import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Prefijo bajo el que se sirve la app. Vacío en desarrollo (cada portal tiene su puerto) y, en un
  // despliegue de un solo dominio con rutas, "/admin/", "/inspector/"… — lo pone el build, no el
  // código, porque el mismo artefacto se publica en la raíz de un subdominio o bajo una ruta según
  // lo decida cada instalación. Vite reescribe con esto las URL de los assets y expone el valor en
  // import.meta.env.BASE_URL, que es de donde el enrutador saca su basename.
  base: process.env.VITE_BASE_PATH ?? '/',
  server: {
    port: 5183,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
