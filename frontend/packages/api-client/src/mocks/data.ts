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
  VehicleAttributeCatalogEntry,
} from '../types/domain';

/**
 * Deliberately includes two countries with different admin-level shapes (CR:
 * 3 required levels; US: 1 required level) to exercise the N-level cascade
 * generically instead of assuming every country has exactly 3 divisions.
 */
export const MOCK_COUNTRIES: CountryCatalogEntry[] = [
  {
    code: 'CR',
    nameKey: 'country.CR',
    dialCode: '+506',
    flagEmoji: '🇨🇷',
    defaultLocale: 'es-CR',
    defaultCurrency: 'CRC',
    defaultTimeZone: 'America/Costa_Rica',
  },
  {
    code: 'US',
    nameKey: 'country.US',
    dialCode: '+1',
    flagEmoji: '🇺🇸',
    defaultLocale: 'en-US',
    defaultCurrency: 'USD',
    defaultTimeZone: 'America/New_York',
  },
  {
    code: 'PA',
    nameKey: 'country.PA',
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
    // El servidor declara cuál es el predeterminado del país; el simulado dice lo mismo.
    {
      type: 'NATIONAL_ID',
      labelKey: 'document.type.NATIONAL_ID',
      pattern: '^\\d{9}$',
      example: '123456789',
      default: true,
    },
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
    shortName: 'San José',
    // Deliberately no `logoUrl`: the mock transport has no server to generate a monogram, so this
    // is the branch that exercises the client-side fallback (CONTRACT.md v0.4 — "sin emblema
    // todavía" is a normal state, not an error). Never invent a municipal coat of arms here.
    logoUrl: null,
    brandColor: '#1d4ed8',
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
    shortName: 'Escazú',
    logoUrl: null,
    brandColor: '#047857',
    currencyCode: 'CRC',
    locale: 'es-CR',
    timeZone: 'America/Costa_Rica',
    status: 'ACTIVE',
    selfRegistrationPolicy: 'OPEN',
  },
];

export interface MockUserRecord {
  profile: UserProfile;
  /**
   * Null for an account an operator opened for somebody (CONTRACT.md v0.14): no credentials exist
   * until the person follows the emailed link, and `null` is what makes a sign-in attempt fail the
   * way the server's would instead of matching an empty string.
   */
  password: string | null;
  memberships: MembershipSummary[];
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
  },
  password: 'Password123!',
  memberships: [
    { id: 'membership-1', tenantId: 'tenant-sanjose', tenantName: 'Municipalidad de San José', tenantShortName: 'San José', tenantLogoUrl: null, tenantBrandColor: '#1d4ed8', portal: 'citizen', role: 'CITIZEN', status: 'ACTIVE' },
    { id: 'membership-2', tenantId: 'tenant-escazu', tenantName: 'Municipalidad de Escazú', tenantShortName: 'Escazú', tenantLogoUrl: null, tenantBrandColor: '#047857', portal: 'citizen', role: 'CITIZEN', status: 'ACTIVE' },
  ],
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
  },
  password: 'Password123!',
  memberships: [
    { id: 'membership-3', tenantId: 'tenant-sanjose', tenantName: 'Municipalidad de San José', tenantShortName: 'San José', tenantLogoUrl: null, tenantBrandColor: '#1d4ed8', portal: 'admin', role: 'TENANT_ADMIN', status: 'ACTIVE' },
  ],
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
  },
  password: 'Password123!',
  memberships: [
    { id: 'membership-4', tenantId: 'tenant-sanjose', tenantName: 'Municipalidad de San José', tenantShortName: 'San José', tenantLogoUrl: null, tenantBrandColor: '#1d4ed8', portal: 'inspector', role: 'INSPECTOR', status: 'ACTIVE' },
  ],
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
  },
  password: 'Password123!',
  memberships: [],
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
    type: 'CAR',
    color: 'GRAY',
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
    type: 'CAR',
    color: 'WHITE',
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
    type: 'MOTORCYCLE',
    color: 'BLACK',
    isOwner: false,
    isPrimary: false,
  },
];

