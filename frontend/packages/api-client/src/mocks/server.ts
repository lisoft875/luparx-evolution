import type { PagedResponse } from '../types/http';
import type {
  AccessTokenClaims,
  AdminUserDetail,
  AdminUserListItem,
  CreateAdminUserRequest,
  PlateCheckRequest,
  LocationState,
  RequestExemptionRequest,
  AmendExemptionRequest,
  SaveExemptionTypeRequest,
  MembershipStatus,
  CreateStaffInvitationRequest,
  AcceptInvitationRequest,
  CreateMembershipRequest,
  LookupPersonRequest,
  CreateVehicleRequest,
  ExtendParkingSessionRequest,
  LoginRequest,
  MembershipSummary,
  ParkingPolicy,
  ParkingQuoteRequest,
  ParkingQuoteResponse,
  ParkingSessionStatus,
  Portal,
  RegisterRequest,
  Role,
  StartParkingSessionRequest,
  TenantCatalogEntry,
  UpdateProfileRequest,
  UpdateVehicleRequest,
} from '../types/domain';
import { TENANT_GRANTABLE_ROLES } from '../types/domain';
import {
  availableMockCreditMinutes,
  MOCK_ADMIN_LEVELS,
  MOCK_COUNTRIES,
  MOCK_DIVISIONS,
  MOCK_DOCUMENT_TYPES,
  MOCK_VEHICLE_COLORS,
  MOCK_VEHICLE_TYPES,
  MOCK_FEATURE_FLAGS,
  MOCK_PLATFORM_TENANTS,
  MOCK_SYSTEM_HEALTH,
  MOCK_SYSTEM_JOBS,
  MOCK_TENANTS,
  mockAuditEvents,
  mockIdempotencyResponses,
  mockParkingPolicyForTenant,
  mockParkingSessions,
  mockTenantSettings,
  mockTimeCredits,
  mockExemptions,
  mockExemptionTypes,
  mockExemptionDocuments,
  mockUsersById,
  mockVehicles,
  mockWallets,
  mockZoneRate,
  nextMockParkingSessionId,
  nextMockUserId,
  nextMockVehicleId,
  normalizeMockPlate,
  recordAuditEvent,
  walletKey,
  type MockParkingSessionRecord,
  type MockExemption,
  type MockExemptionType,
  type MockExemptionDocument,
  type MockUserRecord,
} from './data';
import { mintMockTokenPair } from './token';

/**
 * Which sectors each post covers (CONTRACT.md v0.15). Absent, or empty, means the whole
 * municipality — the same rule the server keeps, so a preview cannot show a behaviour production
 * does not have.
 */
const mockMembershipZones = new Map<string, string[]>();

/**
 * Cuándo se usó cada PUESTO por última vez (CONTRACT.md v0.27), por id de membresía.
 *
 * Aparte del último ingreso de la persona a propósito: son dos preguntas distintas, y confundirlas
 * es el defecto que v0.27 arregla. El mock siembra un puesto usado y otro sin uso registrado, para
 * que la pantalla tenga que decir las dos cosas.
 */
const mockMembershipLastUsed = new Map<string, string>([
  ['membership-4', new Date(Date.now() - 3 * 86400000).toISOString()],
]);

/** Invitaciones vivas y respondidas de la sesión de vista previa (CONTRACT.md v0.27). */
interface MockInvitation {
  id: string;
  tenantId: string;
  email: string;
  portal: Portal;
  role: Role;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED';
  token: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}
const mockInvitations: MockInvitation[] = [];

/**
 * El registro de consultas de fiscalización (CONTRACT.md v0.29).
 *
 * Se siembra con un turno corto —una consulta que terminó en boleta, una que no, y una rechazada por
 * zona no asignada— y además se llena durante la sesión: la gracia es ver las dos cosas, que la
 * pantalla tiene qué mostrar y que consultar deja rastro.
 */
interface MockEnforcementCheck {
  id: string;
  tenantId: string;
  inspectorUserId: string;
  inspectorName: string | null;
  plate: string;
  plateRaw: string;
  zoneId: string | null;
  zoneName: string | null;
  spaceCode: string | null;
  verdict: string | null;
  refusalCode: string | null;
  locationState: LocationState;
  latitude: number | null;
  longitude: number | null;
  locationAccuracyM: number | null;
  userAgent: string | null;
  citationIssued: boolean;
  occurredAt: string;
}
const mockEnforcementChecks: MockEnforcementCheck[] = [
  {
    id: 'check-seed-1',
    tenantId: 'tenant-sanjose',
    inspectorUserId: 'user-inspector-1',
    inspectorName: 'Ana Vargas',
    plate: 'XYZ999',
    plateRaw: 'XYZ-999',
    zoneId: 'zone-centro',
    zoneName: 'Centro',
    spaceCode: 'LUP-0003',
    verdict: 'NOT_COVERED',
    refusalCode: null,
    locationState: 'FIX',
    latitude: 9.9321,
    longitude: -84.0795,
    locationAccuracyM: 8,
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
    citationIssued: true,
    occurredAt: new Date(Date.now() - 55 * 60_000).toISOString(),
  },
  {
    id: 'check-seed-2',
    tenantId: 'tenant-sanjose',
    inspectorUserId: 'user-inspector-1',
    inspectorName: 'Ana Vargas',
    plate: 'BHL019',
    plateRaw: 'BHL019',
    zoneId: 'zone-centro',
    zoneName: 'Centro',
    spaceCode: 'LUP-0001',
    verdict: 'COVERED',
    refusalCode: null,
    // Permiso dado y sin fijación: el caso que hasta v0.29 se veía igual que «no dio permiso».
    locationState: 'NO_FIX',
    latitude: null,
    longitude: null,
    locationAccuracyM: null,
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
    citationIssued: false,
    occurredAt: new Date(Date.now() - 47 * 60_000).toISOString(),
  },
  {
    id: 'check-seed-3',
    tenantId: 'tenant-sanjose',
    inspectorUserId: 'user-inspector-1',
    inspectorName: 'Ana Vargas',
    plate: 'AAA111',
    plateRaw: 'aaa-111',
    zoneId: 'zone-sabana',
    zoneName: 'La Sabana',
    spaceCode: 'LUP-0400',
    // Rechazada: consultó una zona que no cubre. Hasta v0.29 no quedaba constancia de que ocurriera.
    verdict: null,
    refusalCode: 'ZONE_NOT_ASSIGNED',
    locationState: 'NOT_GRANTED',
    latitude: null,
    longitude: null,
    locationAccuracyM: null,
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
    citationIssued: false,
    occurredAt: new Date(Date.now() - 40 * 60_000).toISOString(),
  },
];

/**
 * Token predecible, sólo en el mock.
 *
 * El servidor real usa un aleatorio criptográfico y guarda su hash; aquí el punto es que la vista
 * previa sea recorrible entera —invitar en el panel y abrir el enlace— sin que nadie tenga que
 * espiar el estado interno del transporte. Esto no existe en producción.
 */
function mockInvitationToken(email: string): string {
  return `tok-${email}`;
}

/** Zones an administrator created in this session, on top of the fixture's own (CONTRACT.md v0.16). */
interface MockAdminZone {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  divisionId: string | null;
  active: boolean;
}
const mockExtraZones: MockAdminZone[] = [];
const mockSeededZones: MockAdminZone[] = [
  { id: 'zone-centro', tenantId: 'tenant-sanjose', code: 'SJ-CENTRO', name: 'Centro', description: null, divisionId: null, active: true },
  // Two more sectors of San José, named as the real development seeder names them
  // (`DevMunicipalities.SAN_JOSE`). One of them is deliberately left WITHOUT a rate: a municipality
  // whose every zone is priced cannot show what an unpriced zone looks like, and an unpriced zone is
  // one a citizen simply cannot park in. A fixture that never reaches that state hides the bug.
  { id: 'zone-escalante', tenantId: 'tenant-sanjose', code: 'SJ-ESCALANTE', name: 'Barrio Escalante', description: 'Calle 33, zona de restaurantes con alta rotación nocturna.', divisionId: null, active: true },
  { id: 'zone-sabana', tenantId: 'tenant-sanjose', code: 'SJ-SABANA', name: 'La Sabana', description: 'Costados del Parque Metropolitano y el Estadio Nacional.', divisionId: null, active: true },
  { id: 'zone-escazu-centro', tenantId: 'tenant-escazu', code: 'ESC-CENTRO', name: 'Centro', description: null, divisionId: null, active: true },
];
function mockAdminZones(tenantId: string | null): MockAdminZone[] {
  return [...mockSeededZones, ...mockExtraZones].filter((z) => !tenantId || z.tenantId === tenantId);
}

/**
 * The policy a municipality has edited in this demo build, keyed by tenant.
 *
 * <p>Not seeded: an absent entry means "this municipality has not configured anything yet", and the
 * answer is the deployment's defaults — the server's own behaviour, where the first read
 * materialises the row from `platform.defaults.parking.*` rather than from a constant.</p>
 */
const mockAdminPolicies = new Map<string, ParkingPolicy & { updatedAt: string }>();

function mockAdminPolicy(tenantId: string | null): ParkingPolicy & { updatedAt: string } {
  const edited = mockAdminPolicies.get(tenantId ?? '');
  if (edited) return edited;
  return { ...mockParkingPolicyForTenant(tenantId), updatedAt: '2026-01-15T10:00:00.000Z' };
}

const mockAdminSpaces: { id: string; zoneId: string; code: string; status: 'AVAILABLE' | 'OUT_OF_SERVICE' }[] = [
  { id: 'space-lup-0001', zoneId: 'zone-centro', code: 'LUP-0001', status: 'AVAILABLE' },
  { id: 'space-lup-0002', zoneId: 'zone-centro', code: 'LUP-0002', status: 'AVAILABLE' },
  { id: 'space-lup-0003', zoneId: 'zone-centro', code: 'LUP-0003', status: 'OUT_OF_SERVICE' },
];

const mockAdminRates: { id: string; zoneId: string; kind: 'BLOCK' | 'EXACT'; amountMinor: number; currencyCode: string; minutes: number; validFrom: string; validTo: string | null }[] = [
  { id: 'rate-1', zoneId: 'zone-centro', kind: 'BLOCK', amountMinor: 55000, currencyCode: 'CRC', minutes: 60, validFrom: new Date(Date.now() - 90 * 864e5).toISOString(), validTo: null },
  { id: 'rate-0', zoneId: 'zone-centro', kind: 'BLOCK', amountMinor: 40000, currencyCode: 'CRC', minutes: 60, validFrom: new Date(Date.now() - 400 * 864e5).toISOString(), validTo: new Date(Date.now() - 90 * 864e5).toISOString() },
  // Escalante is priced by the half hour, so the screen shows two zones that are NOT comparable by
  // amount alone — which is the whole reason the block travels with the price.
  { id: 'rate-2', zoneId: 'zone-escalante', kind: 'BLOCK', amountMinor: 40000, currencyCode: 'CRC', minutes: 30, validFrom: new Date(Date.now() - 30 * 864e5).toISOString(), validTo: null },
  // La escalera de SJ-CENTRO, DELIBERADAMENTE NO LINEAL: 45 minutos cuesta menos que tres bloques
  // de 15, que es exactamente lo que la tarifa lineal no puede expresar. Una escalera lineal en el
  // fixture dejaría pasar sin ruido una regresión en la resolución por duración.
  { id: 'rung-15', zoneId: 'zone-centro', kind: 'EXACT', amountMinor: 15000, currencyCode: 'CRC', minutes: 15, validFrom: new Date(Date.now() - 30 * 864e5).toISOString(), validTo: null },
  { id: 'rung-30', zoneId: 'zone-centro', kind: 'EXACT', amountMinor: 30000, currencyCode: 'CRC', minutes: 30, validFrom: new Date(Date.now() - 30 * 864e5).toISOString(), validTo: null },
  { id: 'rung-45', zoneId: 'zone-centro', kind: 'EXACT', amountMinor: 40000, currencyCode: 'CRC', minutes: 45, validFrom: new Date(Date.now() - 30 * 864e5).toISOString(), validTo: null },
  { id: 'rung-120', zoneId: 'zone-centro', kind: 'EXACT', amountMinor: 90000, currencyCode: 'CRC', minutes: 120, validFrom: new Date(Date.now() - 30 * 864e5).toISOString(), validTo: null },
  // 60 minutos NO tiene peldaño a propósito: lo cobra la base (₡550), y así la pantalla muestra las
  // dos formas de precio en la misma zona.
  // `zone-sabana` has none, on purpose: see the note on mockSeededZones.
];

