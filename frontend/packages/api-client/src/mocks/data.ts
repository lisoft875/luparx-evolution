import type {
  AdministrativeDivision,
  AdminLevelCatalogEntry,
  AuditEvent,
  CountryCatalogEntry,
  DocumentTypeCatalogEntry,
  FeatureFlag,
  MembershipSummary,
  ParkingPolicy,
  ParkingSession,
  PlatformTenant,
  Role,
  SystemHealth,
  SystemJob,
  TenantAdmin,
  UserProfile,
  Vehicle,
} from '../types/domain';

/**
 * Deliberately includes two countries with different admin-level shapes (CR:
 * 3 required levels; US: 1 required level) to exercise the N-level cascade
 * generically instead of assuming every country has exactly 3 divisions.
 */
export const MOCK_COUNTRIES: CountryCatalogEntry[] = [
  {
    code: 'CR',
    name: 'Costa Rica',
    dialCode: '+506',
    flagEmoji: '🇨🇷',
    defaultLocale: 'es-CR',
    defaultCurrency: 'CRC',
    defaultTimeZone: 'America/Costa_Rica',
  },
  {
    code: 'US',
    name: 'United States',
    dialCode: '+1',
    flagEmoji: '🇺🇸',
    defaultLocale: 'en-US',
    defaultCurrency: 'USD',
    defaultTimeZone: 'America/New_York',
  },
  {
    code: 'PA',
    name: 'Panamá',
    dialCode: '+507',
    flagEmoji: '🇵🇦',
    defaultLocale: 'es-CR',
    defaultCurrency: 'PAB',
    defaultTimeZone: 'America/Panama',
  },
];

export const MOCK_ADMIN_LEVELS: Record<string, AdminLevelCatalogEntry[]> = {
  CR: [
    { level: 1, labelKey: 'address.level.province', required: true },
    { level: 2, labelKey: 'address.level.canton', required: true },
    { level: 3, labelKey: 'address.level.district', required: true },
  ],
  US: [{ level: 1, labelKey: 'address.level.state', required: true }],
  PA: [
    { level: 1, labelKey: 'address.level.province', required: true },
    { level: 2, labelKey: 'address.level.district', required: true },
  ],
};

export const MOCK_DIVISIONS: Record<string, AdministrativeDivision[]> = {
  CR: [
    { id: 'cr-sj', code: '1', name: 'San José', level: 1, parentId: null },
    { id: 'cr-ala', code: '2', name: 'Alajuela', level: 1, parentId: null },
    { id: 'cr-sj-central', code: '101', name: 'Central', level: 2, parentId: 'cr-sj' },
    { id: 'cr-sj-escazu', code: '102', name: 'Escazú', level: 2, parentId: 'cr-sj' },
    { id: 'cr-sj-central-carmen', code: '10101', name: 'Carmen', level: 3, parentId: 'cr-sj-central' },
    { id: 'cr-sj-central-merced', code: '10102', name: 'Merced', level: 3, parentId: 'cr-sj-central' },
  ],
  US: [
    { id: 'us-ca', code: 'CA', name: 'California', level: 1, parentId: null },
    { id: 'us-ny', code: 'NY', name: 'New York', level: 1, parentId: null },
  ],
  PA: [
    { id: 'pa-panama', code: '1', name: 'Panamá', level: 1, parentId: null },
    { id: 'pa-panama-sm', code: '101', name: 'San Miguelito', level: 2, parentId: 'pa-panama' },
  ],
};

export const MOCK_DOCUMENT_TYPES: Record<string, DocumentTypeCatalogEntry[]> = {
  CR: [
    { type: 'NATIONAL_ID', labelKey: 'document.type.NATIONAL_ID', pattern: '^\\d{9}$', example: '123456789' },
    {
      type: 'FOREIGN_RESIDENT_ID',
      labelKey: 'document.type.FOREIGN_RESIDENT_ID',
      pattern: '^\\d{11,12}$',
      example: '12345678901',
    },
    {
      type: 'PASSPORT',
      labelKey: 'document.type.PASSPORT',
      pattern: '^[A-Za-z0-9]{6,12}$',
      example: 'AB123456',
    },
  ],
  US: [
    {
      type: 'PASSPORT',
      labelKey: 'document.type.PASSPORT',
      pattern: '^[A-Za-z0-9]{6,9}$',
      example: '123456789',
    },
    { type: 'OTHER', labelKey: 'document.type.OTHER', pattern: '^.{4,20}$', example: 'DL-1234567' },
  ],
  PA: [
    { type: 'NATIONAL_ID', labelKey: 'document.type.NATIONAL_ID', pattern: '^\\d{1,2}-\\d{3,4}-\\d{1,6}$', example: '8-123-4567' },
    { type: 'PASSPORT', labelKey: 'document.type.PASSPORT', pattern: '^[A-Za-z0-9]{6,12}$', example: 'PA123456' },
  ],
};