/**
 * The platform's vehicle enumerations (`GET /catalog/vehicle-types`, `/catalog/vehicle-colors`).
 * Keys only — the label text lives in the client dictionaries, one entry per `labelKey`.
 */
export const MOCK_VEHICLE_TYPES: VehicleAttributeCatalogEntry[] = [
  { value: 'CAR', labelKey: 'vehicle.type.car' },
  { value: 'MOTORCYCLE', labelKey: 'vehicle.type.motorcycle' },
  { value: 'PICKUP', labelKey: 'vehicle.type.pickup' },
  { value: 'VAN', labelKey: 'vehicle.type.van' },
  { value: 'OTHER', labelKey: 'vehicle.type.other' },
];

export const MOCK_VEHICLE_COLORS: VehicleAttributeCatalogEntry[] = [
  { value: 'WHITE', labelKey: 'vehicle.color.white' },
  { value: 'BLACK', labelKey: 'vehicle.color.black' },
  { value: 'GRAY', labelKey: 'vehicle.color.gray' },
  { value: 'SILVER', labelKey: 'vehicle.color.silver' },
  { value: 'RED', labelKey: 'vehicle.color.red' },
  { value: 'BLUE', labelKey: 'vehicle.color.blue' },
  { value: 'GREEN', labelKey: 'vehicle.color.green' },
  { value: 'OTHER', labelKey: 'vehicle.color.other' },
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
    // Cinco duraciones, no tres: es lo que hace visible una escalera NO lineal en la pantalla de
    // tarifas (45 min más barato que tres bloques de 15). Con tres columnas lineales el fixture no
    // puede mostrar lo que la tarifa por bloque no sabía expresar.
    sessionIncrementsMinutes: [15, 30, 45, 60, 120],
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
    // Diez minutos de cortesía (v0.31): el que se baja a dejar algo no paga. Una vez por placa y día.
    freeMinutes: 10,
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
    // Escazú no da cortesía: cero es una respuesta legítima y es la que tienen casi todas.
    freeMinutes: 0,
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

/**
 * En qué se aparta una zona de su municipalidad (CONTRACT.md v0.31).
 *
 * Nulo es HEREDAR, no cero. Se siembra una sola zona apartada —el centro de San José— porque es el
 * caso que justifica la versión entera: dos horas de máximo donde la rotación importa, mientras el
 * resto del cantón sigue con ocho.
 */
export interface MockZoneRules {
  zoneId: string;
  tenantId: string;
  sessionIncrementsMinutes: number[] | null;
  sessionMinMinutes: number | null;
  sessionMaxMinutes: number | null;
  extensionIncrementsMinutes: number[] | null;
  extensionMaxTotalMinutes: number | null;
  freeMinutes: number | null;
  ownSchedule: boolean;
  chargesAllDay: boolean;
  week: { weekday: string; bands: { startMinute: number; endMinute: number; startsAt: string; endsAt: string }[] }[];
}

export const mockZoneRules: MockZoneRules[] = [
  {
    zoneId: 'zone-centro',
    tenantId: 'tenant-sanjose',
    sessionIncrementsMinutes: [15, 30, 60],
    sessionMinMinutes: 15,
    // Dos horas: es la palanca que maneja la rotación en el centro histórico.
    sessionMaxMinutes: 120,
    extensionIncrementsMinutes: null,
    extensionMaxTotalMinutes: null,
    freeMinutes: 15,
    ownSchedule: true,
    chargesAllDay: false,
    week: [
      'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY',
    ].map((weekday) => ({
      weekday,
      bands: [{ startMinute: 360, endMinute: 1200, startsAt: '06:00', endsAt: '20:00' }],
    })).concat([
      { weekday: 'SATURDAY', bands: [{ startMinute: 420, endMinute: 840, startsAt: '07:00', endsAt: '14:00' }] },
    ]),
  },
];

/**
 * Los feriados de Costa Rica, como regla (CONTRACT.md v0.31).
 *
 * No es asesoría legal y la pantalla lo dice: es un punto de partida que la municipalidad copia y
 * desde ese momento son filas suyas, que edita o borra sin que la plataforma tenga nada que opinar.
 */
export interface MockHoliday {
  code: string;
  name: string;
  kind: 'FIXED' | 'EASTER';
  month: number | null;
  day: number | null;
  easterOffsetDays: number | null;
  observance: 'EXACT' | 'MONDAY';
}

export const MOCK_HOLIDAYS_CR: MockHoliday[] = [
  { code: 'CR_ANO_NUEVO', name: 'Año Nuevo', kind: 'FIXED', month: 1, day: 1, easterOffsetDays: null, observance: 'EXACT' },
  { code: 'CR_JUEVES_SANTO', name: 'Jueves Santo', kind: 'EASTER', month: null, day: null, easterOffsetDays: -3, observance: 'EXACT' },
  { code: 'CR_VIERNES_SANTO', name: 'Viernes Santo', kind: 'EASTER', month: null, day: null, easterOffsetDays: -2, observance: 'EXACT' },
  { code: 'CR_JUAN_SANTAMARIA', name: 'Día de Juan Santamaría', kind: 'FIXED', month: 4, day: 11, easterOffsetDays: null, observance: 'MONDAY' },
  { code: 'CR_DIA_TRABAJO', name: 'Día Internacional del Trabajo', kind: 'FIXED', month: 5, day: 1, easterOffsetDays: null, observance: 'EXACT' },
  { code: 'CR_ANEXION_NICOYA', name: 'Anexión del Partido de Nicoya', kind: 'FIXED', month: 7, day: 25, easterOffsetDays: null, observance: 'MONDAY' },
  { code: 'CR_VIRGEN_ANGELES', name: 'Virgen de los Ángeles', kind: 'FIXED', month: 8, day: 2, easterOffsetDays: null, observance: 'EXACT' },
  { code: 'CR_DIA_MADRE', name: 'Día de la Madre', kind: 'FIXED', month: 8, day: 15, easterOffsetDays: null, observance: 'MONDAY' },
  { code: 'CR_CULTURA_AFRO', name: 'Día de la Persona Negra y la Cultura Afrocostarricense', kind: 'FIXED', month: 8, day: 31, easterOffsetDays: null, observance: 'MONDAY' },
  { code: 'CR_INDEPENDENCIA', name: 'Día de la Independencia', kind: 'FIXED', month: 9, day: 15, easterOffsetDays: null, observance: 'EXACT' },
  { code: 'CR_ABOLICION', name: 'Día de la Abolición del Ejército', kind: 'FIXED', month: 12, day: 1, easterOffsetDays: null, observance: 'MONDAY' },
  { code: 'CR_NAVIDAD', name: 'Navidad', kind: 'FIXED', month: 12, day: 25, easterOffsetDays: null, observance: 'EXACT' },
];

/** Las excepciones que la municipalidad ya escribió. Se siembran dos, una de cada forma. */
export interface MockException {
  tenantId: string;
  date: string | null;
  charges: boolean;
  chargesAllDay: boolean;
  label: string | null;
  bands: { startMinute: number; endMinute: number; startsAt: string; endsAt: string }[];
  recurrence: 'ONCE' | 'ANNUAL' | 'EASTER';
  month: number | null;
  day: number | null;
  easterOffsetDays: number | null;
  observance: 'EXACT' | 'MONDAY';
  holidayCode: string | null;
}

export const mockScheduleExceptions: MockException[] = [
  {
    tenantId: 'tenant-sanjose',
    date: null,
    charges: false,
    chargesAllDay: false,
    label: 'Día de la Independencia',
    bands: [],
    // Anual: se escribe una vez y sigue siendo cierta el año que viene.
    recurrence: 'ANNUAL',
    month: 9,
    day: 15,
    easterOffsetDays: null,
    observance: 'EXACT',
    holidayCode: 'CR_INDEPENDENCIA',
  },
  {
    tenantId: 'tenant-sanjose',
    date: null,
    charges: false,
    chargesAllDay: false,
    label: 'Viernes Santo',
    bands: [],
    // Se mueve con la Pascua: no hay día del año que lo describa.
    recurrence: 'EASTER',
    month: null,
    day: null,
    easterOffsetDays: -2,
    observance: 'EXACT',
    holidayCode: 'CR_VIERNES_SANTO',
  },
];

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
  /** Se otorgó como cortesía y no se cobró (v0.31). Una por placa y día natural. */
  courtesy?: boolean;
}

