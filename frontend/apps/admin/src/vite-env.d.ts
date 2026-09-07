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