export const MOCK_TENANTS: TenantAdmin[] = [
  {
    id: 'tenant-sanjose',
    slug: 'san-jose',
    name: 'Municipalidad de San José',
    legalName: 'Municipalidad de San José',
    countryCode: 'CR',
    currencyCode: 'CRC',
    locale: 'es-CR',
    timeZone: 'America/Costa_Rica',
    status: 'ACTIVE',
    selfRegistrationPolicy: 'APPROVAL_REQUIRED',
  },
  {
    id: 'tenant-escazu',
    slug: 'escazu',
    name: 'Municipalidad de Escazú',
    legalName: 'Municipalidad de Escazú',
    countryCode: 'CR',
    currencyCode: 'CRC',
    locale: 'es-CR',
    timeZone: 'America/Costa_Rica',
    status: 'ACTIVE',
    selfRegistrationPolicy: 'OPEN',
  },
];

export interface MockUserRecord {
  profile: UserProfile;
  password: string;
  memberships: MembershipSummary[];
  mfaEnabled: boolean;
  mfaSecret?: string;
  /**
   * PLATFORM_ADMIN/PLATFORM_SUPPORT is a platform-scope grant, not a
   * `tenant_memberships` row (CONTRACT.md §5 scopes that table to a tenant
   * FK) — modeled here as a role attached directly to the user, decoupled
   * from `memberships`, mirroring how a real backend would keep it outside
   * `tenant_memberships` entirely.
   */
  platformRole?: Role;
}

export const mockUsersById = new Map<string, MockUserRecord>();
export const mockAuditEvents: AuditEvent[] = [];

function seedUser(record: MockUserRecord): void {
  mockUsersById.set(record.profile.id, record);
}

seedUser({
  profile: {
    id: 'user-citizen-1',
    email: 'citizen@example.com',
    emailVerified: true,
    givenName: 'María',
    familyName: 'Rodríguez',
    secondFamilyName: 'Solano',
    birthDate: '1990-05-12',
    nationalityCode: 'CR',
    phone: { countryCode: 'CR', nationalNumber: '88887777' },
    identityDocument: { countryCode: 'CR', type: 'NATIONAL_ID', number: '109870123' },
    address: {
      countryCode: 'CR',
      level1Id: 'cr-sj',
      level2Id: 'cr-sj-central',
      level3Id: 'cr-sj-central-carmen',
      line1: 'Avenida 2, casa 34',
    },
    locale: 'es-CR',
    timeZone: 'America/Costa_Rica',
    status: 'ACTIVE',
    mfaRequired: false,
    mfaEnabled: false,
  },
  password: 'Password123!',
  memberships: [
    { id: 'membership-1', tenantId: 'tenant-sanjose', tenantName: 'Municipalidad de San José', portal: 'citizen', role: 'CITIZEN', status: 'ACTIVE' },
    { id: 'membership-2', tenantId: 'tenant-escazu', tenantName: 'Municipalidad de Escazú', portal: 'citizen', role: 'CITIZEN', status: 'ACTIVE' },
  ],
  mfaEnabled: false,
});

seedUser({
  profile: {
    id: 'user-admin-1',
    email: 'admin@example.com',
    emailVerified: true,
    givenName: 'Carlos',
    familyName: 'Jiménez',
    birthDate: '1985-02-20',
    nationalityCode: 'CR',
    phone: { countryCode: 'CR', nationalNumber: '89998888' },
    identityDocument: { countryCode: 'CR', type: 'NATIONAL_ID', number: '109870124' },
    address: { countryCode: 'CR', level1Id: 'cr-sj', level2Id: 'cr-sj-escazu', line1: 'Calle Real' },
    locale: 'es-CR',
    timeZone: 'America/Costa_Rica',
    status: 'ACTIVE',
    mfaRequired: true,
    mfaEnabled: true,
  },
  password: 'Password123!',
  memberships: [
    { id: 'membership-3', tenantId: 'tenant-sanjose', tenantName: 'Municipalidad de San José', portal: 'admin', role: 'TENANT_ADMIN', status: 'ACTIVE' },
  ],
  mfaEnabled: true,
  mfaSecret: 'JBSWY3DPEHPK3PXP',
});

