/**
 * TODO(domain): everything in this file stands in for citizen-facing endpoints that CONTRACT.md's
 * "v0.2 — Dominio de parqueo" section does not yet define a contract for: fines
 * (`/api/v1/citizen/fines`), payment methods (`/api/v1/citizen/payment-methods`) and the
 * ledger/movements list. Vehicles, parking sessions, the wallet balance and time credits are wired
 * to the real `@luparx/api-client` contract (see `../lib/queries.ts`) and no longer live here.
 *
 * Sample data intentionally matches the client's reference mockup
 * (docs/brand/citizen-app-reference-screens.png): citizen "Leana Vásquez", a card ending in 4242,
 * and a short movement history from 3–5 September 2026.
 *
 * TODO(domain): the municipality's time zone is hardcoded to America/Costa_Rica (this tenant's
 * default) until tenant-scoped locale/tz config is exposed on `MeResponse.activeTenant`
 * (CONTRACT.md §4 `TenantCatalogEntry` carries no timeZone/currency today — DESIGN_SYSTEM.md
 * §"Internacionalización").
 */
export const MOCK_TENANT_TIME_ZONE = 'America/Costa_Rica';

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

// ---- Zones (CONTRACT.md v0.2 keeps zone/rate catalogs an admin-only concern for now — no citizen
// endpoint lists them, so this is purely a local stand-in for a geolocation/space-detection lookup
// until one ships. `id` must match a rate the mock server's `mockZoneRate` recognizes.) ----------

export interface MockZone {
  id: string;
  name: string;
  /** The space currently assigned to this citizen in this zone (stands in for geolocation/space detection). */
  spaceCode: string;
}

const ZONES_BY_TENANT: Record<string, MockZone[]> = {
  'tenant-sanjose': [{ id: 'zone-centro', name: 'Centro', spaceCode: 'LUP-0001' }],
  'tenant-escazu': [{ id: 'zone-escazu-centro', name: 'Centro', spaceCode: 'ESC-0001' }],
};
const DEFAULT_ZONES: MockZone[] = ZONES_BY_TENANT['tenant-sanjose']!;

export function zonesForTenant(tenantId: string | null | undefined): MockZone[] {
  return (tenantId && ZONES_BY_TENANT[tenantId]) || DEFAULT_ZONES;
}

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
    currencyCode: 'CRC',
    occurredAt: '2026-09-05T20:27:00-06:00',
  },
  {
    id: 'mv-2',
    kind: 'parkingExtension',
    titleKey: 'citizen.movements.item.parkingExtension',
    zoneName: 'Centro',
    spaceCode: 'LUP-0001',
    amountMinor: -15000,
    currencyCode: 'CRC',
    occurredAt: '2026-09-05T20:26:00-06:00',
  },
  {
    id: 'mv-3',
    kind: 'parking',
    titleKey: 'citizen.movements.item.parking',
    zoneName: 'Centro',
    spaceCode: 'LUP-0001',
    amountMinor: -15000,
    currencyCode: 'CRC',
    occurredAt: '2026-09-04T14:09:00-06:00',
  },
  {
    id: 'mv-4',
    kind: 'topup',
    titleKey: 'citizen.movements.item.topup',
    cardLast4: '4242',
    amountMinor: 1000000,
    currencyCode: 'CRC',
    occurredAt: '2026-09-03T10:12:00-06:00',
  },
];
