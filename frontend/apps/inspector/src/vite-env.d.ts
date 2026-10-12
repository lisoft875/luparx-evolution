/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_PORTAL: string;
  readonly VITE_USE_MOCKS: string;
  /** 'hash' for static preview builds; anything else keeps path-based routing. */
  readonly VITE_ROUTER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/* --- Qué compilación es ésta (12-10-2026) -------------------------------------------------------
   Las pone `vite.config.ts` con `define`, o sea que al llegar acá ya son literales: no hay lectura
   en tiempo de ejecución que pueda fallar. `null` significa «esta compilación no lo supo», y eso es
   lo que la pantalla tiene que decir — el §6 prohíbe inventar el dato, no prohíbe no tenerlo. */
declare const __LUPARX_VERSION__: string;
declare const __LUPARX_BUILD__: string | null;
declare const __LUPARX_ENV__: string | null;
declare const __LUPARX_BUILT_AT__: string;