const now = Date.now();

export const mockParkingSessions: MockParkingSessionRecord[] = [
  {
    id: 'session-1',
    userId: 'user-citizen-1',
    tenantId: 'tenant-sanjose',
    zoneId: 'zone-centro',
    zoneName: 'Centro',
    spaceId: 'space-lup-0001',
    spaceCode: 'LUP-0001',
    vehicleId: 'vehicle-bhl019',
    plateSnapshot: 'BHL019',
    vehicleType: 'CAR',
    minutes: 60,
    remainingMinutes: 55,
    amountMinor: 55020,
    currencyCode: 'CRC',
    creditMinutesApplied: 0,
    status: 'ACTIVE',
    startedAt: new Date(now - 5 * 60_000).toISOString(),
    expiresAt: new Date(now + 55 * 60_000).toISOString(),
    endedAt: null,
  },
  {
    // Pagó por esta misma bahía y se le venció hace doce minutos: el caso que hasta v0.28 se
    // mostraba idéntico a «nunca pagó» (CONTRACT.md v0.28).
    id: 'session-expired-1',
    userId: 'user-citizen-2',
    tenantId: 'tenant-sanjose',
    zoneId: 'zone-centro',
    zoneName: 'Centro',
    spaceId: 'space-lup-0002',
    spaceCode: 'LUP-0002',
    vehicleId: 'vehicle-crc880',
    plateSnapshot: 'CRC880',
    vehicleType: 'CAR',
    minutes: 30,
    remainingMinutes: 0,
    amountMinor: 30000,
    currencyCode: 'CRC',
    creditMinutesApplied: 0,
    status: 'EXPIRED',
    startedAt: new Date(now - 42 * 60_000).toISOString(),
    expiresAt: new Date(now - 12 * 60_000).toISOString(),
    endedAt: null,
  },
];

