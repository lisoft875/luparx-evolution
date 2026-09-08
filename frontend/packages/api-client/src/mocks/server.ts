import type { PagedResponse } from '../types/http';
import type {
  AccessTokenClaims,
  AdminUserDetail,
  AdminUserListItem,
  CreateVehicleRequest,
  ExtendParkingSessionRequest,
  LoginRequest,
  MembershipSummary,
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
import {
  availableMockCreditMinutes,
  MOCK_ADMIN_LEVELS,
  MOCK_COUNTRIES,
  MOCK_DIVISIONS,
  MOCK_DOCUMENT_TYPES,
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
  type MockUserRecord,
} from './data';
import { mintMockTokenPair } from './token';

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

interface PendingMfa {
  userId: string;
  portal: Portal;
}
const pendingMfaByToken = new Map<string, PendingMfa>();

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
    mfaRequired: user.profile.mfaRequired,
    mfaEnabled: user.mfaEnabled,
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
  if (method === 'GET' && segments[2] === 'catalog' && segments[4] === 'admin-levels') {
    const code = segments[3]?.toUpperCase() ?? '';
    return json(MOCK_ADMIN_LEVELS[code] ?? []);
  }
  // GET /api/v1/catalog/countries/{code}/divisions?parentId=&level=
  if (method === 'GET' && segments[2] === 'catalog' && segments[4] === 'divisions') {
    const code = segments[3]?.toUpperCase() ?? '';
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
  if (method === 'GET' && segments[2] === 'catalog' && segments[4] === 'document-types') {
    const code = segments[3]?.toUpperCase() ?? '';
    return json(MOCK_DOCUMENT_TYPES[code] ?? []);
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
  if (segments[2] === 'auth') {
    const portal = segments[3] as Portal;
    const action = segments.slice(4).join('/');

    if (method === 'POST' && action === 'register') {
      const payload = await readBody<RegisterRequest>(init);
      if (findUserByEmail(payload.email)) {
        return problem(409, 'EMAIL_ALREADY_REGISTERED', 'Email already registered');
      }
      const requiresApproval = portal !== 'citizen';
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
          mfaRequired: portal !== 'citizen',
          mfaEnabled: false,
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
        mfaEnabled: false,
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
      if (user.mfaEnabled) {
        const mfaToken = `mfa-${crypto.randomUUID()}`;
        pendingMfaByToken.set(mfaToken, { userId: user.profile.id, portal });
        return json({ mfaRequired: true, mfaToken });
      }
      const membership = membershipForPortal(user, portal);
      const resolvedTenantId = autoResolvedTenantId(user, portal);
      const tokens = mintMockTokenPair(user, portal, resolvedTenantId, rolesForLogin(user, portal, membership));
      refreshTokens.set(tokens.refreshToken, {
        userId: user.profile.id,
        portal,
        tenantId: resolvedTenantId,
      });
      return json({ ...tokens, mfaRequired: false });
    }

    if (method === 'POST' && action === 'mfa/verify') {
      const payload = await readBody<{ mfaToken: string; code: string }>(init);
      const pending = pendingMfaByToken.get(payload.mfaToken);
      if (!pending || payload.code !== '123456') {
        return problem(401, 'INVALID_MFA_CODE', 'Invalid verification code');
      }
      pendingMfaByToken.delete(payload.mfaToken);
      const user = mockUsersById.get(pending.userId);
      if (!user) return problem(404, 'USER_NOT_FOUND', 'User not found');
      const membership = membershipForPortal(user, pending.portal);
      const resolvedTenantId = autoResolvedTenantId(user, pending.portal);
      const tokens = mintMockTokenPair(
        user,
        pending.portal,
        resolvedTenantId,
        rolesForLogin(user, pending.portal, membership),
      );
      refreshTokens.set(tokens.refreshToken, {
        userId: user.profile.id,
        portal: pending.portal,
        tenantId: resolvedTenantId,
      });
      return json({ tokens });
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
    if (method === 'POST' && path.endsWith('/me/mfa/setup')) {
      return json({
        secret: 'JBSWY3DPEHPK3PXP',
        otpauthUri: `otpauth://totp/LupaRX:${user.profile.email}?secret=JBSWY3DPEHPK3PXP&issuer=LupaRX`,
        recoveryCodes: ['AAAA-1111', 'BBBB-2222', 'CCCC-3333'],
      });
    }
    if (method === 'POST' && path.endsWith('/me/mfa/activate')) {
      user.mfaEnabled = true;
      return noContent();
    }
    if (method === 'DELETE' && path.endsWith('/me/mfa')) {
      user.mfaEnabled = false;
      return noContent();
    }
  }

  // ---- Admin: users, memberships, audit, reports, exports, tenants ---------------------------
  if (segments[2] === 'admin') {
    const resource = segments[3];

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

    if (resource === 'parking' && segments[4] === 'zones' && method === 'GET') {
      const authHeader = new Headers(init?.headers).get('Authorization');
      const claims = authHeader ? decodeMockClaims(authHeader) : null;
      return json(mockCitizenZones(claims?.tid ?? null));
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
      if (method === 'POST' && segments[5] === 'mfa' && segments[6] === 'require') {
        const user = mockUsersById.get(segments[4] ?? '');
        if (!user) return problem(404, 'USER_NOT_FOUND', 'User not found');
        const payload = await readBody<{ required: boolean }>(init);
        user.profile.mfaRequired = payload.required;
        return noContent();
      }
    }

    // POST /api/v1/admin/memberships — create membership (invite / manual grant).
    if (resource === 'memberships' && method === 'POST' && segments.length === 4) {
      return noContent();
    }
    // /api/v1/admin/memberships/{id}[/approve|/reject], addressed by MembershipSummary.id.
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
              mfaRequired: true,
              mfaEnabled: false,
            },
            password: crypto.randomUUID(),
            memberships: [],
            mfaEnabled: false,
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
      if (method === 'POST' && segments[5] === 'mfa' && segments[6] === 'require') {
        const user = mockUsersById.get(segments[4] ?? '');
        if (!user) return problem(404, 'USER_NOT_FOUND', 'User not found');
        const payload = await readBody<{ required: boolean }>(init);
        user.profile.mfaRequired = payload.required;
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
        return json(mockParkingPolicyForTenant(tenantId));
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
        if (!policy.sessionIncrementsMinutes.includes(payload.minutes)) {
          return problem(422, 'INVALID_INCREMENT', 'Invalid session duration');
        }
        const vehicle = mockVehicles.find((v) => v.id === payload.vehicleId && v.userId === userId);
        if (!vehicle) return problem(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found');
        if (mockParkingSessions.some((s) => s.vehicleId === payload.vehicleId && s.status === 'ACTIVE')) {
          return problem(409, 'SESSION_ALREADY_ACTIVE_FOR_VEHICLE', 'This vehicle already has an active session');
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
            vehicleId: payload.vehicleId,
            plateSnapshot: vehicle.plate,
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
            metadata: { vehicleId: payload.vehicleId, zoneId: payload.zoneId, minutes: payload.minutes },
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
  return tenantId === 'tenant-escazu'
    ? [{ id: 'zone-escazu-centro', code: 'ESC-CENTRO', name: 'Centro' }]
    : [{ id: 'zone-centro', code: 'SJ-CENTRO', name: 'Centro' }];
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
      ? Math.max(0, Math.round((new Date(record.expiresAt).getTime() - Date.now()) / 60_000))
      : 0;
  return {
    id: record.id,
    vehicleId: record.vehicleId,
    plateSnapshot: record.plateSnapshot,
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


