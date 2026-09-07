import type {
  AdministrativeDivision,
  AdminLevelCatalogEntry,
  AuditEvent,
  CountryCatalogEntry,
  DocumentTypeCatalogEntry,
  FeatureFlag,
  MembershipSummary,
  PlatformTenant,
  Role,
  SystemHealth,
  SystemJob,
  TenantAdmin,
  UserProfile,
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