/**
 * Permisos y exoneraciones (CONTRACT.md v0.30).
 *
 * La ambulancia es el caso que justifica el modelo entero: no tiene cuenta en la aplicación, nunca
 * la va a tener, y hasta v0.28 era indistinguible de un carro que no pagó.
 *
 * Desde v0.30 un permiso se SOLICITA y luego se resuelve, ampara VARIAS placas y tiene CATEGORÍA y
 * BENEFICIARIO. El simulador sostiene las mismas reglas que el servidor —una aprobada por placa, la
 * última placa no se quita, un rechazo necesita motivo—: cada vez que este simulador ha sido más
 * amable que producción, ha dejado pasar un error hasta la calle.
 */
export type MockExemptionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';

export interface MockExemptionType {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  requiresBeneficiary: boolean;
  active: boolean;
}

/** Las cuatro que siembra V29_0, para cada municipalidad del simulador. */
export const mockExemptionTypes: MockExemptionType[] = ['tenant-sanjose', 'tenant-escazu'].flatMap(
  (tenantId) => [
    {
      id: `${tenantId}-type-disability`,
      tenantId,
      code: 'DISABILITY',
      name: 'Discapacidad',
      description:
        'Persona con discapacidad. El permiso acompaña a la persona, así que suele amparar más de una placa.',
      requiresBeneficiary: true,
      active: true,
    },
    {
      id: `${tenantId}-type-institutional`,
      tenantId,
      code: 'INSTITUTIONAL',
      name: 'Vehículo institucional',
      description: 'Flotilla municipal, emergencias, cuerpos oficiales.',
      requiresBeneficiary: true,
      active: true,
    },
    {
      id: `${tenantId}-type-courtesy`,
      tenantId,
      code: 'COURTESY',
      name: 'Cortesía o autorización',
      description: 'Autorización puntual otorgada por la municipalidad.',
      requiresBeneficiary: false,
      active: true,
    },
    {
      id: `${tenantId}-type-special`,
      tenantId,
      code: 'SPECIAL',
      name: 'Permiso especial',
      description: 'Cualquier otro permiso previsto por la normativa de la municipalidad.',
      requiresBeneficiary: true,
      active: true,
    },
  ],
);

