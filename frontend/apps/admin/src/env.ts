import type { Portal } from '@luparx/api-client';

export const PORTAL: Portal = 'admin';

/** When true the app runs entirely against the in-process mock transport (no backend needed). */
export const USE_MOCKS: boolean = import.meta.env.VITE_USE_MOCKS === 'true';

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

/**
 * Base URL of the LupaRX API, without a trailing slash.
 * Empty when nothing is configured; call {@link assertEnvConfigured} on boot to fail loudly.
 * The mock transport intercepts every request, so its placeholder is never dialled.
 */
export const API_BASE_URL: string = configuredBaseUrl
  ? configuredBaseUrl.replace(/\/+$/, '')
  : USE_MOCKS
    ? 'http://localhost:8090'
    : '';

/**
 * Guards against a blank screen: an unset VITE_API_BASE_URL used to surface as an opaque
 * runtime error deep inside a component instead of a readable message on boot.
 */
export function assertEnvConfigured(): void {
  if (API_BASE_URL) return;
  throw new Error(
    'VITE_API_BASE_URL no está configurado. Copiá .env.example a .env en apps/admin ' +
      '(API local: http://localhost:8090 — ver docs/PORTS.md), o poné VITE_USE_MOCKS=true para correr sin backend.',
  );
}
