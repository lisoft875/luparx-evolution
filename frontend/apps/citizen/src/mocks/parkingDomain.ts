import { useSyncExternalStore } from 'react';

/**
 * TODO(domain): everything in this file stands in for real citizen-facing
 * endpoints (`/api/v1/citizen/vehicles`, `/api/v1/citizen/parking-sessions`,
 * `/api/v1/citizen/wallet`, `/api/v1/citizen/payment-methods`,
 * `/api/v1/citizen/fines`) — `module-parking` and `module-wallet` haven't
 * shipped yet (CONTRACT.md §4 "Dominio parquímetros (stub v0.1, contrato
 * reservado)"). The shapes below are deliberately close to what those
 * endpoints will return, and every screen only talks to the hooks/functions
 * at the bottom of this file, never to the mock arrays directly — so wiring
 * in real `apiClient.citizen.*` + react-query later touches only this file.
 *
 * Sample data intentionally matches the client's reference mockup
 * (docs/brand/citizen-app-reference-screens.png) 1:1: citizen "Leana
 * Vásquez", vehicle BHL019 as the primary, balance ₡48.800, one card ending
 * in 4242, and a short movement history from 3–5 September 2026.
 *
 * TODO(domain): the municipality's time zone is hardcoded to
 * America/Costa_Rica (this tenant's default) until tenant-scoped locale/tz
 * config lands (DESIGN_SYSTEM.md §"Internacionalización", CONTRACT.md §2).
 */
export const MOCK_TENANT_TIME_ZONE = 'America/Costa_Rica';
export const MOCK_CURRENCY_CODE = 'CRC';

// ---- Profile -------------------------------------------------------------

export interface MockCitizenProfile {
  givenName: string;
  familyName: string;
  email: string;
  emailVerified: boolean;
  phoneNational: string;
  addressLine: string;
}

export const MOCK_PROFILE: MockCitizenProfile = {
  givenName: 'Leana',
  familyName: 'Vásquez',
  email: 'user01@luparx.test',
  emailVerified: true,
  phoneNational: '8763 8404',
  addressLine: 'Condominio 221 casa 27',
};

// ---- Vehicles --------------------------------------------------------------

export interface MockVehicle {
  id: string;
  plate: string;
  brand: string;
  model: string;
  color: string;
  year: number;
  isPrimary: boolean;
}

export const MOCK_VEHICLES: MockVehicle[] = [
  { id: 'veh-bhl019', plate: 'BHL019', brand: 'Toyota', model: 'Yaris', color: 'Gris', year: 2015, isPrimary: true },
  { id: 'veh-bny963', plate: 'BNY963', brand: 'Toyota', model: 'RAV4', color: 'Blanco', year: 2018, isPrimary: false },
  { id: 'veh-test01', plate: 'TEST01', brand: 'Toyota', model: 'Corolla', color: 'Blanco', year: 2022, isPrimary: false },
];

export function primaryVehicle(): MockVehicle {
  // Non-null: MOCK_VEHICLES is a non-empty compile-time constant.
  return MOCK_VEHICLES.find((v) => v.isPrimary) ?? MOCK_VEHICLES[0]!;
}

// ---- Zones (public read — CONTRACT.md §4 "Dominio parquímetros") ---------

export interface MockZone {
  id: string;
  name: string;
  /** The space currently assigned to this citizen in this zone (stands in for a geolocation/space-detection lookup). */
  spaceCode: string;
}

export const MOCK_ZONES: MockZone[] = [{ id: 'zone-centro', name: 'Centro', spaceCode: 'LUP-0001' }];

// ---- Fines ------------------------------------------------------------------

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

export const MOCK_FINES: MockFine[] = [];

// ---- Payment methods ----------------------------------------------------

export interface MockPaymentCard {
  id: string;
  brand: 'mastercard' | 'visa';
  last4: string;
  expiryMonth: number;
  /** Two-digit year, as printed on the card (not a calendar date — no Intl formatting applies). */
  expiryYear: number;
  isPrimary: boolean;
}

export const MOCK_PAYMENT_CARDS: MockPaymentCard[] = [
  { id: 'card-4242', brand: 'mastercard', last4: '4242', expiryMonth: 12, expiryYear: 28, isPrimary: true },
];

// ---- Movements / ledger ----------------------------------------------------

export type MockMovementKind = 'parking' | 'parkingExtension' | 'topup' | 'fine';

export interface MockMovement {
  id: string;
  kind: MockMovementKind;
  titleKey: string;
  zoneName?: string;
  spaceCode?: string;
  cardLast4?: string;
  amountMinor: number;
  currencyCode: string;
  occurredAt: string;
}

// Newest first. Timestamps carry an explicit -06:00 offset (Costa Rica standard time, no DST)
// so they render correctly regardless of the runtime machine's local time zone.
export const MOCK_MOVEMENTS: MockMovement[] = [
  {
    // TODO(domain): this is the exact row the reference mockup's Home
    // "Actividad reciente" shows (docs/brand/citizen-app-reference-screens.png,
    // screen 1) — keep its kind/amount/timestamp in sync with that screen.
    id: 'mv-1',
    kind: 'parking',
    titleKey: 'citizen.movements.item.parking',
    zoneName: 'Centro',
    spaceCode: 'LUP-0001',
    amountMinor: -40000,
    currencyCode: MOCK_CURRENCY_CODE,
    occurredAt: '2026-09-05T20:27:00-06:00',
  },
  {
    id: 'mv-2',
    kind: 'parkingExtension',
    titleKey: 'citizen.movements.item.parkingExtension',
    zoneName: 'Centro',
    spaceCode: 'LUP-0001',
    amountMinor: -15000,
    currencyCode: MOCK_CURRENCY_CODE,
    occurredAt: '2026-09-05T20:26:00-06:00',
  },
  {
    id: 'mv-3',
    kind: 'parking',
    titleKey: 'citizen.movements.item.parking',
    zoneName: 'Centro',
    spaceCode: 'LUP-0001',
    amountMinor: -15000,
    currencyCode: MOCK_CURRENCY_CODE,
    occurredAt: '2026-09-04T14:09:00-06:00',
  },
  {
    id: 'mv-4',
    kind: 'topup',
    titleKey: 'citizen.movements.item.topup',
    cardLast4: '4242',
    amountMinor: 1000000,
    currencyCode: MOCK_CURRENCY_CODE,
    occurredAt: '2026-09-03T10:12:00-06:00',
  },
];

// ---- Tiny module-level store so the parking flow, wallet and home screen agree on shared state ----

export interface MockActiveSession {
  vehiclePlate: string;
  zoneName: string;
  spaceCode: string;
  startedAt: string;
  expiresAt: string;
}

let activeSession: MockActiveSession | null = null;
let walletBalanceMinor = 4880000; // ₡48.800
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
