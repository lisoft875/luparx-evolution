import type { Portal } from '@luparx/api-client';

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL;
export const PORTAL: Portal = 'platform';
export const USE_MOCKS: boolean = import.meta.env.VITE_USE_MOCKS === 'true';