seedUser({
  profile: {
    id: 'user-inspector-1',
    email: 'inspector@example.com',
    emailVerified: true,
    givenName: 'Ana',
    familyName: 'Vargas',
    birthDate: '1993-11-02',
    nationalityCode: 'CR',
    phone: { countryCode: 'CR', nationalNumber: '87776666' },
    identityDocument: { countryCode: 'CR', type: 'NATIONAL_ID', number: '109870125' },
    address: { countryCode: 'CR', level1Id: 'cr-ala', line1: 'Barrio El Carmen' },
    locale: 'es-CR',
    timeZone: 'America/Costa_Rica',
    status: 'ACTIVE',
    mfaRequired: true,
    mfaEnabled: true,
  },
  password: 'Password123!',
  memberships: [
    { id: 'membership-4', tenantId: 'tenant-sanjose', tenantName: 'Municipalidad de San José', portal: 'inspector', role: 'INSPECTOR', status: 'ACTIVE' },
  ],
  mfaEnabled: true,
  mfaSecret: 'JBSWY3DPEHPK3PXQ',
});

seedUser({
  profile: {
    id: 'user-platform-1',
    email: 'platform@example.com',
    emailVerified: true,
    givenName: 'Sofía',
    familyName: 'Barrantes',
    birthDate: '1988-07-30',
    nationalityCode: 'CR',
    phone: { countryCode: 'CR', nationalNumber: '86665555' },
    identityDocument: { countryCode: 'CR', type: 'NATIONAL_ID', number: '109870126' },
    address: { countryCode: 'CR', level1Id: 'cr-sj', line1: 'Torre LupaRX, piso 8' },
    locale: 'es-CR',
    timeZone: 'America/Costa_Rica',
    status: 'ACTIVE',
    // `platform` exiges MFA active to complete login (CONTRACT.md §0/§3) — always true for this seed.
    mfaRequired: true,
    mfaEnabled: true,
  },
  password: 'Password123!',
  memberships: [],
  mfaEnabled: true,
  mfaSecret: 'JBSWY3DPEHPK3PXR',
  platformRole: 'PLATFORM_ADMIN',
});

export const MOCK_PLATFORM_TENANTS: PlatformTenant[] = MOCK_TENANTS.map((tenant) => ({
  id: tenant.id,
  slug: tenant.slug,
  legalName: tenant.legalName,
  displayName: tenant.name,
  countryCode: tenant.countryCode,
  currencyCode: tenant.currencyCode,
  locale: tenant.locale,
  timeZone: tenant.timeZone,
  status: tenant.status as PlatformTenant['status'],
  selfRegistrationPolicy: tenant.selfRegistrationPolicy,
  createdAt: '2025-11-01T09:00:00Z',
}));

export const mockTenantSettings = new Map<string, Record<string, string | number | boolean>>([
  ['tenant-sanjose', { 'parking.gracePeriodMinutes': 10, 'parking.currency': 'CRC', 'notifications.smsEnabled': true }],
  ['tenant-escazu', { 'parking.gracePeriodMinutes': 15, 'parking.currency': 'CRC', 'notifications.smsEnabled': false }],
]);

export const MOCK_FEATURE_FLAGS: FeatureFlag[] = [
  { key: 'parking.moduleEnabled', enabled: false, description: 'Enables the parking-meter domain end to end.' },
  { key: 'exports.async', enabled: false, description: 'Async export job status polling (currently synchronous CSV).' },
  { key: 'auth.federatedLogin', enabled: true, description: 'Google/Microsoft/Facebook OIDC sign-in.' },
];

export const MOCK_SYSTEM_JOBS: SystemJob[] = [
  { name: 'refresh-token-cleanup', status: 'IDLE', lastRunAt: '2026-09-07T03:00:00Z' },
  { name: 'audit-events-archive', status: 'IDLE', lastRunAt: '2026-09-06T03:00:00Z' },
];