export interface MockExemptionPlate {
  plate: string;
  plateRaw: string;
  status: MockExemptionStatus;
  addedAt: string;
}

export interface MockExemptionDocument {
  id: string;
  exemptionId: string;
  title: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  uploadedByName: string | null;
  createdAt: string;
}

export interface MockExemption {
  id: string;
  tenantId: string;
  /** Obsoleta desde v0.30: copia de la primera de `plates`, para un cliente más viejo. */
  plate: string;
  plateRaw: string;
  plates: MockExemptionPlate[];
  exemptionTypeId: string | null;
  beneficiaryKind: 'PERSON' | 'ORGANISATION' | null;
  beneficiaryName: string | null;
  beneficiaryDocument: string | null;
  reason: string;
  documentRef: string | null;
  status: MockExemptionStatus;
  validFrom: string;
  validTo: string | null;
  requestedAt: string | null;
  requestedByName: string | null;
  requestedBy: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  decidedBy: string | null;
  decisionReason: string | null;
  grantedAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
}

export const mockExemptionDocuments: MockExemptionDocument[] = [
  {
    id: 'exemption-doc-1',
    exemptionId: 'exemption-2',
    title: 'Dictamen de discapacidad',
    contentType: 'application/pdf',
    byteSize: 184_320,
    sha256: 'b9d3a1f0c7e54428a1f0c7e54428b9d3a1f0c7e54428b9d3a1f0c7e54428b9d3',
    uploadedByName: 'Ana Solís',
    createdAt: new Date(now - 20 * 86400_000).toISOString(),
  },
];

