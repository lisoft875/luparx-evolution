/**
 * Domain and DTO types mirroring CONTRACT.md verbatim: field names, casing and
 * enums here MUST match the backend contract exactly (§1, §2, §5).
 */

/** The four login-isolated portals (CONTRACT.md §0). A token from one never authorizes another. */
export type Portal = 'citizen' | 'admin' | 'inspector' | 'platform';

export const PORTALS: readonly Portal[] = ['citizen', 'admin', 'inspector', 'platform'];

export type OAuthProvider = 'google' | 'microsoft' | 'facebook';

/** CONTRACT.md §1 — roles are configuration-mapped to permissions, never `if (role === 'ADMIN')`. */
export type Role =
  | 'PLATFORM_ADMIN'
  | 'PLATFORM_SUPPORT'
  | 'TENANT_ADMIN'
  | 'TENANT_FINANCE'
  | 'TENANT_SUPPORT'
  | 'INSPECTOR'
  | 'INSPECTOR_LEAD'
  | 'CITIZEN';

export type Permission =
  | 'USER_READ'
  | 'USER_WRITE'
  | 'USER_BLOCK'
  | 'MEMBERSHIP_APPROVE'
  | 'ROLE_ASSIGN'
  | 'ZONE_ASSIGN'
  | 'AUDIT_READ'
  | 'EXPORT_RUN'
  | 'TENANT_MANAGE'
  | 'PLATFORM_MANAGE';

export type MembershipStatus = 'ACTIVE' | 'PENDING_APPROVAL' | 'REJECTED' | 'REVOKED';

export type SelfRegistrationPolicy = 'OPEN' | 'APPROVAL_REQUIRED' | 'INVITE_ONLY';

export type UserStatus = 'ACTIVE' | 'BLOCKED' | 'PENDING_VERIFICATION';

export type IdentityDocumentType =
  | 'NATIONAL_ID'
  | 'FOREIGN_RESIDENT_ID'
  | 'PASSPORT'
  | 'TAX_ID'
  | 'OTHER';

/** JWT access-token claims (CONTRACT.md §3). Decoded client-side only for UI/display, never trusted for authorization. */
export interface AccessTokenClaims {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  jti: string;
  portal: Portal;
  tid: string | null;
  roles: Role[];
  perms: Permission[];
  mfa: boolean;
  locale: string;
  ver: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ---- Catalog (public, cacheable) --------------------------------------------------------------

export interface CountryCatalogEntry {
  code: string;
  name: string;
  dialCode: string;
  flagEmoji: string;
  defaultLocale: string;
  defaultCurrency: string;
  defaultTimeZone: string;
}

export interface AdminLevelCatalogEntry {
  level: number;
  labelKey: string;
  required: boolean;
}

export interface AdministrativeDivision {
  id: string;
  code: string;
  name: string;
  level: number;
  parentId: string | null;
}

export interface DocumentTypeCatalogEntry {
  type: IdentityDocumentType;
  labelKey: string;
  pattern: string;
  example: string;
}

export interface TenantCatalogEntry {
  id: string;
  slug: string;
  name: string;
  countryCode: string;
}

// ---- Registration (CONTRACT.md §2 — field order is normative for UI and DTO) ------------------

export interface IdentityDocumentInput {
  countryCode: string;
  type: IdentityDocumentType;
  number: string;
}

export interface AddressInput {
  countryCode: string;
  level1Id: string;
  /** Present only when the country's admin-levels catalog defines a 2nd level (CONTRACT.md §2/§5). */
  level2Id?: string;
  /** Present only when the country's admin-levels catalog defines a 3rd level. */
  level3Id?: string;
  line1: string;
  line2?: string;
  postalCode?: string;
}

export interface PhoneInput {
  countryCode: string;
  nationalNumber: string;
}

export interface RegisterRequest {
  givenName: string;
  familyName: string;
  secondFamilyName?: string;
  identityDocument: IdentityDocumentInput;
  address: AddressInput;
  phone: PhoneInput;
  nationalityCode: string;
  email: string;
  birthDate: string; // ISO-8601 YYYY-MM-DD
  password: string;
  locale: string;
  timeZone: string;
  acceptedTermsVersion: string;
  tenantId?: string;
  portal: Portal;
}

export interface RegisterResponse {
  userId: string;
  status: UserStatus;
  requiresEmailVerification: boolean;
  requiresApproval: boolean;
}

// ---- Auth flows --------------------------------------------------------------------------------

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  mfaRequired: boolean;
  mfaToken?: string;
}