export const MOCK_SYSTEM_HEALTH: SystemHealth = {
  status: 'UP',
  components: [
    { name: 'database', status: 'UP' },
    { name: 'cache', status: 'UP' },
    { name: 'email', status: 'UP' },
  ],
};

let mockUserSequence = 100;
export function nextMockUserId(): string {
  mockUserSequence += 1;
  return `user-mock-${mockUserSequence}`;
}

export function recordAuditEvent(event: Omit<AuditEvent, 'id' | 'occurredAt'>): void {
  mockAuditEvents.unshift({
    ...event,
    id: `audit-${mockAuditEvents.length + 1}`,
    occurredAt: new Date().toISOString(),
  });
}

// =================================================================================================
// v0.2 — Dominio de parqueo (CONTRACT.md, sección normativa al final del contrato)
// =================================================================================================
// Stands in for module-parking/module-wallet's citizen-facing endpoints until the real backend
// ships them. Every shape below matches the wire contract in CONTRACT.md v0.2 §API exactly, so
// swapping `USE_MOCKS` off touches only `apps/citizen/src/env.ts` — no calling code changes.

// ---- Vehicles (CONTRACT.md v0.2 §"Vehículos") --------------------------------------------------
// Uniqueness is `(user_id, plate normalized)` — enforced below per-user, never globally: two
// different users may share a plate (rule 2).

export interface MockVehicleRecord extends Vehicle {
  userId: string;
}

export const mockVehicles: MockVehicleRecord[] = [
  {
    id: 'vehicle-bhl019',
    userId: 'user-citizen-1',
    plate: 'BHL019',
    brand: 'Toyota',
    model: 'Yaris',
    year: 2015,
    isOwner: true,
    isPrimary: true,
  },
  {
    id: 'vehicle-bny963',
    userId: 'user-citizen-1',
    plate: 'BNY963',
    brand: 'Toyota',
    model: 'RAV4',
    year: 2018,
    isOwner: true,
    isPrimary: false,
  },
  {
    id: 'vehicle-test01',
    userId: 'user-citizen-1',
    plate: 'TEST01',
    brand: 'Toyota',
    model: 'Corolla',
    year: 2022,
    isOwner: false,
    isPrimary: false,
  },
];

let mockVehicleSequence = 100;
export function nextMockVehicleId(): string {
  mockVehicleSequence += 1;
  return `vehicle-mock-${mockVehicleSequence}`;
}

/** Uppercase, no spaces or dashes (CONTRACT.md v0.2 §"Vehículos") — mirrors the normalization the server is expected to apply. */
export function normalizeMockPlate(plate: string): string {
  return plate.toUpperCase().replace(/[\s-]+/g, '');
}

// ---- Parking policy, one row per tenant (CONTRACT.md v0.2 §"Política de parqueo") --------------

export const MOCK_PARKING_POLICIES: Record<string, ParkingPolicy> = {
  'tenant-sanjose': {
    sessionIncrementsMinutes: [30, 60, 120],
    sessionMinMinutes: 15,
    sessionMaxMinutes: 240,
    extensionEnabled: true,
    extensionIncrementsMinutes: [15, 30, 60],
    extensionMaxTotalMinutes: 360,
    earlyFinishEnabled: true,
    creditOnEarlyFinishEnabled: true,
    creditMinRemainingMinutes: 10,
    creditExpiryDays: 30,
    graceMinutes: 5,
  },
  'tenant-escazu': {
    sessionIncrementsMinutes: [30, 60, 90],
    sessionMinMinutes: 30,
    sessionMaxMinutes: 180,
    extensionEnabled: false,
    extensionIncrementsMinutes: [],
    extensionMaxTotalMinutes: 180,
    earlyFinishEnabled: false,
    creditOnEarlyFinishEnabled: false,
    creditMinRemainingMinutes: 0,
    creditExpiryDays: 0,
    graceMinutes: 10,
  },
};

export const DEFAULT_MOCK_PARKING_POLICY: ParkingPolicy = MOCK_PARKING_POLICIES['tenant-sanjose']!;

export function mockParkingPolicyForTenant(tenantId: string | null): ParkingPolicy {
  return (tenantId && MOCK_PARKING_POLICIES[tenantId]) || DEFAULT_MOCK_PARKING_POLICY;
}