/** The stored row as the server sends it: the amount wrapped in a `MoneyDto`. */
function toWireRate(rate: (typeof mockAdminRates)[number]): unknown {
  return {
    id: rate.id,
    zoneId: rate.zoneId,
    kind: rate.kind,
    amount: { amountMinor: rate.amountMinor, currencyCode: rate.currencyCode },
    minutes: rate.minutes,
    validFrom: rate.validFrom,
    validTo: rate.validTo,
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}

function problem(
  status: number,
  code: string,
  title: string,
  detail?: string,
  errors?: { field: string; code: string; message: string }[],
): Response {
  return new Response(JSON.stringify({ type: 'about:blank', title, status, code, detail, errors }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

/** A completed side-effecting mock response, cached by `Idempotency-Key` so a retried request (a double tap included) replays it instead of running the operation twice. */
function idempotentResult(idempotencyKey: string | null, opKey: string, compute: () => { data: unknown; status: number }): Response {
  const cacheKey = idempotencyKey ? `${opKey}:${idempotencyKey}` : null;
  if (cacheKey) {
    const cached = mockIdempotencyResponses.get(cacheKey) as { data: unknown; status: number } | undefined;
    if (cached) return json(cached.data, cached.status);
  }
  const result = compute();
  if (cacheKey) mockIdempotencyResponses.set(cacheKey, result);
  return json(result.data, result.status);
}

interface RefreshRecord {
  userId: string;
  portal: Portal;
  tenantId: string | null;
}
const refreshTokens = new Map<string, RefreshRecord>();

function roleForPortal(portal: Portal): Role {
  if (portal === 'admin') return 'TENANT_ADMIN';
  if (portal === 'inspector') return 'INSPECTOR';
  return 'CITIZEN';
}

function findUserByEmail(email: string): MockUserRecord | undefined {
  const normalized = email.trim().toLowerCase();
  return [...mockUsersById.values()].find((record) => record.profile.email === normalized);
}

function membershipForPortal(user: MockUserRecord, portal: Portal): MembershipSummary | undefined {
  return user.memberships.find((membership) => membership.portal === portal);
}

function activeMembershipsForPortal(user: MockUserRecord, portal: Portal): MembershipSummary[] {
  return user.memberships.filter((membership) => membership.portal === portal && membership.status === 'ACTIVE');
}

/**
 * The municipality a fresh session resolves to, mirroring the real server (CONTRACT.md v0.4): one
 * active membership resolves itself, several resolve to nothing and the account is asked to choose.
 * Returning the first of several here would hide the whole picker from anyone developing on mocks.
 */
function autoResolvedTenantId(user: MockUserRecord, portal: Portal): string | null {
  const active = activeMembershipsForPortal(user, portal);
  return active.length === 1 ? active[0]!.tenantId : null;
}

/** The catalogue shape of a municipality, branding included, from the mock tenant table. */
function tenantCatalogEntry(tenantId: string | null | undefined): TenantCatalogEntry | null {
  if (!tenantId) return null;
  const tenant = MOCK_TENANTS.find((candidate) => candidate.id === tenantId);
  if (!tenant) return null;
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    countryCode: tenant.countryCode,
    shortName: tenant.shortName ?? null,
    logoUrl: tenant.logoUrl ?? null,
    brandColor: tenant.brandColor ?? null,
  };
}

/** Platform-scope roles bypass `tenant_memberships` entirely (see MockUserRecord.platformRole). */
function rolesForLogin(user: MockUserRecord, portal: Portal, membership: MembershipSummary | undefined): Role[] {
  if (portal === 'platform') return user.platformRole ? [user.platformRole] : [];
  return membership ? [membership.role] : [];
}

function toListItem(user: MockUserRecord): AdminUserListItem {
  return {
    id: user.profile.id,
    email: user.profile.email,
    fullName: [user.profile.givenName, user.profile.familyName, user.profile.secondFamilyName]
      .filter(Boolean)
      .join(' '),
    status: user.profile.status,
    createdAt: '2026-01-15T10:00:00Z',
    memberships: user.memberships,
  };
}

function toDetail(user: MockUserRecord): AdminUserDetail {
  return {
    ...toListItem(user),
    givenName: user.profile.givenName,
    familyName: user.profile.familyName,
    secondFamilyName: user.profile.secondFamilyName,
    birthDate: user.profile.birthDate,
    nationalityCode: user.profile.nationalityCode,
    phone: user.profile.phone,
    identityDocument: user.profile.identityDocument,
    address: user.profile.address,
  };
}

async function readBody<T>(init?: RequestInit): Promise<T> {
  if (!init?.body) return {} as T;
  return JSON.parse(String(init.body)) as T;
}

function paginate<T>(items: T[], page: number, size: number): PagedResponse<T> {
  const start = page * size;
  const pageItems = items.slice(start, start + size);
  return {
    items: pageItems,
    page,
    size,
    totalElements: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / size)),
  };
}

/**
 * A hand-rolled mock transport (not MSW — see frontend/README.md) matching
 * the `fetch` signature exactly, so it drops in as `HttpClient`'s
 * `fetchImpl` with zero changes to calling code. Activated only when
 * `VITE_USE_MOCKS=true`.
 */
export async function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input.toString());
  const path = url.pathname;
  const method = (init?.method ?? 'GET').toUpperCase();
  const segments = path.split('/').filter(Boolean); // ["api","v1", ...]

  // GET /api/v1/catalog/countries
  if (method === 'GET' && path === '/api/v1/catalog/countries') {
    return json(MOCK_COUNTRIES);
  }
  // GET /api/v1/catalog/countries/{code}/admin-levels
  if (
    method === 'GET' &&
    segments[2] === 'catalog' &&
    segments[3] === 'countries' &&
    segments[5] === 'admin-levels'
  ) {
    const code = segments[4]?.toUpperCase() ?? '';
    return json(MOCK_ADMIN_LEVELS[code] ?? []);
  }
  // GET /api/v1/catalog/countries/{code}/divisions?parentId=&level=
  if (
    method === 'GET' &&
    segments[2] === 'catalog' &&
    segments[3] === 'countries' &&
    segments[5] === 'divisions'
  ) {
    const code = segments[4]?.toUpperCase() ?? '';
    const parentId = url.searchParams.get('parentId');
    const level = url.searchParams.get('level');
    const all = MOCK_DIVISIONS[code] ?? [];
    const filtered = all.filter((division) => {
      const levelMatches = level ? division.level === Number(level) : true;
      const parentMatches = parentId ? division.parentId === parentId : division.parentId === null;
      return levelMatches && parentMatches;
    });
    return json(filtered);
  }
  // GET /api/v1/catalog/countries/{code}/document-types
  if (
    method === 'GET' &&
    segments[2] === 'catalog' &&
    segments[3] === 'countries' &&
    segments[5] === 'document-types'
  ) {
    const code = segments[4]?.toUpperCase() ?? '';
    return json(MOCK_DOCUMENT_TYPES[code] ?? []);
  }
  // GET /api/v1/catalog/vehicle-types | /vehicle-colors — platform-wide enumerations, `{value, labelKey}`.
  if (method === 'GET' && path === '/api/v1/catalog/vehicle-types') {
    return json(MOCK_VEHICLE_TYPES);
  }
  if (method === 'GET' && path === '/api/v1/catalog/vehicle-colors') {
    return json(MOCK_VEHICLE_COLORS);
  }
  // GET /api/v1/catalog/tenants
  if (method === 'GET' && path === '/api/v1/catalog/tenants') {
    const country = url.searchParams.get('country');
    const items = country ? MOCK_TENANTS.filter((t) => t.countryCode === country) : MOCK_TENANTS;
    return json(items.map((tenant) => tenantCatalogEntry(tenant.id)));
  }

  // GET /api/v1/catalog/tenants/{id}/locales — public, the login screen needs it before auth.
  if (method === 'GET' && segments[2] === 'catalog' && segments[3] === 'tenants' && segments[5] === 'locales') {
    return json(mockTenantLocales(segments[4] ?? null).filter((l) => l.enabled).map(({ locale, isDefault, sortOrder }) => ({ locale, isDefault, sortOrder })));
  }

  // ---- Auth: /api/v1/auth/{portal}/... -------------------------------------------------------
  // ---- Aceptar una invitación (CONTRACT.md v0.27). SIN autenticación, a propósito: quien sigue el
  // enlace todavía no tiene cuenta.
  if (segments[2] === 'invitations' && segments[3]) {
    const token = decodeURIComponent(segments[3]);
    const invitation = mockInvitations.find((i) => i.token === token);
    const usable = invitation
      && invitation.status === 'PENDING'
      && new Date(invitation.expiresAt) > new Date();
    if (invitation?.status === 'ACCEPTED') {
      return problem(409, 'INVITATION_ALREADY_ACCEPTED', 'That invitation has already been used');
    }
    if (invitation && invitation.status === 'PENDING' && !usable) {
      return problem(409, 'INVITATION_EXPIRED', 'That invitation has expired');
    }
    // Una revocada se contesta como inexistente: la municipalidad la retiró y quien tiene el enlace
    // no tiene por qué enterarse de más.
    if (!invitation || !usable) {
      return problem(404, 'INVITATION_NOT_FOUND', 'No usable invitation behind that link');
    }
    const tenant = MOCK_TENANTS.find((x) => x.id === invitation.tenantId);
    if (method === 'GET' && !segments[4]) {
      return json({
        tenantName: tenant?.name ?? invitation.tenantId,
        email: invitation.email,
        portal: invitation.portal,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      });
    }
    if (method === 'POST' && segments[4] === 'accept') {
      const payload = await readBody<AcceptInvitationRequest>(init);
      const newId = nextMockUserId();
      mockUsersById.set(newId, {
        profile: {
          id: newId,
          // Del la invitación, NUNCA del cuerpo: si el cuerpo pudiera traer una dirección, una
          // invitación sería una forma de abrirle cuenta al buzón de otra persona.
          email: invitation.email,
          // Seguir un enlace mandado a esa dirección ya prueba el buzón.
          emailVerified: true,
          givenName: payload.givenName,
          familyName: payload.familyName,
          secondFamilyName: payload.secondFamilyName,
          birthDate: payload.birthDate,
          nationalityCode: payload.nationalityCode,
          phone: payload.phone,
          identityDocument: payload.identityDocument,
          address: payload.address,
          locale: payload.locale ?? 'es-CR',
          timeZone: payload.timeZone ?? 'America/Costa_Rica',
          status: 'ACTIVE' as const,
        },
        // Suya, elegida por ella: es la diferencia con una cuenta abierta por un operador.
        password: payload.password,
        memberships: [
          {
            id: `membership-${crypto.randomUUID()}`,
            tenantId: invitation.tenantId,
            tenantName: tenant?.name ?? invitation.tenantId,
            tenantShortName: tenant?.shortName ?? null,
            tenantLogoUrl: null,
            tenantBrandColor: tenant?.brandColor ?? null,
            portal: invitation.portal,
            role: invitation.role,
            status: 'ACTIVE',
          },
        ],
      });
      invitation.status = 'ACCEPTED';
      invitation.acceptedAt = new Date().toISOString();
      recordAuditEvent({
        tenantId: invitation.tenantId,
        actorUserId: newId,
        actorPortal: invitation.portal,
        action: 'STAFF_INVITATION_ACCEPTED',
        resourceType: 'staff-invitation',
        resourceId: invitation.id,
        metadata: { role: invitation.role },
      });
      return json({
        userId: newId,
        portal: invitation.portal,
        role: invitation.role,
        tenantName: tenant?.name ?? invitation.tenantId,
      }, 201);
    }
  }

  if (segments[2] === 'auth') {
    const portal = segments[3] as Portal;
    const action = segments.slice(4).join('/');

    if (method === 'POST' && action === 'register') {
      // Only the citizen portal opens accounts by itself (CONTRACT.md v0.13). The mock refuses the
      // rest the way the server does, so a preview cannot demonstrate a flow production forbids.
      if (portal !== 'citizen') {
        return problem(403, 'SELF_REGISTRATION_DISABLED', 'Self-registration is disabled for this portal');
      }
      const payload = await readBody<RegisterRequest>(init);
      if (findUserByEmail(payload.email)) {
        return problem(409, 'EMAIL_ALREADY_REGISTERED', 'Email already registered');
      }
      // A citizen membership is active on the spot; nothing self-registered waits for approval.
      const requiresApproval = false;
      const id = nextMockUserId();
      const record: MockUserRecord = {
        profile: {
          id,
          email: payload.email.toLowerCase(),
          emailVerified: false,
          givenName: payload.givenName,
          familyName: payload.familyName,
          secondFamilyName: payload.secondFamilyName,
          birthDate: payload.birthDate,
          nationalityCode: payload.nationalityCode,
          phone: payload.phone,
          identityDocument: payload.identityDocument,
          address: payload.address,
          locale: payload.locale,
          timeZone: payload.timeZone,
          status: 'PENDING_VERIFICATION',
        },
        password: payload.password,
        memberships: payload.tenantId
          ? [
              {
                tenantId: payload.tenantId,
                tenantName: MOCK_TENANTS.find((t) => t.id === payload.tenantId)?.name ?? payload.tenantId,
                portal,
                role: roleForPortal(portal),
                status: requiresApproval ? 'PENDING_APPROVAL' : 'ACTIVE',
              },
            ]
          : [],
      };
      mockUsersById.set(id, record);
      recordAuditEvent({
        tenantId: payload.tenantId ?? null,
        actorUserId: id,
        actorPortal: portal,
        action: 'USER_REGISTERED',
        resourceType: 'user',
        resourceId: id,
        metadata: { portal },
      });
      return json(
        { userId: id, status: record.profile.status, requiresEmailVerification: true, requiresApproval },
        201,
      );
    }

    if (method === 'POST' && action === 'login') {
      const payload = await readBody<LoginRequest>(init);
      const user = findUserByEmail(payload.email);
      if (!user || user.password !== payload.password) {
        return problem(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
      }
      const membership = membershipForPortal(user, portal);
      const resolvedTenantId = autoResolvedTenantId(user, portal);
      const tokens = mintMockTokenPair(user, portal, resolvedTenantId, rolesForLogin(user, portal, membership));
      refreshTokens.set(tokens.refreshToken, {
        userId: user.profile.id,
        portal,
        tenantId: resolvedTenantId,
      });
      return json(tokens);
    }


    if (method === 'POST' && action === 'refresh') {
      const payload = await readBody<{ refreshToken: string }>(init);
      const record = refreshTokens.get(payload.refreshToken);
      if (!record) return problem(401, 'REFRESH_TOKEN_INVALID', 'Refresh token invalid or reused');
      refreshTokens.delete(payload.refreshToken);
      const user = mockUsersById.get(record.userId);
      if (!user) return problem(404, 'USER_NOT_FOUND', 'User not found');
      const membership = membershipForPortal(user, record.portal);
      const tokens = mintMockTokenPair(user, record.portal, record.tenantId, rolesForLogin(user, record.portal, membership));
      refreshTokens.set(tokens.refreshToken, record);
      return json({ tokens });
    }

    if (method === 'POST' && action === 'logout') {
      const payload = await readBody<{ refreshToken: string }>(init);
      refreshTokens.delete(payload.refreshToken);
      return noContent();
    }

    if (method === 'POST' && action === 'password/forgot') {
      return new Response(null, { status: 202 });
    }
    if (method === 'POST' && action === 'password/reset') {
      return noContent();
    }
    if (method === 'POST' && action === 'email/verify') {
      return noContent();
    }
  }

  // ---- Session / profile: /api/v1/{portal}/me... ---------------------------------------------
  if (segments[3] === 'me' || segments[3] === 'session') {
    const portal = segments[2] as Portal;
    const authHeader = new Headers(init?.headers).get('Authorization');
    const claims = authHeader ? decodeMockClaims(authHeader) : null;
    const userId = claims?.sub ?? null;
    const sessionTenantId = claims?.tid ?? null;
    const user = userId ? mockUsersById.get(userId) : undefined;
    if (!user) return problem(401, 'UNAUTHORIZED', 'Missing or invalid session');

    if (method === 'GET' && segments[3] === 'me' && segments.length === 4) {
      return json({
        user: user.profile,
        memberships: user.memberships,
        activeTenant: tenantCatalogEntry(sessionTenantId),
      });
    }
    if (method === 'PUT' && segments[3] === 'me' && segments.length === 4) {
      const payload = await readBody<UpdateProfileRequest>(init);
      // Everything of CONTRACT.md §2 except the e-mail, which has its own verified flow below.
      user.profile = {
        ...user.profile,
        givenName: payload.givenName,
        familyName: payload.familyName,
        secondFamilyName: payload.secondFamilyName,
        identityDocument: payload.identityDocument,
        address: payload.address,
        phone: payload.phone,
        nationalityCode: payload.nationalityCode,
        birthDate: payload.birthDate,
        locale: payload.locale,
        timeZone: payload.timeZone,
      };
      return json({
        user: user.profile,
        memberships: user.memberships,
        activeTenant: tenantCatalogEntry(sessionTenantId),
      });
    }
    if (method === 'POST' && path.endsWith('/me/password')) {
      const payload = await readBody<{ currentPassword: string; newPassword: string }>(init);
      if (payload.currentPassword !== user.password) {
        return problem(422, 'INVALID_CREDENTIALS', 'The current password is not correct');
      }
      user.password = payload.newPassword;
      return noContent();
    }
    if (method === 'POST' && path.endsWith('/me/email')) {
      // The current address stays in place until the new one is verified (CONTRACT.md v0.3).
      await readBody<{ newEmail: string }>(init);
      return noContent();
    }
    if (method === 'GET' && path.endsWith('/me/memberships')) {
      return json(user.memberships.filter((m) => m.portal === portal));
    }
    if (method === 'POST' && path.endsWith('/session/tenant')) {
      const payload = await readBody<{ tenantId: string }>(init);
      const membership = user.memberships.find((m) => m.tenantId === payload.tenantId && m.portal === portal);
      if (!membership || membership.status !== 'ACTIVE') {
        return problem(403, 'MEMBERSHIP_NOT_ACTIVE', 'Membership is not active for this tenant');
      }
      const tokens = mintMockTokenPair(user, portal, membership.tenantId, [membership.role]);
      refreshTokens.set(tokens.refreshToken, { userId: user.profile.id, portal, tenantId: membership.tenantId });
      return json({ tokens, activeTenant: tenantCatalogEntry(membership.tenantId) });
    }
  }

  // ---- Admin: users, memberships, audit, reports, exports, tenants ---------------------------
  if (segments[2] === 'admin') {
    const resource = segments[3];
    // The municipality being administered, from the caller's own token — never from the body, the
    // same rule the server keeps.
    const adminClaims = (() => {
      const header = new Headers(init?.headers).get('Authorization');
      return header ? decodeMockClaims(header) : null;
    })();
    const tenantId = adminClaims?.tid ?? null;

    // ---- Municipal operation settings (CONTRACT.md v0.3) --------------------------------------
    if (resource === 'settings' && segments[4] === 'locales') {
      const authHeader = new Headers(init?.headers).get('Authorization');
      const claims = authHeader ? decodeMockClaims(authHeader) : null;
      const tenantId = claims?.tid ?? null;
      if (method === 'GET') {
        return json({ locales: mockTenantLocales(tenantId), platformDefaultLocale: MOCK_PLATFORM_DEFAULT_LOCALE });
      }
      if (method === 'PUT') {
        const payload = await readBody<{ locales: MockTenantLocale[] }>(init);
        if (!payload.locales.some((l) => l.enabled)) {
          return problem(422, 'LOCALE_LIST_EMPTY', 'At least one locale has to stay enabled');
        }
        if (payload.locales.filter((l) => l.enabled && l.isDefault).length !== 1) {
          return problem(422, 'LOCALE_DEFAULT_REQUIRED', 'Exactly one enabled locale has to be the default');
        }
        mockTenantLocalesByTenant.set(tenantId ?? '', payload.locales);
        return json({ locales: payload.locales, platformDefaultLocale: MOCK_PLATFORM_DEFAULT_LOCALE });
      }
    }

    if (resource === 'parking' && segments[4] === 'space-format') {
      if (method === 'GET') return json(mockSpaceFormat());
      if (method === 'PUT') {
        const payload = await readBody<{ prefix: string; digits: number; allowLetters: boolean }>(init);
        return json(buildMockSpaceFormat(payload.prefix, payload.digits, payload.allowLetters));
      }
    }

    if (resource === 'parking' && segments[4] === 'schedule') {
      if (method === 'GET') return json(mockChargingSchedule());
      if (method === 'PUT') {
        const payload = await readBody<Record<string, unknown>>(init);
        return json({ ...(mockChargingSchedule() as Record<string, unknown>), ...payload, updatedAt: new Date().toISOString() });
      }
    }

    // --- the parking policy, read and replaced whole (CONTRACT.md v0.18) -----------------------
    if (resource === 'parking' && segments[4] === 'policy') {
      if (method === 'GET') return json(mockAdminPolicy(tenantId));
      if (method === 'PUT') {
        const payload = await readBody<Record<string, unknown>>(init);
        // The coherence rules the server enforces, mirrored so the screen is exercised against the
        // refusals and not against a mock that says yes to everything.
        const problems: { field: string; code: string; message: string }[] = [];
        const increments = (payload.sessionIncrementsMinutes as number[]) ?? [];
        const extensionIncrements = (payload.extensionIncrementsMinutes as number[]) ?? [];
        const min = Number(payload.sessionMinMinutes);
        const max = Number(payload.sessionMaxMinutes);
        if (increments.length === 0) {
          problems.push({ field: 'sessionIncrementsMinutes', code: 'VALIDATION_FAILED', message: 'Required' });
        }
        if (!(min > 0)) problems.push({ field: 'sessionMinMinutes', code: 'VALIDATION_FAILED', message: 'Invalid' });
        if (max < min) problems.push({ field: 'sessionMaxMinutes', code: 'VALIDATION_FAILED', message: 'Invalid' });
        if (payload.extensionEnabled === true && extensionIncrements.length === 0) {
          problems.push({ field: 'extensionIncrementsMinutes', code: 'VALIDATION_FAILED', message: 'Required' });
        }
        if (Number(payload.extensionMaxTotalMinutes) < max) {
          problems.push({ field: 'extensionMaxTotalMinutes', code: 'VALIDATION_FAILED', message: 'Invalid' });
        }
        if (payload.creditOnEarlyFinishEnabled === true && payload.earlyFinishEnabled !== true) {
          problems.push({ field: 'creditOnEarlyFinishEnabled', code: 'VALIDATION_FAILED', message: 'Invalid' });
        }
        if (problems.length > 0) return problem(400, 'VALIDATION_FAILED', 'Validation failed', undefined, problems);
        // Canonicalised on write exactly as `MinuteIncrements` does: sorted, positive, unique.
        const canonical = (values: number[]) =>
          [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
        const stored = {
          ...mockAdminPolicy(tenantId),
          ...payload,
          sessionIncrementsMinutes: canonical(increments),
          extensionIncrementsMinutes: canonical(extensionIncrements),
          updatedAt: new Date().toISOString(),
        };
        mockAdminPolicies.set(tenantId ?? '', stored as ParkingPolicy & { updatedAt: string });
        return json(stored);
      }
    }

    // --- zones, bays and tariffs, as the administrator sees them (CONTRACT.md v0.16) ------------
    if (resource === 'parking' && segments[4] === 'zones') {
      if (method === 'GET' && segments.length === 5) {
        return json(mockAdminZones(tenantId).map((zone) => ({
          ...zone,
          spaceCount: mockAdminSpaces.filter((s) => s.zoneId === zone.id).length,
        })));
      }
      if (method === 'POST' && segments.length === 5) {
        const payload = await readBody<{ code: string; name: string; description?: string }>(init);
        const code = payload.code.trim().toUpperCase();
        const zones = mockAdminZones(tenantId);
        if (zones.some((z) => z.code === code)) {
          return problem(409, 'PARKING_ZONE_CODE_TAKEN', 'That code is already in use here');
        }
        const zone = {
          id: `zone-${crypto.randomUUID()}`,
          tenantId: tenantId ?? '',
          code,
          name: payload.name.trim(),
          description: payload.description ?? null,
          divisionId: null,
          active: true,
        };
        mockExtraZones.push(zone);
        return json({ ...zone, spaceCount: 0 }, 201);
      }
      if (method === 'PUT' && segments.length === 6) {
        const payload = await readBody<{ name: string; description?: string; active: boolean }>(init);
        const zone = mockAdminZones(tenantId).find((z) => z.id === segments[5]);
        if (!zone) return problem(404, 'PARKING_ZONE_NOT_FOUND', 'Zone not found');
        zone.name = payload.name;
        zone.description = payload.description ?? null;
        zone.active = payload.active;
        return json({ ...zone, spaceCount: mockAdminSpaces.filter((s) => s.zoneId === zone.id).length });
      }
    }

    if (resource === 'parking' && segments[4] === 'spaces') {
      if (method === 'GET') {
        const zoneFilter = url.searchParams.get('zoneId');
        const rows = mockAdminSpaces.filter((s) => !zoneFilter || s.zoneId === zoneFilter);
        return json(paginate(rows, Number(url.searchParams.get('page') ?? '0'),
          Number(url.searchParams.get('size') ?? '50')));
      }
      if (method === 'POST') {
        const payload = await readBody<{ zoneId: string; code: string }>(init);
        const code = payload.code.trim().toUpperCase();
        // The same two refusals the server has, so the screen's copy is exercised here.
        if (mockAdminSpaces.some((s) => s.code === code)) {
          return problem(409, 'PARKING_SPACE_CODE_TAKEN', 'That bay code is taken');
        }
        if (!/^LUP-\d{4}$/.test(code)) {
          return problem(422, 'PARKING_SPACE_CODE_INVALID', "That code doesn't match the format");
        }
        const space = { id: `space-${crypto.randomUUID()}`, zoneId: payload.zoneId, code, status: 'AVAILABLE' as const };
        mockAdminSpaces.push(space);
        return json(space, 201);
      }
      if (method === 'PUT' && segments.length === 6) {
        const payload = await readBody<{
          status?: 'AVAILABLE' | 'OUT_OF_SERVICE';
          zoneId?: string;
          code?: string;
        }>(init);
        const space = mockAdminSpaces.find((s) => s.id === segments[5]);
        if (!space) return problem(404, 'PARKING_SPACE_NOT_FOUND', 'Bay not found');
        if (payload.code !== undefined && payload.code.trim() !== '') {
          // The same two refusals as POST, with the bay itself excluded from the uniqueness check:
          // re-sending the code a bay already has is a no-op, not a conflict (CONTRACT.md v0.25).
          const code = payload.code.trim().toUpperCase();
          if (!/^LUP-\d{4}$/.test(code)) {
            return problem(422, 'PARKING_SPACE_CODE_INVALID', "That code doesn't match the format");
          }
          if (mockAdminSpaces.some((s) => s.code === code && s.id !== space.id)) {
            return problem(409, 'PARKING_SPACE_CODE_TAKEN', 'That bay code is taken');
          }
          space.code = code;
        }
        if (payload.status) space.status = payload.status;
        if (payload.zoneId) space.zoneId = payload.zoneId;
        return json(space);
      }
    }

    if (resource === 'parking' && segments[4] === 'rates') {
      if (method === 'GET') {
        const zoneFilter = url.searchParams.get('zoneId');
        // Wrapped, like the real server (`ParkingRateResponse.amount` is a `MoneyDto`). The mock used
        // to answer with the flat shape the client type declares, which is precisely why a missing
        // adapter went unnoticed until the Tarifas screen blanked against a real backend. A mock that
        // is friendlier than production does not verify anything.
        return json(mockAdminRates.filter((r) => !zoneFilter || r.zoneId === zoneFilter).map(toWireRate));
      }
      // PUT /rates sets the base; PUT /rates/rungs prices one exact duration.
      const rung = segments[5] === 'rungs';
      if (method === 'PUT') {
        const payload = await readBody<{ zoneId: string; amountMinor: number; minutes: number }>(init);
        const now = new Date().toISOString();
        // Closing the open window and opening a new one is the whole behaviour worth mocking: it is
        // what makes the history on screen real rather than decorative. A rung supersedes only the
        // rung for the same duration; the base supersedes the base.
        for (const rate of mockAdminRates) {
          if (rate.zoneId !== payload.zoneId || rate.validTo !== null) continue;
          if (rung ? rate.kind === 'EXACT' && rate.minutes === payload.minutes : rate.kind === 'BLOCK') {
            rate.validTo = now;
          }
        }
        const rate = {
          id: `rate-${crypto.randomUUID()}`,
          zoneId: payload.zoneId,
          kind: (rung ? 'EXACT' : 'BLOCK') as 'BLOCK' | 'EXACT',
          amountMinor: payload.amountMinor,
          currencyCode: 'CRC',
          minutes: payload.minutes,
          validFrom: now,
          validTo: null as string | null,
        };
        mockAdminRates.unshift(rate);
        return json(toWireRate(rate));
      }
      if (method === 'DELETE' && rung) {
        const zoneId = url.searchParams.get('zoneId') ?? '';
        const minutes = Number(url.searchParams.get('minutes') ?? 0);
        const now = new Date().toISOString();
        let closed = false;
        for (const rate of mockAdminRates) {
          if (rate.zoneId === zoneId && rate.validTo === null && rate.kind === 'EXACT' && rate.minutes === minutes) {
            rate.validTo = now;
            closed = true;
          }
        }
        if (!closed) return problem(404, 'PARKING_RATE_NOT_FOUND', 'That duration has no price of its own');
        return noContent();
      }
    }

    if (resource === 'users') {
      if (method === 'GET' && segments.length === 4) {
        const q = url.searchParams.get('q')?.toLowerCase();
        const status = url.searchParams.get('status');
        const roleFilter = url.searchParams.get('role');
        const portalFilter = url.searchParams.get('portal');
        const page = Number(url.searchParams.get('page') ?? '0');
        const size = Number(url.searchParams.get('size') ?? '20');
        let items = [...mockUsersById.values()];
        if (q) {
          items = items.filter(
            (u) =>
              u.profile.email.toLowerCase().includes(q) ||
              `${u.profile.givenName} ${u.profile.familyName}`.toLowerCase().includes(q),
          );
        }
        if (status) items = items.filter((u) => u.profile.status === status);
        if (roleFilter) items = items.filter((u) => u.memberships.some((m) => m.role === roleFilter));
        if (portalFilter) items = items.filter((u) => u.memberships.some((m) => m.portal === portalFilter));
        return json(paginate(items.map(toListItem), page, size));
      }
      // POST /api/v1/admin/users — a member of staff created by an administrator (v0.14). The mock
      // keeps the two refusals the screen has copy for: an address that is already somebody's, and
      // a role a municipal administrator may not grant.
      if (method === 'POST' && segments.length === 4) {
        const payload = await readBody<CreateAdminUserRequest>(init);
        if (!TENANT_GRANTABLE_ROLES.includes(payload.role)) {
          return problem(403, 'ROLE_NOT_ALLOWED_FOR_PORTAL', 'A municipal administrator cannot grant that role');
        }
        if (findUserByEmail(payload.email)) {
          return problem(409, 'EMAIL_ALREADY_REGISTERED', 'Email already registered');
        }
        const newId = nextMockUserId();
        const record: MockUserRecord = {
          profile: {
            id: newId,
            email: payload.email.toLowerCase(),
            emailVerified: false,
            givenName: payload.givenName,
            familyName: payload.familyName,
            secondFamilyName: payload.secondFamilyName,
            birthDate: payload.birthDate,
            nationalityCode: payload.nationalityCode,
            phone: payload.phone,
            identityDocument: payload.identityDocument,
            address: payload.address,
            locale: payload.locale ?? 'es-CR',
            timeZone: payload.timeZone ?? 'America/Costa_Rica',
            // Until they follow the emailed link and choose a password, exactly as on the server.
            status: 'PENDING_VERIFICATION' as const,
          },
          // No password at all: an operator never sets one.
          password: null,
          memberships: [
            {
              tenantId: tenantId ?? '',
              tenantName: MOCK_TENANTS.find((x) => x.id === tenantId)?.name ?? (tenantId ?? ''),
              portal: payload.portal,
              role: payload.role,
              status: 'ACTIVE',
            },
          ],
        };
        mockUsersById.set(newId, record);
        recordAuditEvent({
          tenantId: tenantId ?? null,
          actorUserId: 'mock-admin',
          actorPortal: 'admin',
          action: 'USER_CREATED',
          resourceType: 'user',
          resourceId: newId,
          metadata: { role: payload.role, portal: payload.portal },
        });
        return json(toDetail(record), 201);
      }
      // POST /api/v1/admin/users/lookup — one person, matched exactly (CONTRACT.md v0.26).
      //
      // The mock reproduces the three things that make this endpoint safe, because a friendlier
      // mock is how a contract bug reaches production: exactly one criterion, an exact match with no
      // partial terms, and an answer that carries a masked address and only the posts this person
      // holds in THIS municipality.
      if (method === 'POST' && segments[4] === 'lookup') {
        const payload = await readBody<LookupPersonRequest>(init);
        const byEmail = typeof payload.email === 'string' && payload.email.trim() !== '';
        const byDocument = payload.identityDocument != null;
        if (byEmail === byDocument) {
          return problem(422, 'VALIDATION_FAILED', 'Send exactly one of email or identityDocument');
        }
        let match: MockUserRecord | undefined;
        if (byEmail) {
          match = findUserByEmail(payload.email ?? '');
        } else {
          const wanted = payload.identityDocument;
          // UPPER_ALPHANUMERIC, the catalogue's default normaliser: "1-0987-0123" is the same
          // cédula as "109870123", and the server compares them in that canonical form.
          const canonical = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
          match = [...mockUsersById.values()].find(
            (record) =>
              record.profile.identityDocument.countryCode === wanted?.countryCode &&
              record.profile.identityDocument.type === wanted?.type &&
              canonical(record.profile.identityDocument.number) === canonical(wanted?.number ?? ''),
          );
        }
        if (!match) return json({ found: false, person: null });
        const local = match.profile.email.split('@')[0] ?? '';
        const domain = match.profile.email.slice(local.length);
        return json({
          found: true,
          person: {
            userId: match.profile.id,
            fullName: [match.profile.givenName, match.profile.familyName, match.profile.secondFamilyName]
              .filter(Boolean)
              .join(' '),
            maskedEmail: `${local.slice(0, local.length <= 2 ? 1 : 2)}***${domain}`,
            accountStatus: match.profile.status,
            accessHere: match.memberships
              .filter((membership) => membership.tenantId === tenantId)
              .map((membership) => ({
                portal: membership.portal,
                role: membership.role,
                status: membership.status,
              })),
          },
        });
      }
      if (method === 'GET' && segments.length === 5) {
        const user = mockUsersById.get(segments[4] ?? '');
        if (!user) return problem(404, 'USER_NOT_FOUND', 'User not found');
        return json(toDetail(user));
      }
      if (method === 'POST' && segments[5] === 'block') {
        const user = mockUsersById.get(segments[4] ?? '');
        if (!user) return problem(404, 'USER_NOT_FOUND', 'User not found');
        user.profile.status = 'BLOCKED';
        recordAuditEvent({
          tenantId: null,
          actorUserId: 'mock-admin',
          actorPortal: 'admin',
          action: 'USER_BLOCKED',
          resourceType: 'user',
          resourceId: user.profile.id,
          metadata: {},
        });
        return noContent();
      }
      if (method === 'POST' && segments[5] === 'unblock') {
        const user = mockUsersById.get(segments[4] ?? '');
        if (!user) return problem(404, 'USER_NOT_FOUND', 'User not found');
        user.profile.status = 'ACTIVE';
        return noContent();
      }
      if (method === 'POST' && segments[5] === 'password-reset') {
        return noContent();
      }
    }

    // ---- Invitaciones de funcionarios (CONTRACT.md v0.27) -------------------------------------
    if (resource === 'staff-invitations') {
      const mine = mockInvitations.filter((i) => i.tenantId === tenantId);
      const toResponse = (invitation: MockInvitation) => ({
        id: invitation.id,
        email: invitation.email,
        portal: invitation.portal,
        role: invitation.role,
        status: invitation.status,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
        // Calculado, nunca guardado: vencer es un hecho del reloj y no una decisión de nadie.
        expired: invitation.status === 'PENDING' && new Date(invitation.expiresAt) <= new Date(),
        acceptedAt: invitation.acceptedAt,
        revokedAt: invitation.revokedAt,
      });

      if (method === 'GET' && segments.length === 4) {
        const statusFilter = url.searchParams.get('status');
        const rows = mine.filter((i) => !statusFilter || i.status === statusFilter).map(toResponse);
        return json(paginate(rows, Number(url.searchParams.get('page') ?? '0'),
          Number(url.searchParams.get('size') ?? '20')));
      }
      if (method === 'POST' && segments.length === 4) {
        const payload = await readBody<CreateStaffInvitationRequest>(init);
        const email = payload.email.trim().toLowerCase();
        if (!TENANT_GRANTABLE_ROLES.includes(payload.role)) {
          return problem(403, 'ROLE_NOT_ALLOWED_FOR_PORTAL', 'A municipal administrator cannot grant that role');
        }
        // Quien ya tiene cuenta no se invita: se le da el puesto sobre la que tiene (v0.26). El
        // rechazo es la respuesta correcta, no un estorbo.
        if (findUserByEmail(email)) {
          return problem(409, 'EMAIL_ALREADY_REGISTERED', 'That address already has an account');
        }
        const portal = payload.role === 'INSPECTOR' || payload.role === 'INSPECTOR_LEAD' ? 'inspector' : 'admin';
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 14 * 86400000).toISOString();
        // Reinvitar reemplaza el enlace de la invitación viva; no agrega una segunda.
        const existing = mine.find((i) => i.email === email && i.status === 'PENDING');
        if (existing) {
          existing.token = mockInvitationToken(email);
          existing.createdAt = now.toISOString();
          existing.expiresAt = expiresAt;
          existing.role = payload.role;
          existing.portal = portal as Portal;
          return json(toResponse(existing), 201);
        }
        const invitation: MockInvitation = {
          id: `invitation-${crypto.randomUUID()}`,
          tenantId: tenantId ?? '',
          email,
          portal: portal as Portal,
          role: payload.role,
          status: 'PENDING',
          token: mockInvitationToken(email),
          createdAt: now.toISOString(),
          expiresAt,
          acceptedAt: null,
          revokedAt: null,
        };
        mockInvitations.push(invitation);
        recordAuditEvent({
          tenantId: tenantId ?? null,
          actorUserId: 'mock-admin',
          actorPortal: 'admin',
          action: 'STAFF_INVITATION_SENT',
          resourceType: 'staff-invitation',
          resourceId: invitation.id,
          metadata: { role: invitation.role, portal: invitation.portal },
        });
        return json(toResponse(invitation), 201);
      }
      if (segments.length >= 5) {
        const invitation = mine.find((i) => i.id === segments[4]);
        if (!invitation) return problem(404, 'INVITATION_NOT_FOUND', 'Invitation not found');
        if (segments[5] === 'resend' && method === 'POST') {
          if (invitation.status !== 'PENDING') {
            return problem(409, 'INVITATION_NOT_PENDING', 'That invitation is no longer active');
          }
          // Reenviar cambia el token de verdad: el enlace anterior tiene que dejar de servir, y una
          // vista previa que reutilizara el mismo no probaría nada.
          invitation.token = `${mockInvitationToken(invitation.email)}-${mockInvitations.length}`;
          invitation.createdAt = new Date().toISOString();
          invitation.expiresAt = new Date(Date.now() + 14 * 86400000).toISOString();
          return json(toResponse(invitation));
        }
        if (!segments[5] && method === 'DELETE') {
          if (invitation.status === 'ACCEPTED') {
            return problem(409, 'INVITATION_ALREADY_ACCEPTED', 'That invitation was already used');
          }
          invitation.status = 'REVOKED';
          invitation.revokedAt = new Date().toISOString();
          return json(toResponse(invitation));
        }
      }
    }

    // POST /api/v1/admin/memberships — give a post to somebody who already has an account
    // (CONTRACT.md v0.26). It used to answer 204 and change nothing, which made the screen look like
    // it worked and the staff list look like it had not: the two refusals below and the row it adds
    // are the whole point of exercising this against the mock.
    if (resource === 'memberships' && method === 'POST' && segments.length === 4) {
      const payload = await readBody<CreateMembershipRequest>(init);
      const person = mockUsersById.get(payload.userId);
      if (!person) return problem(404, 'USER_NOT_FOUND', 'User not found');
      if (!TENANT_GRANTABLE_ROLES.includes(payload.role)) {
        return problem(403, 'ROLE_NOT_ALLOWED_FOR_PORTAL', 'A municipal administrator cannot grant that role');
      }
      // One post per app: the unique index is (municipality, person, portal), so a second grant on
      // the same portal is a conflict and not a silent replacement of the role they hold.
      if (person.memberships.some((m) => m.tenantId === tenantId && m.portal === payload.portal)) {
        return problem(409, 'MEMBERSHIP_ALREADY_EXISTS', 'That person already has access to this app');
      }
      const tenant = MOCK_TENANTS.find((x) => x.id === tenantId);
      const membership = {
        id: `membership-${crypto.randomUUID()}`,
        tenantId: tenantId ?? '',
        tenantName: tenant?.name ?? (tenantId ?? ''),
        tenantShortName: tenant?.shortName ?? null,
        tenantLogoUrl: null,
        tenantBrandColor: tenant?.brandColor ?? null,
        portal: payload.portal,
        role: payload.role,
        status: 'ACTIVE' as const,
      };
      person.memberships.push(membership);
      recordAuditEvent({
        tenantId: tenantId ?? null,
        actorUserId: 'mock-admin',
        actorPortal: 'admin',
        action: 'MEMBERSHIP_CREATED',
        resourceType: 'membership',
        resourceId: membership.id,
        metadata: { userId: payload.userId, role: payload.role },
      });
      return json(membership, 201);
    }
    // GET /api/v1/admin/memberships/staff — the administration panel (CONTRACT.md v0.15). One row
    // per post, suspended and revoked included, with the sectors it covers and the last sign-in.
    if (resource === 'memberships' && segments[4] === 'staff' && method === 'GET') {
      const statusFilter = url.searchParams.get('status');
      const rows = [];
      for (const person of mockUsersById.values()) {
        for (const membership of person.memberships) {
          if (membership.portal === 'citizen') continue;
          if (tenantId && membership.tenantId !== tenantId) continue;
          if (statusFilter && membership.status !== statusFilter) continue;
          rows.push({
            membershipId: membership.id,
            userId: person.profile.id,
            fullName: `${person.profile.givenName} ${person.profile.familyName}`.trim(),
            email: person.profile.email,
            portal: membership.portal,
            role: membership.role,
            status: membership.status,
            statusReason: membership.statusReason ?? null,
            suspendedAt: membership.suspendedAt ?? null,
            revokedAt: null,
            zones: (mockMembershipZones.get(membership.id ?? '') ?? []).map((zoneId) => {
              const zone = (mockCitizenZones(membership.tenantId) as { id: string; code: string; name: string }[])
                .find((z) => z.id === zoneId);
              return { zoneId, code: zone?.code ?? zoneId, name: zone?.name ?? zoneId };
            }),
            // El uso DEL PUESTO, no el de la persona (CONTRACT.md v0.27). El mock los distingue
            // porque distinguirlos es justamente lo que había que arreglar.
            lastUsedAt: mockMembershipLastUsed.get(membership.id ?? '') ?? null,
            lastLoginAt: person.profile.lastLoginAt ?? null,
            lastLoginPortal: person.profile.lastLoginPortal ?? null,
            accountStatus: person.profile.status,
          });
        }
      }
      const page = Number(url.searchParams.get('page') ?? '0');
      const size = Number(url.searchParams.get('size') ?? '20');
      return json(paginate(rows, page, size));
    }

    // /api/v1/admin/memberships/{id}[/approve|/reject|/suspend|/reactivate|/zones].
    if (resource === 'memberships' && segments.length >= 5) {
      const membershipId = segments[4];
      const subAction = segments[5];
      const owner = [...mockUsersById.values()].find((u) => u.memberships.some((m) => m.id === membershipId));
      const membership = owner?.memberships.find((m) => m.id === membershipId);

      if (!membership) return problem(404, 'MEMBERSHIP_NOT_FOUND', 'Membership not found');

      if (subAction === 'approve' && method === 'POST') {
        membership.status = 'ACTIVE';
        recordAuditEvent({
          tenantId: membership.tenantId,
          actorUserId: 'mock-admin',
          actorPortal: 'admin',
          action: 'MEMBERSHIP_APPROVED',
          resourceType: 'tenant_membership',
          resourceId: membershipId ?? '',
          metadata: { userId: owner?.profile.id },
        });
        return noContent();
      }
      if (subAction === 'reject' && method === 'POST') {
        membership.status = 'REJECTED';
        return noContent();
      }
      if (subAction === 'suspend' && method === 'POST') {
        if (membership.status !== 'ACTIVE' && membership.status !== 'SUSPENDED') {
          return problem(409, 'MEMBERSHIP_INVALID_TRANSITION', 'Only an active membership can be suspended');
        }
        const payload = await readBody<{ reason?: string }>(init);
        membership.status = 'SUSPENDED';
        membership.statusReason = payload.reason ?? null;
        membership.suspendedAt = new Date().toISOString();
        return noContent();
      }
      if (subAction === 'reactivate' && method === 'POST') {
        if (membership.status !== 'SUSPENDED' && membership.status !== 'ACTIVE') {
          return problem(409, 'MEMBERSHIP_INVALID_TRANSITION', 'Only a suspended membership can be reactivated');
        }
        membership.status = 'ACTIVE';
        membership.statusReason = null;
        membership.suspendedAt = null;
        return noContent();
      }
      // PUT /api/v1/admin/memberships/{id} — cambiar el rol de un puesto que ya existe.
      if (!subAction && method === 'PUT') {
        const payload = await readBody<{ role?: Role; status?: MembershipStatus }>(init);
        if (payload.role) {
          if (!TENANT_GRANTABLE_ROLES.includes(payload.role)) {
            return problem(403, 'ROLE_NOT_ALLOWED_FOR_PORTAL', 'A municipal administrator cannot grant that role');
          }
          // Un rol pertenece a un portal y sólo a uno: cambiar de rol no puede cambiar de app. Pasar
          // de administración a fiscalización es un PUESTO NUEVO, no una edición de éste.
          const target = payload.role === 'INSPECTOR' || payload.role === 'INSPECTOR_LEAD' ? 'inspector' : 'admin';
          if (target !== membership.portal) {
            return problem(422, 'ROLE_NOT_ALLOWED_FOR_PORTAL', 'That role belongs to another app');
          }
          membership.role = payload.role;
        }
        if (payload.status) membership.status = payload.status;
        recordAuditEvent({
          tenantId: membership.tenantId,
          actorUserId: 'mock-admin',
          actorPortal: 'admin',
          action: 'MEMBERSHIP_ROLE_CHANGED',
          resourceType: 'membership',
          resourceId: membershipId ?? '',
          metadata: { role: String(payload.role) },
        });
        return json(membership);
      }
      if (subAction === 'zones' && method === 'PUT') {
        const payload = await readBody<{ zoneIds: string[] }>(init);
        const zonesOfTenant = mockCitizenZones(membership.tenantId) as { id: string; code: string; name: string }[];
        for (const zoneId of payload.zoneIds) {
          if (!zonesOfTenant.some((z) => z.id === zoneId)) {
            return problem(422, 'PARKING_ZONE_NOT_FOUND', 'That zone is not this municipality\'s');
          }
        }
        mockMembershipZones.set(membershipId ?? '', [...payload.zoneIds]);
        return json(
          payload.zoneIds.map((zoneId) => {
            const zone = zonesOfTenant.find((z) => z.id === zoneId);
            return { zoneId, code: zone?.code ?? zoneId, name: zone?.name ?? zoneId };
          }),
        );
      }
      if (!subAction && method === 'PUT') {
        const payload = await readBody<{ role: string; status: string }>(init);
        membership.role = payload.role as MembershipSummary['role'];
        membership.status = payload.status as MembershipSummary['status'];
        return noContent();
      }
      if (!subAction && method === 'DELETE') {
        if (owner) owner.memberships = owner.memberships.filter((m) => m.id !== membershipId);
        return noContent();
      }
    }

    if (resource === 'audit-events' && method === 'GET') {
      const page = Number(url.searchParams.get('page') ?? '0');
      const size = Number(url.searchParams.get('size') ?? '20');
      return json(paginate(mockAuditEvents, page, size));
    }

    if (resource === 'reports' && segments[4] === 'registered-users' && method === 'GET') {
      const groupBy = url.searchParams.get('groupBy') ?? 'tenant';
      const groups = new Map<string, number>();
      for (const user of mockUsersById.values()) {
        for (const membership of user.memberships) {
          const key =
            groupBy === 'portal'
              ? membership.portal
              : groupBy === 'tenant'
                ? membership.tenantName
                : groupBy === 'country'
                  ? user.profile.nationalityCode
                  : '2026-01';
          groups.set(key, (groups.get(key) ?? 0) + 1);
        }
      }
      return json([...groups.entries()].map(([group, count]) => ({ group, count })));
    }

    if (resource === 'exports' && method === 'POST') {
      return json({ exportId: `export-${crypto.randomUUID()}` }, 202);
    }

    if (resource === 'tenants' && method === 'GET') {
      return json(MOCK_TENANTS);
    }
    if (resource === 'tenants' && method === 'POST') {
      const payload = await readBody<Record<string, unknown>>(init);
      return json({ id: `tenant-${crypto.randomUUID()}`, status: 'ACTIVE', ...payload }, 201);
    }
  }

  // ---- Platform back-office: tenants, global users, memberships, audit, reports, catalogs, system --
  if (segments[2] === 'platform') {
    const resource = segments[3];

    if (resource === 'tenants') {
      if (method === 'GET' && segments.length === 4) {
        const q = url.searchParams.get('q')?.toLowerCase();
        const status = url.searchParams.get('status');
        const country = url.searchParams.get('country');
        let items = [...MOCK_PLATFORM_TENANTS];
        if (q) items = items.filter((t) => t.displayName.toLowerCase().includes(q) || t.slug.includes(q));
        if (status) items = items.filter((t) => t.status === status);
        if (country) items = items.filter((t) => t.countryCode === country);
        return json(items);
      }
      if (method === 'POST' && segments.length === 4) {
        const payload = await readBody<Record<string, unknown>>(init);
        const created = {
          id: `tenant-${crypto.randomUUID()}`,
          slug: String(payload.slug ?? ''),
          legalName: String(payload.legalName ?? ''),
          displayName: String(payload.displayName ?? ''),
          countryCode: String(payload.countryCode ?? ''),
          currencyCode: String(payload.currencyCode ?? ''),
          locale: String(payload.locale ?? ''),
          timeZone: String(payload.timeZone ?? ''),
          status: 'ACTIVE' as const,
          selfRegistrationPolicy: (payload.selfRegistrationPolicy ?? 'APPROVAL_REQUIRED') as never,
          createdAt: new Date().toISOString(),
        };
        MOCK_PLATFORM_TENANTS.push(created);
        recordAuditEvent({
          tenantId: created.id,
          actorUserId: 'mock-platform-admin',
          actorPortal: 'platform',
          action: 'TENANT_CREATED',
          resourceType: 'tenant',
          resourceId: created.id,
          metadata: { slug: created.slug },
        });
        return json(created, 201);
      }
      if (method === 'GET' && segments.length === 5) {
        const tenant = MOCK_PLATFORM_TENANTS.find((t) => t.id === segments[4]);
        if (!tenant) return problem(404, 'TENANT_NOT_FOUND', 'Tenant not found');
        return json(tenant);
      }
      if (method === 'PUT' && segments.length === 5) {
        const tenant = MOCK_PLATFORM_TENANTS.find((t) => t.id === segments[4]);
        if (!tenant) return problem(404, 'TENANT_NOT_FOUND', 'Tenant not found');
        const payload = await readBody<Record<string, unknown>>(init);
        Object.assign(tenant, payload);
        return json(tenant);
      }
      if (method === 'POST' && segments[5] === 'status') {
        const tenant = MOCK_PLATFORM_TENANTS.find((t) => t.id === segments[4]);
        if (!tenant) return problem(404, 'TENANT_NOT_FOUND', 'Tenant not found');
        const payload = await readBody<{ status: string; reason: string }>(init);
        tenant.status = payload.status as typeof tenant.status;
        recordAuditEvent({
          tenantId: tenant.id,
          actorUserId: 'mock-platform-admin',
          actorPortal: 'platform',
          action: 'TENANT_STATUS_CHANGED',
          resourceType: 'tenant',
          resourceId: tenant.id,
          metadata: { status: payload.status, reason: payload.reason },
        });
        return noContent();
      }
      if (segments[5] === 'settings') {
        const tenantId = segments[4] ?? '';
        if (method === 'GET') return json(mockTenantSettings.get(tenantId) ?? {});
        if (method === 'PUT') {
          const payload = await readBody<Record<string, unknown>>(init);
          mockTenantSettings.set(tenantId, { ...(mockTenantSettings.get(tenantId) ?? {}), ...payload } as never);
          return noContent();
        }
      }
      if (segments[5] === 'admins' && method === 'POST') {
        const tenant = MOCK_PLATFORM_TENANTS.find((t) => t.id === segments[4]);
        if (!tenant) return problem(404, 'TENANT_NOT_FOUND', 'Tenant not found');
        const payload = await readBody<{ email: string; givenName: string; familyName: string }>(init);
        let user = findUserByEmail(payload.email);
        const membershipId = `membership-${crypto.randomUUID()}`;
        if (!user) {
          const id = nextMockUserId();
          user = {
            profile: {
              id,
              email: payload.email.toLowerCase(),
              emailVerified: false,
              givenName: payload.givenName,
              familyName: payload.familyName,
              birthDate: '1990-01-01',
              nationalityCode: tenant.countryCode,
              phone: { countryCode: tenant.countryCode, nationalNumber: '' },
              identityDocument: { countryCode: tenant.countryCode, type: 'NATIONAL_ID', number: '' },
              address: { countryCode: tenant.countryCode, level1Id: '', line1: '' },
              locale: tenant.locale,
              timeZone: tenant.timeZone,
              status: 'PENDING_VERIFICATION',
            },
            password: crypto.randomUUID(),
            memberships: [],
          };
          mockUsersById.set(id, user);
        }
        user.memberships.push({
          id: membershipId,
          tenantId: tenant.id,
          tenantName: tenant.displayName,
          portal: 'admin',
          role: 'TENANT_ADMIN',
          status: 'ACTIVE',
        });
        recordAuditEvent({
          tenantId: tenant.id,
          actorUserId: 'mock-platform-admin',
          actorPortal: 'platform',
          action: 'TENANT_ADMIN_CREATED',
          resourceType: 'tenant_membership',
          resourceId: membershipId,
          metadata: { email: payload.email },
        });
        return json({ userId: user.profile.id, membershipId, status: 'ACTIVE' }, 201);
      }
    }

    if (resource === 'users') {
      if (method === 'GET' && segments.length === 4) {
        const q = url.searchParams.get('q')?.toLowerCase();
        const status = url.searchParams.get('status');
        const country = url.searchParams.get('country');
        const tenantId = url.searchParams.get('tenantId');
        const page = Number(url.searchParams.get('page') ?? '0');
        const size = Number(url.searchParams.get('size') ?? '20');
        let items = [...mockUsersById.values()];
        if (q) {
          items = items.filter(
            (u) =>
              u.profile.email.toLowerCase().includes(q) ||
              `${u.profile.givenName} ${u.profile.familyName}`.toLowerCase().includes(q),
          );
        }
        if (status) items = items.filter((u) => u.profile.status === status);
        if (country) items = items.filter((u) => u.profile.nationalityCode === country);
        if (tenantId) items = items.filter((u) => u.memberships.some((m) => m.tenantId === tenantId));
        return json(paginate(items.map(toListItem), page, size));
      }
      if (method === 'GET' && segments.length === 5) {
        const user = mockUsersById.get(segments[4] ?? '');
        if (!user) return problem(404, 'USER_NOT_FOUND', 'User not found');
        return json(toDetail(user));
      }
      if (method === 'POST' && segments[5] === 'block') {
        const user = mockUsersById.get(segments[4] ?? '');
        if (!user) return problem(404, 'USER_NOT_FOUND', 'User not found');
        user.profile.status = 'BLOCKED';
        recordAuditEvent({
          tenantId: null,
          actorUserId: 'mock-platform-admin',
          actorPortal: 'platform',
          action: 'USER_BLOCKED',
          resourceType: 'user',
          resourceId: user.profile.id,
          metadata: {},
        });
        return noContent();
      }
      if (method === 'POST' && segments[5] === 'unblock') {
        const user = mockUsersById.get(segments[4] ?? '');
        if (!user) return problem(404, 'USER_NOT_FOUND', 'User not found');
        user.profile.status = 'ACTIVE';
        return noContent();
      }
      if (method === 'POST' && segments[5] === 'password-reset') {
        return noContent();
      }
    }

    if (resource === 'memberships' && method === 'POST') {
      const payload = await readBody<{ userId: string; tenantId: string; portal: Portal; role: Role }>(init);
      const user = mockUsersById.get(payload.userId);
      if (!user) return problem(404, 'USER_NOT_FOUND', 'User not found');
      const tenant = MOCK_PLATFORM_TENANTS.find((t) => t.id === payload.tenantId);
      user.memberships.push({
        id: `membership-${crypto.randomUUID()}`,
        tenantId: payload.tenantId,
        tenantName: tenant?.displayName ?? payload.tenantId,
        portal: payload.portal,
        role: payload.role,
        status: 'ACTIVE',
      });
      return noContent();
    }

    if (resource === 'audit-events' && method === 'GET') {
      const tenantId = url.searchParams.get('tenantId');
      const page = Number(url.searchParams.get('page') ?? '0');
      const size = Number(url.searchParams.get('size') ?? '20');
      const items = tenantId ? mockAuditEvents.filter((e) => e.tenantId === tenantId) : mockAuditEvents;
      return json(paginate(items, page, size));
    }

    if (resource === 'reports' && segments[4] === 'registered-users' && method === 'GET') {
      const groupBy = url.searchParams.get('groupBy') ?? 'tenant';
      const groups = new Map<string, number>();
      for (const user of mockUsersById.values()) {
        if (groupBy === 'country') {
          const key = user.profile.nationalityCode;
          groups.set(key, (groups.get(key) ?? 0) + 1);
          continue;
        }
        for (const membership of user.memberships) {
          const key =
            groupBy === 'portal' ? membership.portal : groupBy === 'tenant' ? membership.tenantName : '2026-01';
          groups.set(key, (groups.get(key) ?? 0) + 1);
        }
      }
      return json([...groups.entries()].map(([group, count]) => ({ group, count })));
    }

    if (resource === 'catalog') {
      const sub = segments[4];
      if (sub === 'countries' && segments.length === 5 && method === 'GET') {
        return json(MOCK_COUNTRIES.map((c) => ({ ...c, active: true })));
      }
      if (sub === 'countries' && segments.length === 5 && method === 'POST') {
        const payload = await readBody<Record<string, unknown>>(init);
        return json(payload, 201);
      }
      if (sub === 'countries' && segments[6] === 'admin-levels' && method === 'GET') {
        return json(MOCK_ADMIN_LEVELS[(segments[5] ?? '').toUpperCase()] ?? []);
      }
      if (sub === 'countries' && segments[6] === 'divisions' && method === 'GET') {
        const code = (segments[5] ?? '').toUpperCase();
        const parentId = url.searchParams.get('parentId');
        const level = url.searchParams.get('level');
        const all = MOCK_DIVISIONS[code] ?? [];
        return json(
          all.filter((d) => (level ? d.level === Number(level) : true) && (parentId ? d.parentId === parentId : d.parentId === null)),
        );
      }
      if (sub === 'countries' && segments[6] === 'document-types' && method === 'GET') {
        return json(MOCK_DOCUMENT_TYPES[(segments[5] ?? '').toUpperCase()] ?? []);
      }
      if (sub === 'admin-levels' && method === 'POST') {
        return noContent();
      }
      if (sub === 'divisions' && method === 'POST') {
        return noContent();
      }
      if (sub === 'document-types' && method === 'POST') {
        return noContent();
      }
    }

    if (resource === 'system') {
      if (segments[4] === 'health') return json(MOCK_SYSTEM_HEALTH);
      if (segments[4] === 'feature-flags') return json(MOCK_FEATURE_FLAGS);
      if (segments[4] === 'jobs') return json(MOCK_SYSTEM_JOBS);
    }
  }

  // ---- Citizen: vehicles, parking domain, wallet & time credits (CONTRACT.md v0.2) -------------
  if (segments[2] === 'citizen') {
    const authHeader = new Headers(init?.headers).get('Authorization');
    const claims = authHeader ? decodeMockClaims(authHeader) : null;
    if (!claims) return problem(401, 'UNAUTHORIZED', 'Missing or invalid session');
    const userId = claims.sub;
    const tenantId = claims.tid;
    const resource = segments[3];
    const idempotencyKey = new Headers(init?.headers).get('Idempotency-Key');

    // ---- Vehicles (CONTRACT.md v0.2 §"Vehículos") ----------------------------------------------
    if (resource === 'vehicles') {
      if (method === 'GET' && segments.length === 4) {
        const items = mockVehicles.filter((v) => v.userId === userId);
        return json(items.map(({ userId: _userId, ...vehicle }) => vehicle));
      }
      if (method === 'POST' && segments.length === 4) {
        const payload = await readBody<CreateVehicleRequest>(init);
        const plate = normalizeMockPlate(payload.plate ?? '');
        if (!plate) {
          return problem(400, 'VALIDATION_ERROR', 'Validation failed', undefined, [
            { field: 'plate', code: 'REQUIRED', message: 'Plate is required' },
          ]);
        }
        if (mockVehicles.some((v) => v.userId === userId && v.plate === plate)) {
          return problem(409, 'PLATE_ALREADY_REGISTERED', 'Plate already registered', undefined, [
            { field: 'plate', code: 'PLATE_ALREADY_REGISTERED', message: 'You already have a vehicle with this plate.' },
          ]);
        }
        return idempotentResult(idempotencyKey, `vehicle-create:${userId}`, () => {
          const isFirstVehicle = !mockVehicles.some((v) => v.userId === userId);
          const record = {
            id: nextMockVehicleId(),
            userId,
            plate,
            name: payload.name,
            brand: payload.brand,
            model: payload.model,
            year: payload.year,
            type: payload.type || 'CAR',
            color: payload.color,
            isOwner: payload.isOwner,
            isPrimary: isFirstVehicle,
          };
          mockVehicles.push(record);
          const { userId: _userId, ...vehicle } = record;
          return { data: vehicle, status: 201 };
        });
      }
      if (method === 'PUT' && segments.length === 5) {
        const record = mockVehicles.find((v) => v.id === segments[4] && v.userId === userId);
        if (!record) return problem(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found');
        const payload = await readBody<UpdateVehicleRequest>(init);
        const plate = normalizeMockPlate(payload.plate ?? '');
        if (!plate) {
          return problem(400, 'VALIDATION_ERROR', 'Validation failed', undefined, [
            { field: 'plate', code: 'REQUIRED', message: 'Plate is required' },
          ]);
        }
        if (mockVehicles.some((v) => v.userId === userId && v.plate === plate && v.id !== record.id)) {
          return problem(409, 'PLATE_ALREADY_REGISTERED', 'Plate already registered', undefined, [
            { field: 'plate', code: 'PLATE_ALREADY_REGISTERED', message: 'You already have a vehicle with this plate.' },
          ]);
        }
        record.plate = plate;
        record.name = payload.name;
        record.brand = payload.brand;
        record.model = payload.model;
        record.year = payload.year;
        record.type = payload.type || 'CAR';
        record.color = payload.color;
        record.isOwner = payload.isOwner;
        const { userId: _userId, ...vehicle } = record;
        return json(vehicle);
      }
      if (method === 'DELETE' && segments.length === 5) {
        const record = mockVehicles.find((v) => v.id === segments[4] && v.userId === userId);
        if (!record) return problem(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found');
        const hasActiveSession = mockParkingSessions.some((s) => s.vehicleId === record.id && s.status === 'ACTIVE');
        if (hasActiveSession) {
          return problem(409, 'VEHICLE_HAS_ACTIVE_SESSION', 'Vehicle has an active parking session');
        }
        const index = mockVehicles.indexOf(record);
        mockVehicles.splice(index, 1);
        if (record.isPrimary) {
          const next = mockVehicles.find((v) => v.userId === userId);
          if (next) next.isPrimary = true;
        }
        return noContent();
      }
      if (method === 'POST' && segments[5] === 'primary') {
        const record = mockVehicles.find((v) => v.id === segments[4] && v.userId === userId);
        if (!record) return problem(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found');
        for (const v of mockVehicles) {
          if (v.userId === userId) v.isPrimary = v.id === record.id;
        }
        return noContent();
      }
    }

    // ---- Parking domain (CONTRACT.md v0.2 §API) ------------------------------------------------
    if (resource === 'parking') {
      const sub = segments[4];

      if (sub === 'policy' && method === 'GET') {
        // The same row the administrator edits, not a second copy: in a build where both portals
        // are mocked, a citizen reading different rules than the municipality just set would be the
        // mock inventing a bug that production does not have.
        return json(mockAdminPolicy(tenantId));
      }

      if (sub === 'quote' && method === 'POST') {
        const payload = await readBody<ParkingQuoteRequest>(init);
        return json(toWireQuote(computeMockQuote(payload.zoneId, payload.minutes, userId, tenantId)));
      }

      // The charging schedule this mock municipality runs on: Monday to Saturday 07:00–18:00, no
      // charge on Sunday (CONTRACT.md v0.3 §"Horario de cobro" default).
      if (sub === 'schedule' && method === 'GET') {
        return json(mockChargingSchedule());
      }

      if (sub === 'zones' && method === 'GET') {
        return json(mockCitizenZones(tenantId));
      }

      // Published to the citizen too, read-only: their bay-code field needs the municipality's own
      // example and pattern before it can help rather than only report a refusal.
      if (sub === 'space-format' && method === 'GET') {
        return json(mockSpaceFormat());
      }

      if (sub === 'sessions' && segments.length === 5 && method === 'GET') {
        // Scoped to the citizen's identity, not the active tenant: the sticky "always visible"
        // timer (CONTRACT.md v0.2 rule 3) must surface an active session no matter which
        // municipality the citizen is currently switched into.
        const statusFilter = (url.searchParams.get('status') ?? 'ACTIVE') as ParkingSessionStatus | 'ALL';
        const items = mockParkingSessions.filter(
          (s) => s.userId === userId && (statusFilter === 'ALL' || s.status === statusFilter),
        );
        // Always a page envelope, ACTIVE included — "una forma por endpoint" (CONTRACT.md v0.2).
        const mapped = items.map(toPublicSession);
        return json({ items: mapped, page: 0, size: 20, totalElements: mapped.length, totalPages: 1 });
      }

      if (sub === 'sessions' && segments.length === 5 && method === 'POST') {
        const payload = await readBody<StartParkingSessionRequest>(init);
        const policy = mockParkingPolicyForTenant(tenantId);
        // The municipality's increments, plus the one duration that is the citizen's own: exactly
        // their saved minutes (CONTRACT.md v0.12). That one is not held to the minimum stay — it was
        // paid for already — but it is still held to the maximum, which is about the bay.
        const savedMinutes = availableMockCreditMinutes(walletKey(userId, tenantId ?? ''));
        const spendsSavedMinutes = payload.minutes > 0 && payload.minutes === savedMinutes;
        if (
          !spendsSavedMinutes
            ? !policy.sessionIncrementsMinutes.includes(payload.minutes)
            : payload.minutes > policy.sessionMaxMinutes
        ) {
          return problem(422, 'INVALID_INCREMENT', 'Invalid session duration');
        }
        // A vehicle of the citizen's, or a plate typed for somebody else's car (CONTRACT.md v0.11).
        // The mock mirrors the server's rules rather than accepting anything, so the flow can be
        // driven end to end here: a plate that normalises to nothing is refused, and so is a second
        // running stay on the same plate when either side of the clash is a typed one.
        const guestPlate = payload.vehicleId ? null : normalizeMockPlate(payload.plate ?? '');
        const vehicle = payload.vehicleId
          ? mockVehicles.find((v) => v.id === payload.vehicleId && v.userId === userId)
          : undefined;
        if (payload.vehicleId && !vehicle) return problem(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found');
        if (!payload.vehicleId && !guestPlate) {
          return problem(422, 'VALIDATION_FAILED', 'Invalid plate', undefined, [
            { field: 'plate', code: 'VALIDATION_FAILED', message: 'Invalid plate' },
          ]);
        }
        if (payload.vehicleId && mockParkingSessions.some((s) => s.vehicleId === payload.vehicleId && s.status === 'ACTIVE')) {
          return problem(409, 'SESSION_ALREADY_ACTIVE_FOR_VEHICLE', 'This vehicle already has an active session');
        }
        const plateSnapshot = guestPlate ?? normalizeMockPlate(vehicle!.plate);
        if (
          mockParkingSessions.some(
            (s) =>
              s.tenantId === tenantId &&
              s.status === 'ACTIVE' &&
              normalizeMockPlate(s.plateSnapshot) === plateSnapshot &&
              (guestPlate !== null || s.vehicleId === null),
          )
        ) {
          return problem(409, 'SESSION_ALREADY_ACTIVE_FOR_PLATE', 'This plate already has an active session here');
        }
        if (
          mockParkingSessions.some(
            (s) => s.tenantId === tenantId && s.zoneId === payload.zoneId && s.spaceCode === payload.spaceCode && s.status === 'ACTIVE',
          )
        ) {
          return problem(409, 'SPACE_OCCUPIED', 'This space is already occupied');
        }
        const quote = computeMockQuote(payload.zoneId, payload.minutes, userId, tenantId);
        const key = walletKey(userId, tenantId ?? '');
        const wallet = mockWallets.get(key) ?? { balanceMinor: 0, currencyCode: quote.currencyCode };
        if (wallet.balanceMinor < quote.payableMinor) {
          return problem(409, 'INSUFFICIENT_BALANCE', 'Insufficient wallet balance');
        }
        return idempotentResult(idempotencyKey, `session-start:${userId}`, () => {
          wallet.balanceMinor -= quote.payableMinor;
          mockWallets.set(key, wallet);
          if (quote.creditMinutesApplied > 0) {
            const credit = mockTimeCredits.get(key);
            if (credit) mockTimeCredits.set(key, { ...credit, minutes: Math.max(0, credit.minutes - quote.creditMinutesApplied) });
          }
          const startedAt = new Date();
          const record: MockParkingSessionRecord = {
            id: nextMockParkingSessionId(),
            userId,
            tenantId: tenantId ?? '',
            zoneId: payload.zoneId,
            zoneName: zoneNameForId(payload.zoneId),
            spaceCode: payload.spaceCode,
            vehicleId: payload.vehicleId ?? null,
            plateSnapshot: plateSnapshot,
            vehicleType: vehicle?.type ?? payload.vehicleType ?? 'CAR',
            spaceId: `space-${payload.spaceCode.toLowerCase()}`,
            minutes: payload.minutes,
            remainingMinutes: payload.minutes,
            amountMinor: quote.amountMinor,
            currencyCode: quote.currencyCode,
            creditMinutesApplied: quote.creditMinutesApplied,
            status: 'ACTIVE',
            startedAt: startedAt.toISOString(),
            expiresAt: new Date(startedAt.getTime() + payload.minutes * 60_000).toISOString(),
            endedAt: null,
          };
          mockParkingSessions.push(record);
          recordAuditEvent({
            tenantId: record.tenantId,
            actorUserId: userId,
            actorPortal: 'citizen',
            action: 'PARKING_SESSION_STARTED',
            resourceType: 'parking_session',
            resourceId: record.id,
            metadata: { vehicleId: payload.vehicleId ?? null, zoneId: payload.zoneId, minutes: payload.minutes },
          });
          return { data: toPublicSession(record), status: 201 };
        });
      }

      if (sub === 'sessions' && segments.length === 6) {
        const record = mockParkingSessions.find((s) => s.id === segments[5] && s.userId === userId);
        if (!record) return problem(404, 'SESSION_NOT_FOUND', 'Session not found');
        if (method === 'GET') return json({ session: toPublicSession(record), extensions: [] });
      }

      if (sub === 'sessions' && segments.length === 7 && segments[6] === 'extend' && method === 'POST') {
        const record = mockParkingSessions.find((s) => s.id === segments[5] && s.userId === userId);
        if (!record) return problem(404, 'SESSION_NOT_FOUND', 'Session not found');
        const payload = await readBody<ExtendParkingSessionRequest>(init);
        const policy = mockParkingPolicyForTenant(record.tenantId);
        if (!policy.extensionEnabled) return problem(409, 'EXTENSION_DISABLED', 'Extensions are disabled for this municipality');
        if (!policy.extensionIncrementsMinutes.includes(payload.minutes)) {
          return problem(422, 'INVALID_INCREMENT', 'Invalid extension duration');
        }
        if (record.minutes + payload.minutes > policy.extensionMaxTotalMinutes) {
          return problem(409, 'EXTENSION_EXCEEDS_MAX', 'Extension exceeds the maximum allowed for this session');
        }
        // Time credit is only ever applied at session start (CONTRACT.md v0.2 rule 5 — "se
        // consume primero en su próxima sesión"), never mid-session: an extension is charged the
        // zone's flat rate in full, so `mockZoneRate` is used directly instead of `computeMockQuote`.
        const rate = mockZoneRate(record.zoneId, record.tenantId);
        const amountMinor = Math.round(rate.rateMinorPerMinute * payload.minutes);
        const key = walletKey(userId, record.tenantId);
        const wallet = mockWallets.get(key) ?? { balanceMinor: 0, currencyCode: rate.currencyCode };
        if (wallet.balanceMinor < amountMinor) {
          return problem(409, 'INSUFFICIENT_BALANCE', 'Insufficient wallet balance');
        }
        return idempotentResult(idempotencyKey, `session-extend:${record.id}`, () => {
          wallet.balanceMinor -= amountMinor;
          mockWallets.set(key, wallet);
          record.minutes += payload.minutes;
          record.amountMinor += amountMinor;
          record.expiresAt = new Date(new Date(record.expiresAt).getTime() + payload.minutes * 60_000).toISOString();
          recordAuditEvent({
            tenantId: record.tenantId,
            actorUserId: userId,
            actorPortal: 'citizen',
            action: 'PARKING_SESSION_EXTENDED',
            resourceType: 'parking_session',
            resourceId: record.id,
            metadata: { minutes: payload.minutes },
          });
          return { data: toPublicSession(record), status: 200 };
        });
      }

      if (sub === 'sessions' && segments.length === 7 && segments[6] === 'finish' && method === 'POST') {
        const record = mockParkingSessions.find((s) => s.id === segments[5] && s.userId === userId);
        if (!record) return problem(404, 'SESSION_NOT_FOUND', 'Session not found');
        const policy = mockParkingPolicyForTenant(record.tenantId);
        if (!policy.earlyFinishEnabled) return problem(409, 'EARLY_FINISH_DISABLED', 'Early finish is disabled for this municipality');
        return idempotentResult(idempotencyKey, `session-finish:${record.id}`, () => {
          const remainingMinutes = Math.max(0, Math.round((new Date(record.expiresAt).getTime() - Date.now()) / 60_000));
          const shouldCredit = policy.creditOnEarlyFinishEnabled && remainingMinutes >= policy.creditMinRemainingMinutes;
          record.status = 'FINISHED';
          record.expiresAt = new Date().toISOString();
          let creditExpiresAt: string | null = null;
          if (shouldCredit) {
            const key = walletKey(userId, record.tenantId);
            const existing = mockTimeCredits.get(key) ?? { minutes: 0, expiresAt: null };
            creditExpiresAt =
              policy.creditExpiryDays > 0 ? new Date(Date.now() + policy.creditExpiryDays * 24 * 60 * 60 * 1000).toISOString() : null;
            mockTimeCredits.set(key, { minutes: existing.minutes + remainingMinutes, expiresAt: creditExpiresAt });
          }
          recordAuditEvent({
            tenantId: record.tenantId,
            actorUserId: userId,
            actorPortal: 'citizen',
            action: 'PARKING_SESSION_FINISHED',
            resourceType: 'parking_session',
            resourceId: record.id,
            metadata: { creditedMinutes: shouldCredit ? remainingMinutes : 0 },
          });
          record.endedAt = record.expiresAt;
          return { data: toPublicSession(record), status: 200 };
        });
      }
    }

    // ---- Wallet & time credits (CONTRACT.md v0.2 rules 5/6 — always scoped to the active tenant) --
    if (resource === 'wallet' && method === 'GET' && segments.length === 4) {
      const key = walletKey(userId, tenantId ?? '');
      const wallet = mockWallets.get(key) ?? { balanceMinor: 0, currencyCode: 'CRC' };
      return json({
        balance: { amountMinor: wallet.balanceMinor, currencyCode: wallet.currencyCode },
        transactions: {
          items: [
            {
              id: 'wallet-tx-mock-1',
              type: 'TOP_UP' as const,
              amount: { amountMinor: wallet.balanceMinor, currencyCode: wallet.currencyCode },
              balanceAfter: { amountMinor: wallet.balanceMinor, currencyCode: wallet.currencyCode },
              createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
            },
          ],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
        },
      });
    }

    if (resource === 'time-credits' && method === 'GET' && segments.length === 4) {
      const key = walletKey(userId, tenantId ?? '');
      const stored = mockTimeCredits.get(key) ?? { minutes: 0, expiresAt: null };
      const minutes = availableMockCreditMinutes(key);
      return json({
        balanceMinutes: minutes,
        lots:
          minutes > 0
            ? [
                {
                  id: 'time-credit-lot-mock-1',
                  source: 'EARLY_FINISH',
                  minutes,
                  remainingMinutes: minutes,
                  expiresAt: stored.expiresAt,
                  createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                },
              ]
            : [],
      });
    }
  }


  // ---- Enforcement (CONTRACT.md v0.7) ---------------------------------------------------------
  // Enough of the real behaviour for the demo builds to be honest rather than decorative: the four
  // plate verdicts with the bay as the discriminator, a catalogue, and citations that are
  // append-only and idempotent by `deviceCitationId`. Everything a screen can reach is here; the
  // parts a screen never sees (storage of the bytes, the SHA-256, the numbering lock) are not.
  if (segments[2] === 'inspector' || (segments[2] === 'admin' && segments[3] === 'enforcement')) {
    const authHeader = new Headers(init?.headers).get('Authorization');
    const claims = authHeader ? decodeMockClaims(authHeader) : null;
    if (!claims) return problem(401, 'UNAUTHORIZED', 'Missing or invalid session');
    const userId = claims.sub;
    const tenantId = claims.tid ?? '';
    seedMockAppeals();

    // POST /inspector/plate-checks (v0.29) y el GET obsoleto que se mantiene una versión.
    const isPlateCheck = segments[2] === 'inspector'
      && ((segments[3] === 'plate-checks' && method === 'POST')
        || (segments[3] === 'plates' && segments[5] === 'status' && method === 'GET'));
    if (isPlateCheck) {
      const body = method === 'POST' ? await readBody<PlateCheckRequest>(init) : null;
      const plate = normalizeMockPlate(
        body ? body.plate : decodeURIComponent(segments[4] ?? ''),
      );
      const zoneId = body ? body.zoneId ?? null : url.searchParams.get('zoneId');
      const spaceCode = body ? body.spaceCode ?? null : url.searchParams.get('spaceCode');
      // El GET obsoleto no puede traer coordenadas: unas coordenadas en la barra de direcciones son
      // datos personales en el historial y en los registros del proxy.
      const locationState = (body?.locationState ?? 'NOT_GRANTED') as LocationState;
      // Half a pair identifies no bay — the server's own rule, mirrored so the client is exercised
      // against it rather than against a mock that is more forgiving than production.
      // Se registra el intento ANTES de contestar, para que un rechazo también deje rastro: hasta
      // v0.29 una consulta a una zona no asignada no se sabía siquiera que había ocurrido.
      const recordCheck = (verdictOrNull: string | null, refusal: string | null): string => {
        const id = `check-${crypto.randomUUID()}`;
        mockEnforcementChecks.unshift({
          id,
          tenantId: tenantId ?? '',
          inspectorUserId: userId,
          inspectorName: mockUsersById.get(userId)
            ? `${mockUsersById.get(userId)!.profile.givenName} ${mockUsersById.get(userId)!.profile.familyName}`
            : null,
          plate,
          plateRaw: body ? body.plate : decodeURIComponent(segments[4] ?? ''),
          zoneId: zoneId ?? null,
          zoneName: zoneId ? zoneNameForId(zoneId) : null,
          spaceCode: spaceCode ?? null,
          verdict: verdictOrNull,
          refusalCode: refusal,
          locationState,
          latitude: locationState === 'FIX' ? body?.latitude ?? null : null,
          longitude: locationState === 'FIX' ? body?.longitude ?? null : null,
          locationAccuracyM: locationState === 'FIX' ? body?.locationAccuracyM ?? null : null,
          userAgent: new Headers(init?.headers).get('User-Agent'),
          citationIssued: false,
          occurredAt: new Date().toISOString(),
        });
        return id;
      };

      if (Boolean(zoneId) !== Boolean(spaceCode)) {
        recordCheck(null, 'VALIDATION_FAILED');
        return problem(400, 'VALIDATION_FAILED', 'Validation failed', undefined, [
          { field: zoneId ? 'spaceCode' : 'zoneId', code: 'VALIDATION_FAILED', message: 'Zone and bay travel together' },
        ]);
      }
      const stays = mockParkingSessions
        .filter((s) => s.tenantId === tenantId && s.status === 'ACTIVE' && normalizeMockPlate(s.plateSnapshot) === plate)
        .map((s) => ({
          sessionId: s.id,
          zoneId: s.zoneId,
          zoneCode: s.zoneId,
          zoneName: s.zoneName,
          spaceId: s.spaceId,
          spaceCode: s.spaceCode,
          startedAt: s.startedAt,
          expiresAt: s.expiresAt,
        }));
      const bay = zoneId && spaceCode
        ? { spaceId: `${zoneId}:${spaceCode}`, spaceCode, zoneId, zoneCode: zoneId, zoneName: zoneNameForId(zoneId) }
        : null;
      // Estadías que el RELOJ terminó, recientes. Es lo que permite decir «venció hace 12 minutos»
      // en vez de «no pagó», que hasta v0.28 era la misma respuesta (CONTRACT.md v0.28).
      const since = Date.now() - 3 * 3600 * 1000;
      const expiredStays = mockParkingSessions
        .filter(
          (s) =>
            s.tenantId === tenantId
            && s.status === 'EXPIRED'
            && normalizeMockPlate(s.plateSnapshot) === plate
            && new Date(s.expiresAt).getTime() >= since,
        )
        .map((s) => ({
          sessionId: s.id,
          zoneId: s.zoneId,
          zoneCode: s.zoneId,
          zoneName: s.zoneName,
          spaceId: s.spaceId,
          spaceCode: s.spaceCode,
          startedAt: s.startedAt,
          expiresAt: s.expiresAt,
        }));

      type MockStay = (typeof stays)[number];
      const graceMinutes = mockParkingPolicyForTenant(tenantId).graceMinutes ?? 0;
      let verdict: string;
      let covering: MockStay | null = null;
      let expiredHere: MockStay | null = null;
      let others: MockStay[] = stays;

      // PRIMERO la exoneración, antes que nada sobre el pago: una ambulancia no se multa haya
      // pagado o no, y preguntar por el pago primero contestaría «no pagó» sobre un vehículo que
      // esta municipalidad ya decidió no multar nunca.
      // Se resuelve por las placas del permiso (v0.30) y no por la copia del padre: un permiso de
      // discapacidad ampara varias, y buscar sólo la primera dejaría multando el carro del hijo.
      const exemption = mockExemptions.find(
        (e) => e.tenantId === tenantId && e.status === 'APPROVED'
          && e.plates.some((p) => p.plate === plate && p.status === 'APPROVED')
          && new Date(e.validFrom) <= new Date()
          && (!e.validTo || new Date(e.validTo) > new Date()),
      );
      if (exemption) {
        verdict = 'EXEMPT';
        others = [];
      } else if (stays.length === 0 && expiredStays.length === 0) {
        verdict = 'NOT_COVERED';
      } else if (!bay) {
        verdict = 'AMBIGUOUS';
      } else {
        covering = stays.find((s) => s.zoneId === zoneId && s.spaceCode === spaceCode) ?? null;
        others = stays.filter((s) => s !== covering);
        expiredHere = expiredStays.find((s) => s.zoneId === zoneId && s.spaceCode === spaceCode) ?? null;
        verdict = covering
          ? 'COVERED'
          : expiredHere
            ? 'EXPIRED'
            : others.length > 0
              ? 'BAY_MISMATCH'
              : 'NOT_COVERED';
      }
      const checkId = recordCheck(verdict, null);
      return json({
        plate,
        plateNormalized: plate,
        verdict,
        verdictLabelKey: `plate.verdict.${verdict.toLowerCase()}`,
        checkId,
        requiresBay: verdict === 'AMBIGUOUS',
        bay: verdict === 'AMBIGUOUS' ? null : bay,
        coveringStay: covering,
        expiredStay: expiredHere,
        exemption: exemption
          ? {
              id: exemption.id,
              plate: exemption.plate,
              reason: exemption.reason,
              documentRef: exemption.documentRef,
              // La categoría sí viaja al fiscalizador; el BENEFICIARIO no: saber de quién es el
              // permiso no cambia la decisión de no multar, y sí cambia lo que un dispositivo anda
              // cargando sobre una persona por la calle.
              typeName:
                mockExemptionTypes.find((t) => t.id === exemption.exemptionTypeId)?.name ?? null,
              validFrom: exemption.validFrom,
              validTo: exemption.validTo,
            }
          : null,
        otherStays: others,
        graceMinutes,
        checkedAt: new Date().toISOString(),
      });
    }

    // GET /api/v1/inspector/zones — el catálogo que el servidor publicaba desde v0.7 y ninguna
    // pantalla llamaba, por lo que un dispositivo recién instalado no conocía ninguna zona y sólo
    // podía obtener AMBIGUOUS (CONTRACT.md v0.28).
    if (segments[2] === 'inspector' && segments[3] === 'zones' && method === 'GET') {
      return json(
        (mockCitizenZones(tenantId) as { id: string; code: string; name: string }[]).map((zone) => ({
          id: zone.id,
          code: zone.code,
          name: zone.name,
          description: null,
        })),
      );
    }

    // GET /api/v1/admin/enforcement/checks — el registro de fiscalización (CONTRACT.md v0.29).
    if (segments[2] === 'admin' && segments[3] === 'enforcement' && segments[4] === 'checks'
      && method === 'GET') {
      const inspectorFilter = url.searchParams.get('inspectorUserId');
      const zoneFilter = url.searchParams.get('zoneId');
      const plateFilter = normalizeMockPlate(url.searchParams.get('plate') ?? '');
      const verdictFilter = url.searchParams.get('verdict');
      const rows = mockEnforcementChecks
        .filter((c) => c.tenantId === tenantId)
        .filter((c) => !inspectorFilter || c.inspectorUserId === inspectorFilter)
        .filter((c) => !zoneFilter || c.zoneId === zoneFilter)
        .filter((c) => !plateFilter || c.plate.includes(plateFilter))
        .filter((c) => !verdictFilter || c.verdict === verdictFilter);
      return json(paginate(rows, Number(url.searchParams.get('page') ?? '0'),
        Number(url.searchParams.get('size') ?? '20')));
    }

    // --- Categorías de permiso (CONTRACT.md v0.30) ----------------------------------------------
    // Configuración y no enumeración: qué exonera un país no es lo que exonera otro.
    if (segments[2] === 'admin' && segments[3] === 'enforcement' && segments[4] === 'exemption-types') {
      const mineTypes = mockExemptionTypes.filter((t) => t.tenantId === tenantId);
      const toType = (type: MockExemptionType) => ({
        id: type.id,
        code: type.code,
        name: type.name,
        description: type.description,
        requiresBeneficiary: type.requiresBeneficiary,
        active: type.active,
      });
      if (method === 'GET' && segments.length === 5) {
        const activeOnly = url.searchParams.get('activeOnly') === 'true';
        return json(mineTypes.filter((t) => !activeOnly || t.active).map(toType));
      }
      if (method === 'POST' && segments.length === 5) {
        const payload = await readBody<SaveExemptionTypeRequest>(init);
        const code = (payload.code ?? '').trim().toUpperCase();
        if (!code || !/^[A-Z0-9_]+$/.test(code)) {
          return problem(422, 'VALIDATION_FAILED', 'That code is not valid');
        }
        if (!payload.name?.trim()) return problem(422, 'VALIDATION_FAILED', 'A name is required');
        if (mineTypes.some((t) => t.code === code)) {
          return problem(409, 'EXEMPTION_TYPE_CODE_TAKEN', 'That code is already used');
        }
        const type: MockExemptionType = {
          id: `type-${crypto.randomUUID()}`,
          tenantId: tenantId ?? '',
          code,
          name: payload.name.trim(),
          description: payload.description?.trim() || null,
          requiresBeneficiary: payload.requiresBeneficiary,
          active: true,
        };
        mockExemptionTypes.push(type);
        return json(toType(type), 201);
      }
      if (method === 'PUT' && segments.length === 6) {
        const type = mineTypes.find((t) => t.id === segments[5]);
        if (!type) return problem(404, 'EXEMPTION_TYPE_NOT_FOUND', 'That category does not exist');
        const payload = await readBody<SaveExemptionTypeRequest>(init);
        if (!payload.name?.trim()) return problem(422, 'VALIDATION_FAILED', 'A name is required');
        // El código nunca se edita: es lo que una regla futura reconocería.
        type.name = payload.name.trim();
        type.description = payload.description?.trim() || null;
        type.requiresBeneficiary = payload.requiresBeneficiary;
        type.active = payload.active ?? true;
        return json(toType(type));
      }
    }

    // --- Permisos y exoneraciones (CONTRACT.md v0.30) -------------------------------------------
    if (segments[2] === 'admin' && segments[3] === 'enforcement' && segments[4] === 'exemptions') {
      const mine = mockExemptions.filter((e) => e.tenantId === tenantId);
      const granted = (status: MockExemption['status']) => status === 'APPROVED';
      const toResponse = (exemption: MockExemption) => {
        const nowDate = new Date();
        const from = new Date(exemption.validFrom);
        const to = exemption.validTo ? new Date(exemption.validTo) : null;
        const type = mockExemptionTypes.find((t) => t.id === exemption.exemptionTypeId) ?? null;
        return {
          ...exemption,
          exemptionTypeCode: type?.code ?? null,
          exemptionTypeName: type?.name ?? null,
          // Los tres calculados contra el reloj, nunca guardados: vencer es un hecho del reloj y una
          // columna necesitaría un trabajo para mantenerse cierta.
          inForce: granted(exemption.status) && from <= nowDate && (!to || to > nowDate),
          pending: granted(exemption.status) && from > nowDate,
          expired: granted(exemption.status) && !!to && to <= nowDate,
          selfApproved:
            exemption.requestedBy !== null && exemption.requestedBy === exemption.decidedBy,
          documentCount: mockExemptionDocuments.filter((d) => d.exemptionId === exemption.id).length,
        };
      };
      /** Una aprobada por placa y municipalidad, igual que el índice parcial del servidor. */
      const takenBy = (plate: string, selfId: string | null) =>
        mine.some(
          (e) =>
            e.id !== selfId &&
            e.status === 'APPROVED' &&
            e.plates.some((p) => p.plate === plate && p.status === 'APPROVED'),
        );

      if (method === 'GET' && segments.length === 5) {
        const statusFilter = url.searchParams.get('status');
        const typeFilter = url.searchParams.get('exemptionTypeId');
        const plateFilter = normalizeMockPlate(url.searchParams.get('plate') ?? '');
        const rows = mine
          .filter((e) => !statusFilter || e.status === statusFilter)
          .filter((e) => !typeFilter || e.exemptionTypeId === typeFilter)
          // Contra las placas del hijo y no contra la copia del padre: buscar sólo la primera
          // escondería justamente la fila que alguien anda buscando.
          .filter((e) => !plateFilter || e.plates.some((p) => p.plate.includes(plateFilter)))
          .map(toResponse);
        return json(paginate(rows, Number(url.searchParams.get('page') ?? '0'),
          Number(url.searchParams.get('size') ?? '20')));
      }
      if (method === 'POST' && segments.length === 5) {
        const payload = await readBody<RequestExemptionRequest & { plate?: string }>(init);
        const raw = payload.plates?.length ? payload.plates : payload.plate ? [payload.plate] : [];
        const legacy = !payload.plates?.length && !!payload.plate;
        if (!raw.length) return problem(422, 'VALIDATION_FAILED', 'At least one plate is required');
        if (!payload.reason?.trim()) return problem(422, 'VALIDATION_FAILED', 'A reason is required');
        const type =
          mockExemptionTypes.find(
            (t) => t.tenantId === tenantId && t.id === payload.exemptionTypeId,
          ) ??
          mockExemptionTypes.find((t) => t.tenantId === tenantId && t.code === 'SPECIAL') ??
          null;
        if (!type) return problem(404, 'EXEMPTION_TYPE_NOT_FOUND', 'That category does not exist');
        if (!type.active) {
          return problem(422, 'EXEMPTION_TYPE_INACTIVE', 'That category was retired');
        }
        if (type.requiresBeneficiary && (!payload.beneficiaryName?.trim() || !payload.beneficiaryKind)) {
          return problem(422, 'VALIDATION_FAILED', 'This category requires a beneficiary');
        }
        const plates: MockExemption['plates'] = [];
        for (const value of raw) {
          const plate = normalizeMockPlate(value);
          if (!plate) return problem(422, 'VALIDATION_FAILED', 'That plate cannot be read');
          if (takenBy(plate, null)) {
            return problem(409, 'EXEMPTION_ALREADY_EXISTS', 'That plate already has an approved permit');
          }
          if (!plates.some((p) => p.plate === plate)) {
            plates.push({
              plate,
              plateRaw: value.trim(),
              status: 'PENDING',
              addedAt: new Date().toISOString(),
            });
          }
        }
        const stamp = new Date().toISOString();
        const exemption: MockExemption = {
          id: `exemption-${crypto.randomUUID()}`,
          tenantId: tenantId ?? '',
          plate: plates[0]!.plate,
          plateRaw: plates[0]!.plateRaw,
          plates,
          exemptionTypeId: type.id,
          beneficiaryKind: payload.beneficiaryKind ?? null,
          beneficiaryName: payload.beneficiaryName?.trim() || null,
          beneficiaryDocument: payload.beneficiaryDocument?.trim() || null,
          reason: payload.reason.trim(),
          documentRef: payload.documentRef?.trim() || null,
          // Un permiso no otorga nada hasta que se otorga.
          status: 'PENDING',
          validFrom: payload.validFrom ?? stamp,
          validTo: payload.validTo ?? null,
          requestedAt: stamp,
          requestedByName: 'Ana Solís',
          requestedBy: userId ?? null,
          decidedAt: null,
          decidedByName: null,
          decidedBy: null,
          decisionReason: null,
          grantedAt: stamp,
          revokedAt: null,
          revokeReason: null,
        };
        mockExemptions.push(exemption);
        recordAuditEvent({
          tenantId: tenantId ?? null,
          actorUserId: userId,
          actorPortal: 'admin',
          action: 'PLATE_EXEMPTION_REQUESTED',
          resourceType: 'plate-exemption',
          resourceId: exemption.id,
          metadata: { plates: exemption.plates.map((p) => p.plate).join(',') },
        });
        if (legacy) {
          // La forma de v0.28 se responde con el COMPORTAMIENTO de v0.28: se registra y se otorga en
          // un solo acto, por la misma persona, y queda anotado — cambiarle el significado a la
          // llamada de un cliente viejo dejaría multando un vehículo que su operador cree exonerado.
          exemption.status = 'APPROVED';
          exemption.plates.forEach((plate) => (plate.status = 'APPROVED'));
          exemption.decidedAt = stamp;
          exemption.decidedByName = 'Ana Solís';
          exemption.decidedBy = userId ?? null;
        }
        return json(toResponse(exemption), 201);
      }
      if (segments.length >= 6) {
        const exemption = mine.find((e) => e.id === segments[5]);
        if (!exemption) return problem(404, 'EXEMPTION_NOT_FOUND', 'Exemption not found');
        const editable = exemption.status === 'PENDING' || exemption.status === 'APPROVED';

        if (!segments[6] && method === 'GET') {
          return json(toResponse(exemption));
        }
        if (segments[6] === 'approve' && method === 'POST') {
          if (exemption.status !== 'PENDING') {
            return problem(409, 'EXEMPTION_NOT_PENDING', 'Somebody has already decided that permit');
          }
          for (const plate of exemption.plates) {
            if (takenBy(plate.plate, exemption.id)) {
              return problem(409, 'EXEMPTION_ALREADY_EXISTS', 'That plate already has an approved permit');
            }
          }
          exemption.status = 'APPROVED';
          exemption.plates.forEach((plate) => (plate.status = 'APPROVED'));
          exemption.decidedAt = new Date().toISOString();
          exemption.decidedByName = 'Ana Solís';
          exemption.decidedBy = userId ?? null;
          exemption.decisionReason = null;
          exemption.grantedAt = exemption.decidedAt;
          recordAuditEvent({
            tenantId: tenantId ?? null,
            actorUserId: userId,
            actorPortal: 'admin',
            action: 'PLATE_EXEMPTION_APPROVED',
            resourceType: 'plate-exemption',
            resourceId: exemption.id,
            metadata: {
              plates: exemption.plates.map((p) => p.plate).join(','),
              selfApproved: String(exemption.requestedBy === exemption.decidedBy),
            },
          });
          return json(toResponse(exemption));
        }
        if (segments[6] === 'reject' && method === 'POST') {
          const payload = await readBody<{ reason: string }>(init);
          if (exemption.status !== 'PENDING') {
            return problem(409, 'EXEMPTION_NOT_PENDING', 'Somebody has already decided that permit');
          }
          if (!payload.reason?.trim()) {
            return problem(422, 'VALIDATION_FAILED', 'A reason is required');
          }
          exemption.status = 'REJECTED';
          exemption.plates.forEach((plate) => (plate.status = 'REJECTED'));
          exemption.decidedAt = new Date().toISOString();
          exemption.decidedByName = 'Ana Solís';
          exemption.decidedBy = userId ?? null;
          exemption.decisionReason = payload.reason.trim();
          return json(toResponse(exemption));
        }
        if (segments[6] === 'revoke' && method === 'POST') {
          const payload = await readBody<{ reason: string }>(init);
          if (exemption.status !== 'APPROVED') {
            return problem(409, 'EXEMPTION_NOT_ACTIVE', 'That permit is not in force');
          }
          if (!payload.reason?.trim()) {
            return problem(422, 'VALIDATION_FAILED', 'A reason is required');
          }
          exemption.status = 'REVOKED';
          exemption.plates.forEach((plate) => (plate.status = 'REVOKED'));
          exemption.revokedAt = new Date().toISOString();
          exemption.revokeReason = payload.reason.trim();
          return json(toResponse(exemption));
        }
        if (segments[6] === 'plates' && method === 'POST') {
          const payload = await readBody<{ plate: string }>(init);
          if (!editable) return problem(409, 'EXEMPTION_NOT_EDITABLE', 'That permit is no longer edited');
          const plate = normalizeMockPlate(payload.plate ?? '');
          if (!plate) return problem(422, 'VALIDATION_FAILED', 'That plate cannot be read');
          if (exemption.plates.some((p) => p.plate === plate)) {
            return problem(409, 'EXEMPTION_ALREADY_EXISTS', 'That plate is already covered');
          }
          if (exemption.plates.length >= 10) {
            return problem(409, 'EXEMPTION_PLATE_LIMIT', 'A permit cannot cover more plates');
          }
          if (takenBy(plate, exemption.id)) {
            return problem(409, 'EXEMPTION_ALREADY_EXISTS', 'That plate already has an approved permit');
          }
          exemption.plates.push({
            plate,
            plateRaw: payload.plate.trim(),
            status: exemption.status,
            addedAt: new Date().toISOString(),
          });
          exemption.plate = exemption.plates[0]!.plate;
          exemption.plateRaw = exemption.plates[0]!.plateRaw;
          return json(toResponse(exemption));
        }
        if (segments[6] === 'plates' && segments[7] && method === 'DELETE') {
          if (!editable) return problem(409, 'EXEMPTION_NOT_EDITABLE', 'That permit is no longer edited');
          const plate = normalizeMockPlate(decodeURIComponent(segments[7]));
          const index = exemption.plates.findIndex((p) => p.plate === plate);
          if (index < 0) return problem(404, 'EXEMPTION_NOT_FOUND', 'That plate is not covered');
          // La última no se quita: un permiso que no ampara nada es una municipalidad habiendo
          // decidido algo sobre ningún vehículo. Revocar es el acto que se quería.
          if (exemption.plates.length <= 1) {
            return problem(409, 'EXEMPTION_LAST_PLATE', 'A permit has to cover at least one plate');
          }
          exemption.plates.splice(index, 1);
          exemption.plate = exemption.plates[0]!.plate;
          exemption.plateRaw = exemption.plates[0]!.plateRaw;
          return json(toResponse(exemption));
        }
        if (segments[6] === 'documents' && method === 'GET') {
          return json(
            mockExemptionDocuments
              .filter((d) => d.exemptionId === exemption.id)
              .map((d) => ({
                id: d.id,
                title: d.title,
                contentType: d.contentType,
                byteSize: d.byteSize,
                sha256: d.sha256,
                uploadedByName: d.uploadedByName,
                createdAt: d.createdAt,
              })),
          );
        }
        if (segments[6] === 'documents' && method === 'POST') {
          const form = init?.body instanceof FormData ? init.body : null;
          const file = form?.get('file');
          const title = String(form?.get('title') ?? '').trim();
          if (!title) return problem(422, 'VALIDATION_FAILED', 'The document needs a name');
          if (!(file instanceof File) || file.size === 0) {
            return problem(422, 'VALIDATION_FAILED', 'The file is empty');
          }
          if (mockExemptionDocuments.filter((d) => d.exemptionId === exemption.id).length >= 10) {
            return problem(409, 'EXEMPTION_DOCUMENT_LIMIT', 'This permit already carries the maximum');
          }
          const document: MockExemptionDocument = {
            id: `exemption-doc-${crypto.randomUUID()}`,
            exemptionId: exemption.id,
            title,
            // El servidor lo decide leyendo la cabecera del archivo; el simulador no puede, así que
            // acepta lo declarado y lo dice aquí en vez de fingir que hizo la comprobación.
            contentType: file.type || 'application/octet-stream',
            byteSize: file.size,
            sha256: crypto.randomUUID().replace(/-/g, '').repeat(2).slice(0, 64),
            uploadedByName: 'Ana Solís',
            createdAt: new Date().toISOString(),
          };
          mockExemptionDocuments.push(document);
          return json(
            {
              id: document.id,
              title: document.title,
              contentType: document.contentType,
              byteSize: document.byteSize,
              sha256: document.sha256,
              uploadedByName: document.uploadedByName,
              createdAt: document.createdAt,
            },
            201,
          );
        }
        if (!segments[6] && method === 'PUT') {
          const payload = await readBody<AmendExemptionRequest>(init);
          if (!editable) {
            return problem(409, 'EXEMPTION_NOT_EDITABLE', 'That permit is no longer edited');
          }
          if (!payload.reason?.trim()) {
            return problem(422, 'VALIDATION_FAILED', 'A reason is required');
          }
          if (payload.exemptionTypeId) {
            const type = mockExemptionTypes.find(
              (t) => t.tenantId === tenantId && t.id === payload.exemptionTypeId,
            );
            if (!type) return problem(404, 'EXEMPTION_TYPE_NOT_FOUND', 'That category does not exist');
            if (!type.active) return problem(422, 'EXEMPTION_TYPE_INACTIVE', 'That category was retired');
            exemption.exemptionTypeId = type.id;
          }
          exemption.beneficiaryKind = payload.beneficiaryKind ?? null;
          exemption.beneficiaryName = payload.beneficiaryName?.trim() || null;
          exemption.beneficiaryDocument = payload.beneficiaryDocument?.trim() || null;
          exemption.reason = payload.reason.trim();
          exemption.documentRef = payload.documentRef?.trim() || null;
          if (payload.validFrom) exemption.validFrom = payload.validFrom;
          exemption.validTo = payload.validTo ?? null;
          return json(toResponse(exemption));
        }
      }
    }

    // GET /inspector/enforcement/infraction-types | GET|PUT /admin/enforcement/infraction-types
    if (segments[segments.length - 1] === 'infraction-types') {
      const types = mockInfractionTypes(tenantId);
      if (method === 'GET') {
        return json(segments[2] === 'inspector' ? types.filter((type) => type.active) : types);
      }
      if (method === 'PUT') {
        const payload = await readBody<{ infractionTypes: Record<string, unknown>[] }>(init);
        return json(replaceMockInfractionTypes(tenantId, payload.infractionTypes ?? []));
      }
    }

    // GET /admin/enforcement/appeals — the moderation queue, oldest first.
    if (segments[2] === 'admin' && segments[4] === 'appeals' && method === 'GET') {
      const filter = url.searchParams.get('status') ?? 'SUBMITTED';
      const rows = mockCitations
        .filter((c) => c.tenantId === tenantId && c.appeal !== null)
        .map((c) => c.appeal!)
        .filter((a) => filter === 'ALL' || a.status === filter)
        // Oldest first, and not as a preference: newest-first is the order in which the oldest case
        // is never reached.
        .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
      const paged = paginate(rows, Number(url.searchParams.get('page') ?? 0), Number(url.searchParams.get('size') ?? 20));
      const maxImages = mockAppealMaxImages(tenantId);
      return json({ ...paged, items: paged.items.map((a) => toWireAppeal(a, maxImages)) });
    }

    // GET|PUT /admin/enforcement/appeal-notice[/versions]
    if (segments[2] === 'admin' && segments[4] === 'appeal-notice') {
      if (method === 'GET' && segments[5] === 'versions') return json(mockNoticesFor(tenantId));
      if (method === 'GET') return json(mockNoticeInForce(tenantId));
      if (method === 'PUT') {
        const payload = await readBody<{ locale?: string; body: string; effectiveFrom?: string }>(init);
        const notices = mockNoticesFor(tenantId);
        // Inserts, never edits: every defence already filed points at the text its author read.
        const notice: MockAppealNotice = {
          id: `${tenantId}-notice-${notices.length + 1}`,
          version: notices.length + 1,
          locale: payload.locale ?? 'es-CR',
          body: payload.body,
          effectiveFrom: payload.effectiveFrom ?? new Date().toISOString(),
          countryDefault: false,
        };
        notices.push(notice);
        return json(notice);
      }
    }

    // Citations, for both portals.
    const citationsRoot = segments[2] === 'inspector' ? 4 : 5;
    if (segments[citationsRoot - 1] === 'citations') {
      const id = segments[citationsRoot];
      const action = segments[citationsRoot + 1];

      if (method === 'GET' && !id) {
        const mine = segments[2] === 'inspector';
        const rows = mockCitations
          .filter((c) => c.tenantId === tenantId && (!mine || c.inspectorUserId === userId))
          .filter((c) => {
            const status = url.searchParams.get('status');
            const plate = url.searchParams.get('plate');
            return (!status || c.status === status) && (!plate || c.plate.includes(normalizeMockPlate(plate)));
          })
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
        const page = Number(url.searchParams.get('page') ?? 0);
        const size = Number(url.searchParams.get('size') ?? 20);
        const paged = paginate(rows, page, size);
        return json({ ...paged, items: paged.items.map((c) => toWireCitation(c, 0)) });
      }

      if (method === 'POST' && !id) {
        const payload = await readBody<Record<string, string | number | undefined>>(init);
        const type = mockInfractionTypes(tenantId).find((candidate) => candidate.id === payload.infractionTypeId);
        if (!type) return problem(404, 'INFRACTION_TYPE_NOT_FOUND', 'Infraction type not found');
        // `deviceCitationId` protects the act: a resend resolves to the citation that already
        // exists and answers 200, exactly as the real server does.
        const existing = mockCitations.find(
          (c) => c.tenantId === tenantId && payload.deviceCitationId && c.deviceCitationId === payload.deviceCitationId,
        );
        if (existing) return json(toWireDetail(existing), 200);
        const record = createMockCitation(tenantId, userId, payload, type);
        // La consulta de la que salió queda marcada. Es lo que contesta «acción realizada» y, al
        // revés, «me multaron sin ir a ver el carro» (CONTRACT.md v0.29).
        const fromCheck = mockEnforcementChecks.find((c) => c.id === payload.enforcementCheckId);
        if (fromCheck) fromCheck.citationIssued = true;
        return json(toWireDetail(record), 201);
      }

      const record = mockCitations.find((c) => c.id === id && c.tenantId === tenantId);
      if (!record) return problem(404, 'CITATION_NOT_FOUND', 'Citation not found');

      if (method === 'GET' && !action) return json(toWireDetail(record));

      if (method === 'POST' && action === 'issue') {
        if (record.evidence.filter((e) => e.kind === 'PHOTO').length === 0 && record.requiresPhoto) {
          return problem(409, 'CITATION_EVIDENCE_REQUIRED', 'A photograph is required');
        }
        issueMockCitation(record);
        return json(toWireDetail(record));
      }

      if (method === 'POST' && action === 'evidence') {
        const note = init?.body instanceof FormData ? null : (await readBody<{ note?: string }>(init)).note ?? null;
        const evidence = {
          id: `evidence-${record.evidence.length + 1}-${record.id}`,
          kind: note ? ('NOTE' as const) : ('PHOTO' as const),
          contentType: note ? null : 'image/jpeg',
          byteSize: note ? null : 0,
          sha256: note ? null : 'mock-digest-not-computed',
          note,
          capturedAt: new Date().toISOString(),
          latitude: null,
          longitude: null,
          createdAt: new Date().toISOString(),
        };
        record.evidence.push(evidence);
        record.events.push(mockEvent(record, 'EVIDENCE_ATTACHED', record.status, record.status, null));
        return json({ ...evidence, contentUrl: null });
      }

      // POST /admin/enforcement/citations/{id}/appeal/resolve
      if (method === 'POST' && action === 'appeal' && segments[citationsRoot + 2] === 'resolve') {
        const { accept, reason } = await readBody<{ accept: boolean; reason: string }>(init);
        if (!record.appeal) return problem(404, 'APPEAL_NOT_FOUND', 'No defence was filed against this citation');
        // Once, and only once: a decision that could be taken twice is a decision the citizen can
        // watch change after they were told the outcome.
        if (record.appeal.status !== 'SUBMITTED') {
          return problem(409, 'APPEAL_ALREADY_RESOLVED', 'This defence was already decided');
        }
        if (!reason || !reason.trim()) {
          return problem(400, 'VALIDATION_FAILED', 'Validation failed', undefined, [
            { field: 'reason', code: 'VALIDATION_FAILED', message: 'A reason is required in both directions' },
          ]);
        }
        resolveMockAppeal(record, Boolean(accept), reason);
        return json(toWireDetail(record));
      }

      if (method === 'POST' && action === 'cancel') {
        const { reason } = await readBody<{ reason: string }>(init);
        record.events.push(mockEvent(record, 'CANCELLED', record.status, 'CANCELLED', reason));
        record.status = 'CANCELLED';
        record.statusReason = reason;
        return json(toWireDetail(record));
      }
    }
  }

  // ---- Citizen fines (CONTRACT.md v0.7) --------------------------------------------------------
  if (segments[2] === 'citizen' && segments[3] === 'fines') {
    const authHeader = new Headers(init?.headers).get('Authorization');
    const claims = authHeader ? decodeMockClaims(authHeader) : null;
    if (!claims) return problem(401, 'UNAUTHORIZED', 'Missing or invalid session');
    const tenantId = claims.tid ?? '';
    seedMockAppeals();
    // Matched by the caller's own vehicles, never by plate — the leak the real server refuses too.
    const plates = new Set(mockVehicles.filter((v) => v.userId === claims.sub).map((v) => v.plate));
    const rows = mockCitations.filter((c) => c.tenantId === tenantId && plates.has(c.plate) && c.status !== 'DRAFT');
    const id = segments[4];
    // Before the citation lookup: `appeal-notice` sits where an id would and is not one.
    if (method === 'GET' && id === 'appeal-notice') return json(mockNoticeInForce(tenantId));
    if (method === 'GET' && !id) {
      const page = Number(url.searchParams.get('page') ?? 0);
      const size = Number(url.searchParams.get('size') ?? 20);
      const paged = paginate(rows, page, size);
      return json({ ...paged, items: paged.items.map(toWireFine) });
    }
    const record = rows.find((c) => c.id === id);
    if (!record) return problem(404, 'CITATION_NOT_FOUND', 'Citation not found');
    const maxImages = mockAppealMaxImages(tenantId);
    if (method === 'GET' && segments.length === 5) {
      return json({
        fine: toWireFine(record),
        evidence: record.evidence.map((e) => ({ ...e, contentUrl: null })),
        history: record.events,
        // The defence travels with the detail: the answer is what decides whether the screen offers
        // to write one or shows the one already filed.
        appeal: record.appeal ? toWireAppeal(record.appeal, maxImages) : null,
      });
    }

    // POST /citizen/fines/{id}/appeals — the text and the notice that was on screen.
    if (method === 'POST' && segments[5] === 'appeals') {
      const payload = await readBody<{ body: string; acceptedNoticeId: string }>(init);
      if (!record.allowsAppeal || !['ISSUED', 'UPHELD', 'EXPIRED'].includes(record.status)) {
        return problem(409, 'CITATION_NOT_APPEALABLE', 'This citation cannot be appealed');
      }
      if (record.appeal) return problem(409, 'APPEAL_ALREADY_FILED', 'A defence was already filed');
      const notice = mockNoticeInForce(tenantId);
      // The stale-tab refusal, mirrored: filing against wording nobody is showing any more would
      // make `noticeVersion` a lie.
      if (payload.acceptedNoticeId !== notice.id) {
        return problem(409, 'APPEAL_NOTICE_OUTDATED', 'The notice changed while you were writing');
      }
      if (!payload.body || payload.body.trim().length === 0) {
        return problem(400, 'VALIDATION_FAILED', 'Validation failed', undefined, [
          { field: 'body', code: 'VALIDATION_FAILED', message: 'A defence needs a body' },
        ]);
      }
      return json(toWireAppeal(fileMockAppeal(record, claims.sub, payload.body.trim(), notice), maxImages), 201);
    }

    if (method === 'GET' && segments[5] === 'appeal') {
      if (!record.appeal) return problem(404, 'APPEAL_NOT_FOUND', 'No defence was filed against this citation');
      return json(toWireAppeal(record.appeal, maxImages));
    }

    // POST /citizen/fines/{id}/appeal/images
    if (method === 'POST' && segments[5] === 'appeal' && segments[6] === 'images') {
      if (!record.appeal) return problem(404, 'APPEAL_NOT_FOUND', 'No defence was filed against this citation');
      if (record.appeal.status !== 'SUBMITTED') {
        return problem(409, 'APPEAL_ALREADY_RESOLVED', 'Adding evidence to a decided case would be editing history');
      }
      if (record.appeal.images.length >= maxImages) {
        return problem(409, 'APPEAL_IMAGE_LIMIT', 'This municipality allows no more images on a defence');
      }
      const image = {
        id: `appeal-image-${record.appeal.images.length + 1}-${record.appeal.id}`,
        kind: 'PHOTO' as const,
        contentType: 'image/jpeg',
        byteSize: 0,
        sha256: 'mock-digest-not-computed',
        note: null,
        capturedAt: new Date().toISOString(),
        latitude: null,
        longitude: null,
        createdAt: new Date().toISOString(),
      };
      record.appeal.images.push(image);
      return json({ ...image, contentUrl: null }, 201);
    }

    if (method === 'POST' && segments[5] === 'payments') {
      // Declared, not implemented — the same 501 the real server answers, so the client's honest
      // disabled button is exercised against the same fact in both transports.
      return problem(501, 'NOT_IMPLEMENTED', 'Paying a fine online arrives with the payments batch');
    }
  }

  return problem(404, 'MOCK_ROUTE_NOT_FOUND', `No mock handler for ${method} ${path}`);
}

function zoneNameForId(zoneId: string): string {
  const names: Record<string, string> = { 'zone-centro': 'Centro', 'zone-escazu-centro': 'Centro' };
  return names[zoneId] ?? zoneId;
}

/** Server-side quote math (CONTRACT.md v0.2 §Invariantes — always computed here, never trusted from the client). */
function computeMockQuote(zoneId: string, minutes: number, userId: string, tenantId: string | null): ParkingQuoteResponse {
  const rate = mockZoneRate(zoneId, tenantId);
  const amountMinor = Math.round(rate.rateMinorPerMinute * minutes);
  const availableCreditMinutes = availableMockCreditMinutes(walletKey(userId, tenantId ?? ''));
  const creditMinutesApplied = Math.min(availableCreditMinutes, minutes);
  const creditValueMinor = Math.round(rate.rateMinorPerMinute * creditMinutesApplied);
  const payableMinor = Math.max(0, amountMinor - creditValueMinor);
  return {
    minutes,
    // The mock municipality charges around the clock, so every requested minute is chargeable.
    chargeableMinutes: minutes,
    amountMinor,
    currencyCode: rate.currencyCode,
    creditMinutesApplied,
    payableMinutes: minutes - creditMinutesApplied,
    payableMinor,
  };
}

/** Domain quote → the server's wire shape (money in `MoneyDto` pairs). */
function toWireQuote(quote: ParkingQuoteResponse): unknown {
  return {
    minutes: quote.minutes,
    chargeableMinutes: quote.chargeableMinutes,
    amount: { amountMinor: quote.amountMinor, currencyCode: quote.currencyCode },
    creditMinutesApplied: quote.creditMinutesApplied,
    payableMinutes: quote.payableMinutes,
    payable: { amountMinor: quote.payableMinor, currencyCode: quote.currencyCode },
  };
}

const MOCK_WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;

/** Monday–Saturday 07:00–18:00, Sunday free — CONTRACT.md v0.3's default charging schedule. */
function mockChargingSchedule(): unknown {
  const band = { startMinute: 420, endMinute: 1080, startsAt: '07:00', endsAt: '18:00' };
  const now = new Date();
  const isSunday = now.getDay() === 0;
  const minuteOfDay = now.getHours() * 60 + now.getMinutes();
  const chargingNow = !isSunday && minuteOfDay >= band.startMinute && minuteOfDay < band.endMinute;
  const next = new Date(now);
  next.setSeconds(0, 0);
  if (chargingNow) {
    // Already inside a band: nothing to announce.
  } else if (!isSunday && minuteOfDay < band.startMinute) {
    next.setHours(7, 0, 0, 0);
  } else {
    next.setDate(next.getDate() + (isSunday ? 1 : 1));
    next.setHours(7, 0, 0, 0);
    if (next.getDay() === 0) next.setDate(next.getDate() + 1);
  }
  return {
    timeZone: 'America/Costa_Rica',
    chargesAllDay: false,
    week: MOCK_WEEKDAYS.map((weekday) => ({
      weekday,
      bands: weekday === 'SUNDAY' ? [] : [band],
    })),
    exceptions: [],
    chargingNow,
    nextChargingStartsAt: chargingNow ? null : next.toISOString(),
    updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function mockCitizenZones(tenantId: string | null): unknown {
  // `spaceCodes` summarises the bays the zone actually holds, so the citizen's field can state the
  // range instead of letting a code be guessed and refused at submit.
  return tenantId === 'tenant-escazu'
    ? [
        {
          id: 'zone-escazu-centro',
          code: 'ESC-CENTRO',
          name: 'Centro',
          spaceCodes: { first: 'LUP-0001', last: 'LUP-0040', count: 40 },
        },
      ]
    : [
        {
          id: 'zone-centro',
          code: 'SJ-CENTRO',
          name: 'Centro',
          spaceCodes: { first: 'LUP-0001', last: 'LUP-0050', count: 50 },
        },
      ];
}

/** The bay-code shape of the mock municipality (CONTRACT.md v0.3 §"Formato del código de espacio"). */
function mockSpaceFormat(): unknown {
  return buildMockSpaceFormat('LUP-', 4, false);
}

/**
 * The server derives `pattern` and `example` from the three knobs the administrator sets; the
 * mock derives them the same way so the admin preview matches what a real deployment would store.
 */
function buildMockSpaceFormat(prefix: string, digits: number, allowLetters: boolean): unknown {
  const body = allowLetters ? `[0-9A-Z]{${digits}}` : `[0-9]{${digits}}`;
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    prefix,
    digits,
    allowLetters,
    pattern: `^${escapedPrefix}${body}$`,
    example: `${prefix}${'0'.repeat(Math.max(0, digits - 1))}1`,
    updatedAt: new Date().toISOString(),
  };
}

const MOCK_PLATFORM_DEFAULT_LOCALE = 'es-CR';

interface MockTenantLocale {
  locale: string;
  enabled: boolean;
  isDefault: boolean;
  sortOrder: number;
}

/** Per-tenant enabled languages, mutable so the admin screen can be exercised end to end. */
const mockTenantLocalesByTenant = new Map<string, MockTenantLocale[]>();

function mockTenantLocales(tenantId: string | null): MockTenantLocale[] {
  return (
    mockTenantLocalesByTenant.get(tenantId ?? '') ?? [
      { locale: 'es-CR', enabled: true, isDefault: true, sortOrder: 0 },
      { locale: 'en-US', enabled: true, isDefault: false, sortOrder: 1 },
    ]
  );
}

/**
 * Domain record → the wire shape the real server sends (see ../wire): money nested in a
 * `MoneyDto`, booked time under `bookedMinutes`, and the remaining time recomputed on read the
 * way a server would. The mocks answer at the transport boundary, so they have to speak the
 * server's language, not the apps'.
 */
function toPublicSession(record: MockParkingSessionRecord): unknown {
  const remainingMinutes =
    record.status === 'ACTIVE'
      // Floored, like the server: Duration.toMinutes() truncates (CONTRACT.md v0.10).
      ? Math.max(0, Math.floor((new Date(record.expiresAt).getTime() - Date.now()) / 60_000))
      : 0;
  return {
    id: record.id,
    vehicleId: record.vehicleId,
    plateSnapshot: record.plateSnapshot,
    vehicleType: record.vehicleType,
    zoneId: record.zoneId,
    zoneName: record.zoneName,
    spaceId: record.spaceId,
    spaceCode: record.spaceCode,
    startedAt: record.startedAt,
    expiresAt: record.expiresAt,
    endedAt: record.endedAt,
    status: record.status,
    bookedMinutes: record.minutes,
    remainingMinutes,
    amount: { amountMinor: record.amountMinor, currencyCode: record.currencyCode },
    creditMinutesApplied: record.creditMinutesApplied,
  };
}

/** Decodes the mock access token's claims without any signature check — mocks only, never used for real auth. */
function decodeMockClaims(authorizationHeader: string): AccessTokenClaims | null {
  const token = authorizationHeader.replace(/^Bearer\s+/i, '');
  const payloadSegment = token.split('.')[1];
  if (!payloadSegment) return null;
  try {
    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const decoded = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    return JSON.parse(decoded) as AccessTokenClaims;
  } catch {
    return null;
  }
}




// ---- Enforcement fixtures (CONTRACT.md v0.7) ---------------------------------------------------

interface MockEvidence {
  id: string;
  kind: 'PHOTO' | 'NOTE';
  contentType: string | null;
  byteSize: number | null;
  sha256: string | null;
  note: string | null;
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}

interface MockCitationRecord {
  id: string;
  tenantId: string;
  inspectorUserId: string;
  deviceCitationId: string | null;
  number: string | null;
  seriesYear: number | null;
  status: string;
  statusReason: string | null;
  plate: string;
  zoneId: string | null;
  zoneName: string | null;
  spaceCode: string | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracyM: number | null;
  addressText: string | null;
  infractionTypeId: string;
  infractionCode: string;
  infractionName: string;
  fineMinor: number;
  discountedFineMinor: number | null;
  currencyCode: string;
  discountUntil: string | null;
  dueAt: string | null;
  occurredAt: string;
  issuedAt: string | null;
  notes: string | null;
  requiresPhoto: boolean;
  allowsAppeal: boolean;
  evidence: MockEvidence[];
  events: Record<string, unknown>[];
  /** The defence filed against this citation, if one was. One per citation, as on the server. */
  appeal: MockAppeal | null;
}

interface MockAppeal {
  id: string;
  citationId: string;
  authorUserId: string;
  status: 'SUBMITTED' | 'ACCEPTED' | 'REJECTED';
  body: string;
  submittedAt: string;
  resolvedAt: string | null;
  resolutionReason: string | null;
  noticeVersion: number;
  images: MockEvidence[];
}

interface MockInfractionType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  fineAmountMinor: number;
  discountDays: number | null;
  discountPercent: number | null;
  dueDays: number;
  requiresPhoto: boolean;
  allowsAppeal: boolean;
  active: boolean;
}

const mockCitations: MockCitationRecord[] = [];
const mockInfractionTypesByTenant = new Map<string, MockInfractionType[]>();
let mockCitationSequence = 0;

/** The default catalogue a municipality starts with in the demo build. */
function mockInfractionTypes(tenantId: string): MockInfractionType[] {
  const existing = mockInfractionTypesByTenant.get(tenantId);
  if (existing) return existing;
  const seeded: MockInfractionType[] = [
    {
      id: `${tenantId}-inf-nopago`,
      code: 'NOPAGO',
      name: 'Estacionar sin pago vigente',
      description: 'El vehículo ocupa una bahía de cobro sin sesión de parqueo vigente.',
      fineAmountMinor: 150000,
      discountDays: 8,
      discountPercent: 50,
      dueDays: 30,
      requiresPhoto: true,
      allowsAppeal: true,
      active: true,
    },
    {
      id: `${tenantId}-inf-vencida`,
      code: 'VENCIDA',
      name: 'Tiempo vencido',
      description: 'La sesión de parqueo terminó y el vehículo sigue en la bahía.',
      fineAmountMinor: 100000,
      discountDays: 8,
      discountPercent: 50,
      dueDays: 30,
      requiresPhoto: false,
      allowsAppeal: true,
      active: true,
    },
  ];
  mockInfractionTypesByTenant.set(tenantId, seeded);
  return seeded;
}

/** Whole-catalogue replace: absent rows are deactivated, never dropped (CONTRACT.md v0.7). */
function replaceMockInfractionTypes(tenantId: string, drafts: Record<string, unknown>[]): unknown[] {
  const current = mockInfractionTypes(tenantId);
  const kept = new Set<string>();
  for (const draft of drafts) {
    const id = (draft.id as string) ?? `${tenantId}-inf-${String(draft.code).toLowerCase()}`;
    kept.add(id);
    const row: MockInfractionType = {
      id,
      code: String(draft.code),
      name: String(draft.name),
      description: (draft.description as string) ?? null,
      fineAmountMinor: Number(draft.fineAmountMinor),
      discountDays: (draft.discountDays as number) ?? null,
      discountPercent: (draft.discountPercent as number) ?? null,
      dueDays: Number(draft.dueDays),
      requiresPhoto: draft.requiresPhoto !== false,
      allowsAppeal: draft.allowsAppeal !== false,
      active: draft.active !== false,
    };
    const index = current.findIndex((candidate) => candidate.id === id);
    if (index >= 0) current[index] = row;
    else current.push(row);
  }
  for (const row of current) {
    if (!kept.has(row.id)) row.active = false;
  }
  mockInfractionTypesByTenant.set(tenantId, current);
  return current.map(toWireInfractionType);
}

function toWireInfractionType(type: MockInfractionType): unknown {
  const discounted =
    type.discountPercent != null
      ? Math.round((type.fineAmountMinor * (100 - type.discountPercent)) / 100)
      : null;
  return {
    id: type.id,
    code: type.code,
    name: type.name,
    description: type.description,
    fine: { amountMinor: type.fineAmountMinor, currencyCode: 'CRC' },
    discountedFine: discounted == null ? null : { amountMinor: discounted, currencyCode: 'CRC' },
    discountDays: type.discountDays,
    discountPercent: type.discountPercent,
    dueDays: type.dueDays,
    requiresPhoto: type.requiresPhoto,
    allowsAppeal: type.allowsAppeal,
    active: type.active,
  };
}

function mockEvent(
  record: MockCitationRecord,
  action: string,
  fromStatus: string | null,
  toStatus: string | null,
  reason: string | null,
): Record<string, unknown> {
  return {
    id: `event-${record.id}-${record.events.length + 1}`,
    action,
    actionLabelKey: `citation.action.${action.toLowerCase()}`,
    fromStatus,
    toStatus,
    actorUserId: record.inspectorUserId,
    actorPortal: 'inspector',
    reason,
    occurredAt: new Date().toISOString(),
  };
}

function createMockCitation(
  tenantId: string,
  userId: string,
  payload: Record<string, string | number | undefined>,
  type: MockInfractionType,
): MockCitationRecord {
  const now = new Date();
  const discounted =
    type.discountPercent != null ? Math.round((type.fineAmountMinor * (100 - type.discountPercent)) / 100) : null;
  const record: MockCitationRecord = {
    id: `citation-mock-${++mockCitationSequence}`,
    tenantId,
    inspectorUserId: userId,
    deviceCitationId: (payload.deviceCitationId as string) ?? null,
    number: null,
    seriesYear: null,
    // A type that demands a photograph is captured as a draft and takes no number until it is
    // issued: an abandoned capture must not burn a consecutive.
    status: type.requiresPhoto ? 'DRAFT' : 'ISSUED',
    statusReason: null,
    plate: normalizeMockPlate(String(payload.plate ?? '')),
    zoneId: (payload.zoneId as string) ?? null,
    zoneName: payload.zoneId ? zoneNameForId(String(payload.zoneId)) : null,
    spaceCode: (payload.spaceCode as string) ?? null,
    latitude: payload.latitude == null ? null : Number(payload.latitude),
    longitude: payload.longitude == null ? null : Number(payload.longitude),
    locationAccuracyM: payload.locationAccuracyM == null ? null : Number(payload.locationAccuracyM),
    addressText: (payload.addressText as string) ?? null,
    infractionTypeId: type.id,
    infractionCode: type.code,
    infractionName: type.name,
    fineMinor: type.fineAmountMinor,
    discountedFineMinor: discounted,
    currencyCode: 'CRC',
    discountUntil:
      type.discountDays == null ? null : new Date(now.getTime() + type.discountDays * 86_400_000).toISOString(),
    dueAt: new Date(now.getTime() + type.dueDays * 86_400_000).toISOString(),
    occurredAt: (payload.occurredAt as string) ?? now.toISOString(),
    issuedAt: null,
    notes: (payload.notes as string) ?? null,
    requiresPhoto: type.requiresPhoto,
    allowsAppeal: type.allowsAppeal,
    evidence: [],
    events: [],
    appeal: null,
  };
  record.events.push(mockEvent(record, 'DRAFTED', null, 'DRAFT', null));
  mockCitations.push(record);
  if (!type.requiresPhoto) issueMockCitation(record);
  return record;
}

function issueMockCitation(record: MockCitationRecord): void {
  if (record.number) return;
  const year = new Date().getFullYear();
  record.number = `MOCK-${year}-${String(mockCitationSequence).padStart(6, '0')}`;
  record.seriesYear = year;
  record.events.push(mockEvent(record, 'ISSUED', record.status, 'ISSUED', null));
  record.status = 'ISSUED';
  record.issuedAt = new Date().toISOString();
}

/** The amount actually owed today: the reduced one while the early window is open. */
function mockAmountPayable(record: MockCitationRecord): number {
  const open = record.discountUntil ? Date.parse(record.discountUntil) > Date.now() : false;
  return open && record.discountedFineMinor != null ? record.discountedFineMinor : record.fineMinor;
}

function toWireCitation(record: MockCitationRecord, evidenceCount: number): unknown {
  return {
    id: record.id,
    number: record.number,
    seriesYear: record.seriesYear,
    status: record.status,
    statusLabelKey: `citation.status.${record.status.toLowerCase()}`,
    statusReason: record.statusReason,
    plate: record.plate,
    vehicleId: null,
    zoneId: record.zoneId,
    zoneCode: record.zoneId,
    zoneName: record.zoneName,
    spaceId: null,
    spaceCode: record.spaceCode,
    latitude: record.latitude,
    longitude: record.longitude,
    locationAccuracyM: record.locationAccuracyM,
    addressText: record.addressText,
    infractionTypeId: record.infractionTypeId,
    infractionCode: record.infractionCode,
    infractionName: record.infractionName,
    fine: { amountMinor: record.fineMinor, currencyCode: record.currencyCode },
    amountPayable: { amountMinor: mockAmountPayable(record), currencyCode: record.currencyCode },
    discountedFine:
      record.discountedFineMinor == null
        ? null
        : { amountMinor: record.discountedFineMinor, currencyCode: record.currencyCode },
    discountUntil: record.discountUntil,
    dueAt: record.dueAt,
    occurredAt: record.occurredAt,
    issuedAt: record.issuedAt,
    deviceClockSkewSeconds: 0,
    inspectorUserId: record.inspectorUserId,
    parkingSessionId: null,
    notes: record.notes,
    evidenceCount,
  };
}

function toWireDetail(record: MockCitationRecord): unknown {
  return {
    citation: toWireCitation(record, record.evidence.length),
    evidence: record.evidence.map((item) => ({ ...item, contentUrl: null })),
    history: record.events,
  };
}

// ---- Defences (CONTRACT.md v0.8, moderated in v0.17) -------------------------------------------
// The notice is versioned and append-only here as it is on the server, because the whole mechanism
// is `noticeVersion` on a defence pointing at the exact wording its author read. A mock that let a
// notice be edited in place would make the client's most important guarantee untestable.

interface MockAppealNotice {
  id: string;
  version: number;
  locale: string;
  body: string;
  effectiveFrom: string;
  countryDefault: boolean;
}

const mockAppealNotices = new Map<string, MockAppealNotice[]>();
let mockAppealSequence = 0;

const MOCK_COUNTRY_NOTICE =
  'Al presentar su descargo usted declara que lo expuesto es cierto. La municipalidad resolverá y ' +
  'le comunicará la decisión con su motivo. Mientras el descargo esté en trámite la multa no se ' +
  'cobra; si se rechaza, vuelve a ser exigible desde la fecha de la resolución.';

function mockNoticesFor(tenantId: string): MockAppealNotice[] {
  const existing = mockAppealNotices.get(tenantId);
  if (existing) return existing;
  // Version 1 is the country default — the wording a municipality inherits until it publishes its
  // own. `countryDefault` is what the admin screen uses to say "esto no lo escribió usted".
  const seeded: MockAppealNotice[] = [
    {
      id: `${tenantId}-notice-1`,
      version: 1,
      locale: 'es-CR',
      body: MOCK_COUNTRY_NOTICE,
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      countryDefault: true,
    },
  ];
  mockAppealNotices.set(tenantId, seeded);
  return seeded;
}

/** The one in force: the newest whose `effectiveFrom` has already passed. */
function mockNoticeInForce(tenantId: string): MockAppealNotice {
  const now = Date.now();
  const live = mockNoticesFor(tenantId).filter((notice) => Date.parse(notice.effectiveFrom) <= now);
  return live[live.length - 1] ?? mockNoticesFor(tenantId)[0]!;
}

function mockAppealMaxImages(tenantId: string): number {
  const configured = mockTenantSettings.get(tenantId)?.['enforcement.appealMaxImages'];
  return typeof configured === 'number' ? configured : 3;
}

function toWireAppeal(appeal: MockAppeal, maxImages: number): unknown {
  return {
    id: appeal.id,
    citationId: appeal.citationId,
    status: appeal.status,
    statusLabelKey: `appeal.status.${appeal.status.toLowerCase()}`,
    body: appeal.body,
    submittedAt: appeal.submittedAt,
    resolvedAt: appeal.resolvedAt,
    resolutionReason: appeal.resolutionReason,
    noticeVersion: appeal.noticeVersion,
    maxImages,
    images: appeal.images.map((image) => ({ ...image, contentUrl: null })),
  };
}

/**
 * A defence already waiting when the demo build opens.
 *
 * <p>Without this the moderation queue is an empty table and the screen proves nothing: the admin
 * preview and the citizen preview are separate builds with separate mock state, so a defence filed
 * in one is invisible in the other. Two are seeded — one waiting and one already rejected — because
 * the two rows exercise different halves of the screen: the decision buttons, and the reason the
 * citizen is owed.</p>
 */
function seedMockAppeals(): void {
  if (mockCitations.length > 0) return;
  const tenantId = 'tenant-sanjose';
  const type = mockInfractionTypes(tenantId)[0]!;
  const day = 86_400_000;
  const cases: {
    plate: string;
    ago: number;
    body: string | null;
    resolve: null | { accept: boolean; reason: string };
  }[] = [
    // No defence at all: the third row is what makes the *writing* path reachable in a demo build,
    // and a build where only the already-filed screens can be opened proves half the feature.
    { plate: 'TEST01', ago: 3, body: null, resolve: null },
    {
      plate: 'BHL019',
      ago: 9,
      body:
        'La boleta dice que el carro estaba sin pago, pero yo había pagado desde la app a las 9:12 y ' +
        'me quedaba tiempo. Adjunto el comprobante que me llegó al correo. Le pido que revisen la hora ' +
        'de la boleta contra la de mi pago.',
      resolve: null,
    },
    {
      plate: 'BNY963',
      ago: 21,
      body: 'No era mi carro el que estaba en esa bahía, la placa está mal anotada.',
      resolve: {
        accept: false,
        reason: 'La fotografía de la boleta muestra la placa BNY963 en la bahía SJ-CENTRO-014. La multa se mantiene.',
      },
    },
  ];
  for (const seed of cases) {
    const record = createMockCitation(
      tenantId,
      'user-inspector-1',
      { plate: seed.plate, zoneId: 'zone-centro', spaceCode: 'SJ-CENTRO-014', infractionTypeId: type.id,
        occurredAt: new Date(Date.now() - seed.ago * day).toISOString() },
      type,
    );
    issueMockCitation(record);
    record.occurredAt = new Date(Date.now() - seed.ago * day).toISOString();
    record.issuedAt = record.occurredAt;
    if (seed.body === null) continue;
    const appeal = fileMockAppeal(record, 'user-citizen-1', seed.body, mockNoticeInForce(tenantId));
    appeal.submittedAt = new Date(Date.now() - (seed.ago - 1) * day).toISOString();
    if (seed.resolve) resolveMockAppeal(record, seed.resolve.accept, seed.resolve.reason);
  }
}

function fileMockAppeal(
  record: MockCitationRecord,
  userId: string,
  body: string,
  notice: MockAppealNotice,
): MockAppeal {
  const appeal: MockAppeal = {
    id: `appeal-mock-${++mockAppealSequence}`,
    citationId: record.id,
    authorUserId: userId,
    status: 'SUBMITTED',
    body,
    submittedAt: new Date().toISOString(),
    resolvedAt: null,
    resolutionReason: null,
    noticeVersion: notice.version,
    images: [],
  };
  record.appeal = appeal;
  // The citation moves in the same breath: the municipality sees the case and the citizen sees the
  // state at the same moment, which is the server's own guarantee.
  record.events.push(mockEvent(record, 'APPEALED', record.status, 'APPEALED', null));
  record.status = 'APPEALED';
  return appeal;
}

/** Accept and the citation is void; reject and it stands. Once, and with a reason either way. */
function resolveMockAppeal(record: MockCitationRecord, accept: boolean, reason: string): MockAppeal {
  const appeal = record.appeal!;
  const toStatus = accept ? 'DISMISSED' : 'UPHELD';
  appeal.status = accept ? 'ACCEPTED' : 'REJECTED';
  appeal.resolvedAt = new Date().toISOString();
  appeal.resolutionReason = reason;
  // The action names read backwards on purpose: they are the *citation's* outcome, not the
  // defence's. Accepting the defence dismisses the citation (`APPEAL_DISMISSED`), rejecting it
  // upholds the citation (`APPEAL_UPHELD`). Matching the server here rather than picking the
  // intuitive name is the whole point of the mock.
  record.events.push(
    mockEvent(record, accept ? 'APPEAL_DISMISSED' : 'APPEAL_UPHELD', record.status, toStatus, reason),
  );
  record.status = toStatus;
  record.statusReason = reason;
  return appeal;
}

/** The citizen's narrower view: no officer, no clock skew, no session reference. */
function toWireFine(record: MockCitationRecord): unknown {
  return {
    id: record.id,
    number: record.number,
    status: record.status,
    statusLabelKey: `citation.status.${record.status.toLowerCase()}`,
    plate: record.plate,
    infractionCode: record.infractionCode,
    infractionName: record.infractionName,
    zoneName: record.zoneName,
    spaceCode: record.spaceCode,
    addressText: record.addressText,
    fine: { amountMinor: record.fineMinor, currencyCode: record.currencyCode },
    amountPayable: { amountMinor: mockAmountPayable(record), currencyCode: record.currencyCode },
    discountUntil: record.discountUntil,
    dueAt: record.dueAt,
    occurredAt: record.occurredAt,
    issuedAt: record.issuedAt,
    appealable: record.allowsAppeal && ['ISSUED', 'UPHELD', 'EXPIRED'].includes(record.status),
    evidenceCount: record.evidence.length,
  };
}
