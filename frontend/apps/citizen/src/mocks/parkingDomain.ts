import { useSyncExternalStore } from 'react';

/**
 * TODO(domain): everything in this file stands in for the real
 * `/api/v1/citizen/vehicles` and `/api/v1/citizen/parking-sessions`
 * endpoints (CONTRACT.md §4 "Dominio parquímetros (stub v0.1, contrato
 * reservado)") — `module-parking` hasn't shipped yet. The shapes below are
 * deliberately close to what those endpoints will return, and every screen
 * only talks to the hooks at the bottom of this file, never to the mock
 * arrays directly — so wiring in `apiClient.citizen.*` + react-query later
 * touches only this file.
 */

export interface MockVehicle {
  id: string;
  plate: string;
  label: string;
}

export interface MockActiveSession {
  vehiclePlate: string;
  zoneName: string;
  spaceCode: string;
  startedAt: string;
  expiresAt: string;
}

export interface MockFine {
  id: string;
  plate: string;
  reasonKey: string;
  amountMinor: number;
  currencyCode: string;
  status: 'PENDING' | 'PAID';
  issuedAt: string;
  dueAt: string;
}

export type MockMovementKind = 'parking' | 'topup' | 'fine';

export interface MockMovement {
  id: string;
  kind: MockMovementKind;
  titleKey: string;
  meta: string;
  amountMinor: number;
  currencyCode: string;
  occurredAt: string;
}

export const MOCK_VEHICLES: MockVehicle[] = [
  { id: 'veh-1', plate: 'BBB123', label: 'Hyundai Tucson gris' },
  { id: 'veh-2', plate: 'CL4521', label: 'Yamaha FZ negra' },
];

export const MOCK_FINES: MockFine[] = [
  {
    id: 'fine-1',
    plate: 'BBB123',
    reasonKey: 'citizen.fines.reason.unpaid',
    amountMinor: 1500000,
    currencyCode: 'CRC',
    status: 'PENDING',
    issuedAt: '2026-08-28T14:00:00Z',
    dueAt: '2026-09-27T23:59:59Z',
  },
  {
    id: 'fine-2',
    plate: 'BBB123',
    reasonKey: 'citizen.fines.reason.overtime',
    amountMinor: 800000,
    currencyCode: 'CRC',
    status: 'PAID',
    issuedAt: '2026-06-10T09:30:00Z',
    dueAt: '2026-07-10T23:59:59Z',
  },
];

export const MOCK_MOVEMENTS: MockMovement[] = [
  {
    id: 'mv-1',
    kind: 'parking',
    titleKey: 'citizen.movements.item.parking',
    meta: 'Zona Centro · Espacio 14',
    amountMinor: -40000,
    currencyCode: 'CRC',
    occurredAt: '2026-09-07T13:00:00Z',
  },
  {
    id: 'mv-2',
    kind: 'topup',
    titleKey: 'citizen.movements.item.topup',
    meta: 'Tarjeta terminada en 4242',
    amountMinor: 1000000,
    currencyCode: 'CRC',
    occurredAt: '2026-09-05T10:00:00Z',
  },
  {
    id: 'mv-3',
    kind: 'fine',
    titleKey: 'citizen.movements.item.fine',
    meta: 'Zona Escazú centro',
    amountMinor: -800000,
    currencyCode: 'CRC',
    occurredAt: '2026-06-10T09:30:00Z',
  },
  {
    id: 'mv-4',
    kind: 'parking',
    titleKey: 'citizen.movements.item.parking',
    meta: 'Zona Escazú · Espacio 7',
    amountMinor: -60000,
    currencyCode: 'CRC',
    occurredAt: '2026-09-03T09:12:00Z',
  },
];

// ---- Tiny module-level store so the parking flow and the home screen agree on session state ----

let activeSession: MockActiveSession | null = null;
let walletBalanceMinor = 1250000;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface StartSessionInput {
  vehiclePlate: string;
  zoneName: string;
  spaceCode: string;
  durationMinutes: number;
  amountMinor: number;
}

export function startMockSession(input: StartSessionInput): void {
  const now = new Date();
  activeSession = {
    vehiclePlate: input.vehiclePlate,
    zoneName: input.zoneName,
    spaceCode: input.spaceCode,
    startedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.durationMinutes * 60_000).toISOString(),
  };
  walletBalanceMinor -= input.amountMinor;
  emit();
}

export function extendMockSession(minutes: number): void {
  if (!activeSession) return;
  activeSession = {
    ...activeSession,
    expiresAt: new Date(new Date(activeSession.expiresAt).getTime() + minutes * 60_000).toISOString(),
  };
  emit();
}

export function useActiveSession(): MockActiveSession | null {
  return useSyncExternalStore(subscribe, () => activeSession);
}

export function useWalletBalanceMinor(): number {
  return useSyncExternalStore(subscribe, () => walletBalanceMinor);
}