// ---- Zones/rates backing the quote endpoint (CONTRACT.md v0.2 says zone catalogs are an
// admin-only concern for v0.2 — `/admin/parking/zones|rates` — so this rate table is purely the
// mock server's private pretend data, keyed by the same zoneId the citizen app's own local zone
// picker uses; a real backend would resolve the rate from the zone/tenant instead). -------------

export interface MockZoneRate {
  zoneId: string;
  tenantId: string;
  rateMinorPerMinute: number;
  currencyCode: string;
}

export const MOCK_ZONE_RATES: MockZoneRate[] = [
  { zoneId: 'zone-centro', tenantId: 'tenant-sanjose', rateMinorPerMinute: 917, currencyCode: 'CRC' },
  { zoneId: 'zone-escazu-centro', tenantId: 'tenant-escazu', rateMinorPerMinute: 800, currencyCode: 'CRC' },
];

export function mockZoneRate(zoneId: string, tenantId: string | null): MockZoneRate {
  return (
    MOCK_ZONE_RATES.find((rate) => rate.zoneId === zoneId && rate.tenantId === tenantId) ??
    MOCK_ZONE_RATES.find((rate) => rate.tenantId === tenantId) ?? {
      zoneId,
      tenantId: tenantId ?? '',
      rateMinorPerMinute: 900,
      currencyCode: 'CRC',
    }
  );
}

// ---- Wallet & time credits, scoped `(userId, tenantId)` (CONTRACT.md v0.2 rules 5/6 — per-tenant, never global) ----

export interface MockWalletRecord {
  balanceMinor: number;
  currencyCode: string;
}

export const mockWallets = new Map<string, MockWalletRecord>([
  ['user-citizen-1:tenant-sanjose', { balanceMinor: 4880000, currencyCode: 'CRC' }],
  ['user-citizen-1:tenant-escazu', { balanceMinor: 2000000, currencyCode: 'CRC' }],
]);

export function walletKey(userId: string, tenantId: string): string {
  return `${userId}:${tenantId}`;
}

export interface MockTimeCreditRecord {
  minutes: number;
  expiresAt: string | null;
}

export const mockTimeCredits = new Map<string, MockTimeCreditRecord>([
  [
    'user-citizen-1:tenant-sanjose',
    { minutes: 12, expiresAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString() },
  ],
  ['user-citizen-1:tenant-escazu', { minutes: 0, expiresAt: null }],
]);

/** Available credit minutes right now — an expired credit reads as zero without being deleted, matching a server that only prunes lazily. */
export function availableMockCreditMinutes(key: string): number {
  const credit = mockTimeCredits.get(key);
  if (!credit) return 0;
  if (credit.expiresAt && new Date(credit.expiresAt).getTime() <= Date.now()) return 0;
  return credit.minutes;
}

// ---- Parking sessions, one store shared by every tenant/user (CONTRACT.md v0.2 rule 1 — at most
// one ACTIVE session per vehicle, and at most one per space) -------------------------------------

export interface MockParkingSessionRecord extends ParkingSession {
  userId: string;
  tenantId: string;
}

const now = Date.now();

export const mockParkingSessions: MockParkingSessionRecord[] = [
  {
    id: 'session-1',
    userId: 'user-citizen-1',
    tenantId: 'tenant-sanjose',
    zoneId: 'zone-centro',
    zoneName: 'Centro',
    spaceCode: 'LUP-0001',
    vehicleId: 'vehicle-bhl019',
    plateSnapshot: 'BHL019',
    minutes: 60,
    amountMinor: 55020,
    currencyCode: 'CRC',
    status: 'ACTIVE',
    startedAt: new Date(now - 5 * 60_000).toISOString(),
    expiresAt: new Date(now + 55 * 60_000).toISOString(),
  },
];

let mockParkingSessionSequence = 1;
export function nextMockParkingSessionId(): string {
  mockParkingSessionSequence += 1;
  return `session-mock-${mockParkingSessionSequence}`;
}

/** Replay cache for `Idempotency-Key` (CONTRACT.md v0.2 §Invariantes — start/extend/finish never charge twice for one logical operation). */
export const mockIdempotencyResponses = new Map<string, unknown>();