export const mockExemptions: MockExemption[] = [
  {
    id: 'exemption-1',
    tenantId: 'tenant-sanjose',
    plate: 'CL1234',
    plateRaw: 'CL-1234',
    plates: [
      {
        plate: 'CL1234',
        plateRaw: 'CL-1234',
        status: 'APPROVED',
        addedAt: new Date(now - 90 * 86400_000).toISOString(),
      },
    ],
    exemptionTypeId: 'tenant-sanjose-type-institutional',
    beneficiaryKind: 'ORGANISATION',
    beneficiaryName: 'Cruz Roja Costarricense',
    beneficiaryDocument: '3-011-045678',
    reason: 'Ambulancia de la Cruz Roja, unidad de emergencias',
    documentRef: 'Acuerdo municipal 2026-014',
    status: 'APPROVED',
    // Sin vencimiento, que es legítimo y se muestra con esas palabras en vez de con una celda vacía.
    validFrom: new Date(now - 90 * 86400_000).toISOString(),
    validTo: null,
    requestedAt: new Date(now - 92 * 86400_000).toISOString(),
    requestedByName: 'Ana Solís',
    requestedBy: 'user-admin-sanjose',
    decidedAt: new Date(now - 90 * 86400_000).toISOString(),
    decidedByName: 'Ana Solís',
    // Misma persona en ambos campos: se permite y por eso se muestra, en vez de dejar que alguien
    // lo note comparando dos nombres.
    decidedBy: 'user-admin-sanjose',
    decisionReason: null,
    grantedAt: new Date(now - 90 * 86400_000).toISOString(),
    revokedAt: null,
    revokeReason: null,
  },
  {
    // Dos placas: el permiso es de la persona y la acompaña — unas veces en su carro y otras en el
    // del hijo que la lleva.
    id: 'exemption-2',
    tenantId: 'tenant-sanjose',
    plate: 'SJP456',
    plateRaw: 'SJP-456',
    plates: [
      {
        plate: 'SJP456',
        plateRaw: 'SJP-456',
        status: 'APPROVED',
        addedAt: new Date(now - 20 * 86400_000).toISOString(),
      },
      {
        plate: 'BMH789',
        plateRaw: 'BMH-789',
        status: 'APPROVED',
        addedAt: new Date(now - 20 * 86400_000).toISOString(),
      },
    ],
    exemptionTypeId: 'tenant-sanjose-type-disability',
    beneficiaryKind: 'PERSON',
    beneficiaryName: 'María Rodríguez Vargas',
    beneficiaryDocument: '1-0876-0543',
    reason: 'Persona con discapacidad permanente; dictamen del CONAPDIS',
    documentRef: null,
    status: 'APPROVED',
    validFrom: new Date(now - 20 * 86400_000).toISOString(),
    validTo: new Date(now + 345 * 86400_000).toISOString(),
    requestedAt: new Date(now - 22 * 86400_000).toISOString(),
    requestedByName: 'Ana Solís',
    requestedBy: 'user-admin-sanjose',
    decidedAt: new Date(now - 20 * 86400_000).toISOString(),
    decidedByName: 'Carlos Méndez',
    decidedBy: 'user-admin-sanjose-2',
    decisionReason: null,
    grantedAt: new Date(now - 20 * 86400_000).toISOString(),
    revokedAt: null,
    revokeReason: null,
  },
  {
    // Esperando resolución. No exonera a nadie: un permiso no otorga nada hasta que se otorga.
    id: 'exemption-3',
    tenantId: 'tenant-sanjose',
    plate: 'CRT321',
    plateRaw: 'crt-321',
    plates: [
      {
        plate: 'CRT321',
        plateRaw: 'crt-321',
        status: 'PENDING',
        addedAt: new Date(now - 2 * 86400_000).toISOString(),
      },
    ],
    exemptionTypeId: 'tenant-sanjose-type-courtesy',
    beneficiaryKind: null,
    beneficiaryName: null,
    beneficiaryDocument: null,
    reason: 'Cortesía por trabajos de la municipalidad frente al inmueble',
    documentRef: null,
    status: 'PENDING',
    validFrom: new Date(now - 2 * 86400_000).toISOString(),
    validTo: new Date(now + 28 * 86400_000).toISOString(),
    requestedAt: new Date(now - 2 * 86400_000).toISOString(),
    requestedByName: 'Ana Solís',
    requestedBy: 'user-admin-sanjose',
    decidedAt: null,
    decidedByName: null,
    decidedBy: null,
    decisionReason: null,
    grantedAt: new Date(now - 2 * 86400_000).toISOString(),
    revokedAt: null,
    revokeReason: null,
  },
];

let mockParkingSessionSequence = 1;
export function nextMockParkingSessionId(): string {
  mockParkingSessionSequence += 1;
  return `session-mock-${mockParkingSessionSequence}`;
}

/** Replay cache for `Idempotency-Key` (CONTRACT.md v0.2 §Invariantes — start/extend/finish never charge twice for one logical operation). */
export const mockIdempotencyResponses = new Map<string, unknown>();
