import type { PagedResponse } from '../types/http';
import type {
  AdminUserDetail,
  AdminUserListItem,
  LoginRequest,
  MembershipSummary,
  Portal,
  RegisterRequest,
  Role,
} from '../types/domain';
import {
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
  mockTenantSettings,
  mockUsersById,
  nextMockUserId,
  recordAuditEvent,
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

function problem(status: number, code: string, title: string, detail?: string): Response {
  return new Response(JSON.stringify({ type: 'about:blank', title, status, code, detail }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
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
    return json(items.map(({ id, slug, name, countryCode }) => ({ id, slug, name, countryCode })));
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
      const tokens = mintMockTokenPair(user, portal, membership?.tenantId ?? null, rolesForLogin(user, portal, membership));
      refreshTokens.set(tokens.refreshToken, {
        userId: user.profile.id,
        portal,
        tenantId: membership?.tenantId ?? null,
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
      const tokens = mintMockTokenPair(
        user,
        pending.portal,
        membership?.tenantId ?? null,
        rolesForLogin(user, pending.portal, membership),
      );
      refreshTokens.set(tokens.refreshToken, {
        userId: user.profile.id,
        portal: pending.portal,
        tenantId: membership?.tenantId ?? null,
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
    const userId = authHeader ? decodeMockSubject(authHeader) : null;
    const user = userId ? mockUsersById.get(userId) : undefined;
    if (!user) return problem(401, 'UNAUTHORIZED', 'Missing or invalid session');

    if (method === 'GET' && segments[3] === 'me' && segments.length === 4) {
      const membership = membershipForPortal(user, portal);
      const tenant = membership ? MOCK_TENANTS.find((t) => t.id === membership.tenantId) ?? null : null;
      return json({ user: user.profile, memberships: user.memberships, activeTenant: tenant });
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
      return json({ tokens });
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

  return problem(404, 'MOCK_ROUTE_NOT_FOUND', `No mock handler for ${method} ${path}`);
}

/** Decodes the mock access token's `sub` claim without any signature check — mocks only, never used for real auth. */
function decodeMockSubject(authorizationHeader: string): string | null {
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
    return (JSON.parse(decoded) as { sub: string }).sub;
  } catch {
    return null;
  }
}