export interface MfaVerifyRequest {
  mfaToken: string;
  code: string;
}

export interface MfaVerifyResponse {
  tokens: TokenPair;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  tokens: TokenPair;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface MfaSetupResponse {
  secret: string;
  otpauthUri: string;
  recoveryCodes: string[];
}

export interface MfaActivateRequest {
  code: string;
}

// ---- Session / profile ---------------------------------------------------------------------

export interface UserProfile {
  id: string;
  email: string;
  emailVerified: boolean;
  givenName: string;
  familyName: string;
  secondFamilyName?: string;
  birthDate: string;
  nationalityCode: string;
  phone: PhoneInput;
  identityDocument: IdentityDocumentInput;
  address: AddressInput;
  locale: string;
  timeZone: string;
  status: UserStatus;
  mfaRequired: boolean;
  mfaEnabled: boolean;
}

export interface MembershipSummary {
  /**
   * Not part of the `/me/memberships` wire shape in CONTRACT.md §4 (which
   * lists only tenantId/tenantName/portal/role/status) — populated when the
   * membership is surfaced through an admin endpoint, where it's required to
   * address `/api/v1/admin/memberships/{id}/*`.
   */
  id?: string;
  tenantId: string;
  tenantName: string;
  portal: Portal;
  role: Role;
  status: MembershipStatus;
}

export interface MeResponse {
  user: UserProfile;
  memberships: MembershipSummary[];
  activeTenant: TenantCatalogEntry | null;
}

export interface SessionTenantRequest {
  tenantId: string;
}

// ---- Admin: users & memberships ---------------------------------------------------------------

export interface AdminUserListItem {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  createdAt: string;
  memberships: MembershipSummary[];
}

export interface AdminUserDetail extends AdminUserListItem {
  givenName: string;
  familyName: string;
  secondFamilyName?: string;
  birthDate: string;
  nationalityCode: string;
  phone: PhoneInput;
  identityDocument: IdentityDocumentInput;
  address: AddressInput;
  mfaRequired: boolean;
  mfaEnabled: boolean;
  blockedReason?: string;
}

export type AdminUsersQuery = {
  q?: string;
  portal?: Portal;
  role?: Role;
  status?: UserStatus;
  tenantId?: string;
};

export interface BlockUserRequest {
  reason: string;
}

export interface RequireMfaRequest {
  required: boolean;
}

export interface CreateMembershipRequest {
  userId: string;
  tenantId: string;
  portal: Portal;
  role: Role;
}

export interface UpdateMembershipRequest {
  role: Role;
  status: MembershipStatus;
}

export interface RejectMembershipRequest {
  reason: string;
}

// ---- Admin: audit & reports ---------------------------------------------------------------

export interface AuditEvent {
  id: string;
  tenantId: string | null;
  actorUserId: string;
  actorPortal: Portal;
  action: string;
  resourceType: string;
  resourceId: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export type AuditEventsQuery = {
  actor?: string;
  action?: string;
  from?: string;
  to?: string;
};

export type RegisteredUsersGroupBy = 'tenant' | 'country' | 'portal' | 'month';

export type RegisteredUsersReportQuery = {
  from: string;
  to: string;
  groupBy: RegisteredUsersGroupBy;
};

export interface RegisteredUsersReportRow {
  group: string;
  count: number;
}

export interface CreateExportRequest {
  type: string;
  filters: Record<string, unknown>;
}

export interface CreateExportResponse {
  exportId: string;
}

export interface CreateTenantRequest {
  slug: string;
  legalName: string;
  displayName: string;
  countryCode: string;
  currencyCode: string;
  locale: string;
  timeZone: string;
  selfRegistrationPolicy: SelfRegistrationPolicy;
}

export interface TenantAdmin extends TenantCatalogEntry {
  legalName: string;
  currencyCode: string;
  locale: string;
  timeZone: string;
  status: string;
  selfRegistrationPolicy: SelfRegistrationPolicy;
}

// ---- Platform back-office (CONTRACT.md §4 `/api/v1/platform/**`, PLATFORM_ADMIN/PLATFORM_SUPPORT + MFA) ------

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

/** `GET/PUT /platform/tenants/{id}` — the platform's own tenant shape (distinct from the read-only `TenantAdmin` the municipal `admin` portal happens to expose). */
export interface PlatformTenant {
  id: string;
  slug: string;
  legalName: string;
  displayName: string;
  countryCode: string;
  currencyCode: string;
  locale: string;
  timeZone: string;
  status: TenantStatus;
  selfRegistrationPolicy: SelfRegistrationPolicy;
  createdAt: string;
}

export type PlatformTenantsQuery = {
  q?: string;
  status?: TenantStatus;
  country?: string;
};

export interface UpdateTenantStatusRequest {
  status: TenantStatus;
  reason: string;
}

/** Typed key-value tenant settings (CONTRACT.md §5 `tenant_settings(key, value jsonb)`). */
export type TenantSettings = Record<string, string | number | boolean>;

export interface CreateTenantAdminRequest {
  email: string;
  givenName: string;
  familyName: string;
}

export interface CreateTenantAdminResponse {
  userId: string;
  membershipId: string;
  status: MembershipStatus;
}

/** Global registry item (`GET /platform/users`) — one row per person, independent of any single tenant. */
export type PlatformUserListItem = AdminUserListItem;
export type PlatformUserDetail = AdminUserDetail;

export type PlatformUsersQuery = {
  q?: string;
  country?: string;
  status?: UserStatus;
  tenantId?: string;
};

export interface CreatePlatformMembershipRequest {
  userId: string;
  tenantId: string;
  portal: Portal;
  role: Role;
}

export type PlatformAuditEventsQuery = {
  tenantId?: string;
  actor?: string;
  action?: string;
  from?: string;
  to?: string;
};

export type PlatformRegisteredUsersReportQuery = {
  groupBy: RegisteredUsersGroupBy;
};

// ---- Platform catalogs (countries / admin levels / divisions / document types) -------------

export interface PlatformCountry extends CountryCatalogEntry {
  active: boolean;
}

export interface UpsertCountryRequest {
  code: string;
  name: string;
  dialCode: string;
  defaultLocale: string;
  defaultCurrency: string;
  defaultTimeZone: string;
  active: boolean;
}

export interface UpsertAdminLevelRequest {
  countryCode: string;
  level: number;
  labelKey: string;
  required: boolean;
}

export interface UpsertDivisionRequest {
  countryCode: string;
  level: number;
  parentId: string | null;
  code: string;
  name: string;
  active: boolean;
}

export interface UpsertDocumentTypeRequest {
  countryCode: string;
  type: IdentityDocumentType;
  labelKey: string;
  pattern: string;
  example: string;
}

// ---- Platform system (health / feature flags / jobs — prepared, not closed: CONTRACT.md §4) ---

export interface SystemHealthComponent {
  name: string;
  status: 'UP' | 'DOWN' | 'DEGRADED';
}

export interface SystemHealth {
  status: 'UP' | 'DOWN' | 'DEGRADED';
  components: SystemHealthComponent[];
}

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description?: string;
}

export interface SystemJob {
  name: string;
  status: 'IDLE' | 'RUNNING' | 'FAILED';
  lastRunAt?: string;
}
