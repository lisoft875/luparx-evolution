import { HttpClient, type HttpClientOptions } from './http';
import type { PagedResponse, PageParams } from './types/http';
import type {
  AdminUserDetail,
  AdminUserListItem,
  AdminUsersQuery,
  AdministrativeDivision,
  AdminLevelCatalogEntry,
  AuditEvent,
  AuditEventsQuery,
  BlockUserRequest,
  CountryCatalogEntry,
  CreateExportRequest,
  CreateExportResponse,
  CreateMembershipRequest,
  CreatePlatformMembershipRequest,
  CreateTenantAdminRequest,
  CreateTenantAdminResponse,
  CreateTenantRequest,
  CreateVehicleRequest,
  DocumentTypeCatalogEntry,
  ExtendParkingSessionRequest,
  ExtendParkingSessionResponse,
  FeatureFlag,
  FinishParkingSessionResponse,
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  MeResponse,
  MembershipSummary,
  MfaActivateRequest,
  MfaSetupResponse,
  MfaVerifyRequest,
  MfaVerifyResponse,
  OAuthProvider,
  ParkingPolicy,
  ParkingQuoteRequest,
  ParkingQuoteResponse,
  ParkingSession,
  ParkingSessionsQuery,
  PlatformAuditEventsQuery,
  PlatformCountry,
  PlatformRegisteredUsersReportQuery,
  PlatformTenant,
  PlatformTenantsQuery,
  PlatformUserDetail,
  PlatformUserListItem,
  PlatformUsersQuery,
  Portal,
  RefreshRequest,
  RefreshResponse,
  RegisterRequest,
  RegisterResponse,
  RegisteredUsersReportQuery,
  RegisteredUsersReportRow,
  RejectMembershipRequest,
  RequireMfaRequest,
  ResetPasswordRequest,
  SessionTenantRequest,
  StartParkingSessionRequest,
  SystemHealth,
  SystemJob,
  TenantAdmin,
  TenantCatalogEntry,
  TenantSettings,
  TimeCreditsResponse,
  UpdateMembershipRequest,
  UpdateTenantStatusRequest,
  UpdateVehicleRequest,
  UpsertAdminLevelRequest,
  UpsertCountryRequest,
  UpsertDivisionRequest,
  UpsertDocumentTypeRequest,
  Vehicle,
  VerifyEmailRequest,
  WalletResponse,
} from './types/domain';

export type { PagedResponse, PageParams } from './types/http';

/** Builds the browser-redirect URL for a federated login start (CONTRACT.md §4). Never fetched via XHR — assign it to `location.href`. */
export function oauthStartUrl(baseUrl: string, portal: Portal, provider: OAuthProvider, redirectUri: string): string {
  const params = new URLSearchParams({ redirectUri });
  return `${baseUrl.replace(/\/$/, '')}/api/v1/auth/${portal}/oauth2/${provider}/start?${params.toString()}`;
}

/**
 * Typed client for the LupaRX API v1 contract (CONTRACT.md §4). One instance
 * is created per portal (see @luparx/auth), each pointed at that portal's
 * route prefix and carrying that portal's isolated token provider.
 */
export class ApiClient {
  private readonly http: HttpClient;
  private readonly portal: Portal;

  constructor(portal: Portal, options: HttpClientOptions) {
    this.portal = portal;
    this.http = new HttpClient(options);
  }

  // ---- Public catalogs (no auth) -------------------------------------------------------------

  readonly catalog = {
    countries: (): Promise<CountryCatalogEntry[]> =>
      this.http.request('GET', '/api/v1/catalog/countries', { auth: false }),
    adminLevels: (countryCode: string): Promise<AdminLevelCatalogEntry[]> =>
      this.http.request('GET', `/api/v1/catalog/countries/${countryCode}/admin-levels`, { auth: false }),
    divisions: (
      countryCode: string,
      params: { parentId?: string; level?: number },
    ): Promise<AdministrativeDivision[]> =>
      this.http.request('GET', `/api/v1/catalog/countries/${countryCode}/divisions`, {
        auth: false,
        query: { parentId: params.parentId, level: params.level },
      }),
    documentTypes: (countryCode: string): Promise<DocumentTypeCatalogEntry[]> =>
      this.http.request('GET', `/api/v1/catalog/countries/${countryCode}/document-types`, { auth: false }),
    tenants: (country?: string): Promise<TenantCatalogEntry[]> =>
      this.http.request('GET', '/api/v1/catalog/tenants', { auth: false, query: { country } }),
  };

  // ---- Auth (one root per portal) ------------------------------------------------------------

  readonly auth = {
    register: (payload: RegisterRequest): Promise<RegisterResponse> =>
      this.http.request('POST', `/api/v1/auth/${this.portal}/register`, {
        auth: false,
        body: payload,
        idempotent: true,
      }),
    login: (payload: LoginRequest): Promise<LoginResponse> =>
      this.http.request('POST', `/api/v1/auth/${this.portal}/login`, { auth: false, body: payload }),
    mfaVerify: (payload: MfaVerifyRequest): Promise<MfaVerifyResponse> =>
      this.http.request('POST', `/api/v1/auth/${this.portal}/mfa/verify`, { auth: false, body: payload }),
    refresh: (payload: RefreshRequest): Promise<RefreshResponse> =>
      this.http.request('POST', `/api/v1/auth/${this.portal}/refresh`, { auth: false, body: payload }),
    logout: (payload: RefreshRequest): Promise<void> =>
      this.http.request('POST', `/api/v1/auth/${this.portal}/logout`, { auth: false, body: payload }),
    forgotPassword: (payload: ForgotPasswordRequest): Promise<void> =>
      this.http.request('POST', `/api/v1/auth/${this.portal}/password/forgot`, { auth: false, body: payload }),
    resetPassword: (payload: ResetPasswordRequest): Promise<void> =>
      this.http.request('POST', `/api/v1/auth/${this.portal}/password/reset`, { auth: false, body: payload }),
    verifyEmail: (payload: VerifyEmailRequest): Promise<void> =>
      this.http.request('POST', `/api/v1/auth/${this.portal}/email/verify`, { auth: false, body: payload }),
  };

  // ---- Session / profile ---------------------------------------------------------------------

  readonly session = {
    me: (): Promise<MeResponse> => this.http.request('GET', `/api/v1/${this.portal}/me`),
    updateMe: (payload: Partial<RegisterRequest>): Promise<MeResponse> =>
      this.http.request('PUT', `/api/v1/${this.portal}/me`, { body: payload }),
    memberships: (): Promise<MembershipSummary[]> =>
      this.http.request('GET', `/api/v1/${this.portal}/me/memberships`),
    switchTenant: (payload: SessionTenantRequest): Promise<RefreshResponse> =>
      this.http.request('POST', `/api/v1/${this.portal}/session/tenant`, { body: payload }),
    mfaSetup: (): Promise<MfaSetupResponse> =>
      this.http.request('POST', `/api/v1/${this.portal}/me/mfa/setup`),
    mfaActivate: (payload: MfaActivateRequest): Promise<void> =>
      this.http.request('POST', `/api/v1/${this.portal}/me/mfa/activate`, { body: payload }),
    mfaDisable: (payload: MfaActivateRequest): Promise<void> =>
      this.http.request('DELETE', `/api/v1/${this.portal}/me/mfa`, { body: payload }),
  };

  // ---- Admin: users & memberships -------------------------------------------------------------

  readonly adminUsers = {
    list: (query: AdminUsersQuery & PageParams): Promise<PagedResponse<AdminUserListItem>> =>
      this.http.request('GET', '/api/v1/admin/users', { query }),
    get: (id: string): Promise<AdminUserDetail> => this.http.request('GET', `/api/v1/admin/users/${id}`),
    block: (id: string, payload: BlockUserRequest): Promise<void> =>
      this.http.request('POST', `/api/v1/admin/users/${id}/block`, { body: payload, idempotent: true }),
    unblock: (id: string): Promise<void> =>
      this.http.request('POST', `/api/v1/admin/users/${id}/unblock`, { idempotent: true }),
    forcePasswordReset: (id: string): Promise<void> =>
      this.http.request('POST', `/api/v1/admin/users/${id}/password-reset`, { idempotent: true }),
    requireMfa: (id: string, payload: RequireMfaRequest): Promise<void> =>
      this.http.request('POST', `/api/v1/admin/users/${id}/mfa/require`, { body: payload }),
  };

  readonly adminMemberships = {
    create: (payload: CreateMembershipRequest): Promise<void> =>
      this.http.request('POST', '/api/v1/admin/memberships', { body: payload, idempotent: true }),
    update: (id: string, payload: UpdateMembershipRequest): Promise<void> =>
      this.http.request('PUT', `/api/v1/admin/memberships/${id}`, { body: payload }),
    approve: (id: string): Promise<void> =>
      this.http.request('POST', `/api/v1/admin/memberships/${id}/approve`, { idempotent: true }),
    reject: (id: string, payload: RejectMembershipRequest): Promise<void> =>
      this.http.request('POST', `/api/v1/admin/memberships/${id}/reject`, { body: payload, idempotent: true }),
    remove: (id: string): Promise<void> => this.http.request('DELETE', `/api/v1/admin/memberships/${id}`),
  };

  readonly adminAudit = {
    list: (query: AuditEventsQuery & PageParams): Promise<PagedResponse<AuditEvent>> =>
      this.http.request('GET', '/api/v1/admin/audit-events', { query }),
  };

  readonly adminReports = {
    registeredUsers: (query: RegisteredUsersReportQuery): Promise<RegisteredUsersReportRow[]> =>
      this.http.request('GET', '/api/v1/admin/reports/registered-users', { query }),
  };

  readonly adminExports = {
    // TODO(extension): v0.1 is synchronous CSV (<=10k rows); async export status polling is a future extension point.
    create: (payload: CreateExportRequest): Promise<CreateExportResponse> =>
      this.http.request('POST', '/api/v1/admin/exports', { body: payload, idempotent: true }),
  };

  readonly adminTenants = {
    list: (): Promise<TenantAdmin[]> => this.http.request('GET', '/api/v1/admin/tenants'),
    create: (payload: CreateTenantRequest): Promise<TenantAdmin> =>
      this.http.request('POST', '/api/v1/admin/tenants', { body: payload, idempotent: true }),
  };

  // ---- Citizen: vehicles (CONTRACT.md v0.2 "Vehículos") --------------------------------------

  readonly citizenVehicles = {
    list: (): Promise<Vehicle[]> => this.http.request('GET', '/api/v1/citizen/vehicles'),
    create: (payload: CreateVehicleRequest): Promise<Vehicle> =>
      this.http.request('POST', '/api/v1/citizen/vehicles', { body: payload, idempotent: true }),
    update: (id: string, payload: UpdateVehicleRequest): Promise<Vehicle> =>
      this.http.request('PUT', `/api/v1/citizen/vehicles/${id}`, { body: payload }),
    remove: (id: string): Promise<void> => this.http.request('DELETE', `/api/v1/citizen/vehicles/${id}`),
    setPrimary: (id: string): Promise<void> =>
      this.http.request('POST', `/api/v1/citizen/vehicles/${id}/primary`, { idempotent: true }),
  };

  // ---- Citizen: parking domain (CONTRACT.md v0.2) ---------------------------------------------
  // Amount/credit math always happens server-side (v0.2 "Invariantes") — the client only ever
  // requests a quote to display it. Start/extend/finish all carry `Idempotency-Key` so a double
  // tap can never charge twice.

  readonly citizenParking = {
    policy: (): Promise<ParkingPolicy> => this.http.request('GET', '/api/v1/citizen/parking/policy'),
    quote: (payload: ParkingQuoteRequest): Promise<ParkingQuoteResponse> =>
      this.http.request('POST', '/api/v1/citizen/parking/quote', { body: payload }),
    sessions: (query: ParkingSessionsQuery = {}): Promise<ParkingSession[]> =>
      this.http.request('GET', '/api/v1/citizen/parking/sessions', { query }),
    session: (id: string): Promise<ParkingSession> =>
      this.http.request('GET', `/api/v1/citizen/parking/sessions/${id}`),
    start: (payload: StartParkingSessionRequest): Promise<ParkingSession> =>
      this.http.request('POST', '/api/v1/citizen/parking/sessions', { body: payload, idempotent: true }),
    extend: (id: string, payload: ExtendParkingSessionRequest): Promise<ExtendParkingSessionResponse> =>
      this.http.request('POST', `/api/v1/citizen/parking/sessions/${id}/extend`, {
        body: payload,
        idempotent: true,
      }),
    finish: (id: string): Promise<FinishParkingSessionResponse> =>
      this.http.request('POST', `/api/v1/citizen/parking/sessions/${id}/finish`, { idempotent: true }),
  };

  // ---- Citizen: wallet & time credits (CONTRACT.md v0.2) ---------------------------------------

  readonly citizenWallet = {
    get: (): Promise<WalletResponse> => this.http.request('GET', '/api/v1/citizen/wallet'),
  };

  readonly citizenTimeCredits = {
    get: (): Promise<TimeCreditsResponse> => this.http.request('GET', '/api/v1/citizen/time-credits'),
  };

  // ---- Platform back-office (CONTRACT.md §4 `/api/v1/platform/**`) ---------------------------
  // Every route here requires PLATFORM_ADMIN/PLATFORM_SUPPORT + MFA; the resource server checks
  // this independently of anything the client renders (CONTRACT.md §7). "Preparado, no cerrado":
  // module boundaries below (catalog writes, system) are extension points, not a closed surface.

  readonly platformTenants = {
    list: (query: PlatformTenantsQuery): Promise<PlatformTenant[]> =>
      this.http.request('GET', '/api/v1/platform/tenants', { query }),
    get: (id: string): Promise<PlatformTenant> => this.http.request('GET', `/api/v1/platform/tenants/${id}`),
    create: (payload: CreateTenantRequest): Promise<PlatformTenant> =>
      this.http.request('POST', '/api/v1/platform/tenants', { body: payload, idempotent: true }),
    update: (id: string, payload: Partial<CreateTenantRequest>): Promise<PlatformTenant> =>
      this.http.request('PUT', `/api/v1/platform/tenants/${id}`, { body: payload }),
    setStatus: (id: string, payload: UpdateTenantStatusRequest): Promise<void> =>
      this.http.request('POST', `/api/v1/platform/tenants/${id}/status`, { body: payload, idempotent: true }),
    getSettings: (id: string): Promise<TenantSettings> =>
      this.http.request('GET', `/api/v1/platform/tenants/${id}/settings`),
    updateSettings: (id: string, payload: TenantSettings): Promise<void> =>
      this.http.request('PUT', `/api/v1/platform/tenants/${id}/settings`, { body: payload }),
    createAdmin: (id: string, payload: CreateTenantAdminRequest): Promise<CreateTenantAdminResponse> =>
      this.http.request('POST', `/api/v1/platform/tenants/${id}/admins`, { body: payload, idempotent: true }),
  };

  readonly platformUsers = {
    list: (query: PlatformUsersQuery & PageParams): Promise<PagedResponse<PlatformUserListItem>> =>
      this.http.request('GET', '/api/v1/platform/users', { query }),
    get: (id: string): Promise<PlatformUserDetail> => this.http.request('GET', `/api/v1/platform/users/${id}`),
    block: (id: string, payload: BlockUserRequest): Promise<void> =>
      this.http.request('POST', `/api/v1/platform/users/${id}/block`, { body: payload, idempotent: true }),
    unblock: (id: string): Promise<void> =>
      this.http.request('POST', `/api/v1/platform/users/${id}/unblock`, { idempotent: true }),
    forcePasswordReset: (id: string): Promise<void> =>
      this.http.request('POST', `/api/v1/platform/users/${id}/password-reset`, { idempotent: true }),
    requireMfa: (id: string, payload: RequireMfaRequest): Promise<void> =>
      this.http.request('POST', `/api/v1/platform/users/${id}/mfa/require`, { body: payload }),
  };

  readonly platformMemberships = {
    create: (payload: CreatePlatformMembershipRequest): Promise<void> =>
      this.http.request('POST', '/api/v1/platform/memberships', { body: payload, idempotent: true }),
  };

  readonly platformAudit = {
    list: (query: PlatformAuditEventsQuery & PageParams): Promise<PagedResponse<AuditEvent>> =>
      this.http.request('GET', '/api/v1/platform/audit-events', { query }),
  };

  readonly platformReports = {
    registeredUsers: (query: PlatformRegisteredUsersReportQuery): Promise<RegisteredUsersReportRow[]> =>
      this.http.request('GET', '/api/v1/platform/reports/registered-users', { query }),
  };

  readonly platformCatalog = {
    countries: (): Promise<PlatformCountry[]> => this.http.request('GET', '/api/v1/platform/catalog/countries'),
    upsertCountry: (payload: UpsertCountryRequest): Promise<PlatformCountry> =>
      this.http.request('POST', '/api/v1/platform/catalog/countries', { body: payload, idempotent: true }),
    adminLevels: (countryCode: string): Promise<AdminLevelCatalogEntry[]> =>
      this.http.request('GET', `/api/v1/platform/catalog/countries/${countryCode}/admin-levels`),
    upsertAdminLevel: (payload: UpsertAdminLevelRequest): Promise<void> =>
      this.http.request('POST', '/api/v1/platform/catalog/admin-levels', { body: payload, idempotent: true }),
    divisions: (countryCode: string, params: { parentId?: string; level?: number }): Promise<AdministrativeDivision[]> =>
      this.http.request('GET', `/api/v1/platform/catalog/countries/${countryCode}/divisions`, {
        query: { parentId: params.parentId, level: params.level },
      }),
    upsertDivision: (payload: UpsertDivisionRequest): Promise<void> =>
      this.http.request('POST', '/api/v1/platform/catalog/divisions', { body: payload, idempotent: true }),
    documentTypes: (countryCode: string): Promise<DocumentTypeCatalogEntry[]> =>
      this.http.request('GET', `/api/v1/platform/catalog/countries/${countryCode}/document-types`),
    upsertDocumentType: (payload: UpsertDocumentTypeRequest): Promise<void> =>
      this.http.request('POST', '/api/v1/platform/catalog/document-types', { body: payload, idempotent: true }),
  };

  readonly platformSystem = {
    // TODO(extension): scope of what's controlled here is defined later (CONTRACT.md §4) — health/flags/jobs
    // are read-only placeholders today; billing, plans and usage limits arrive as new resources, not changes to these.
    health: (): Promise<SystemHealth> => this.http.request('GET', '/api/v1/platform/system/health'),
    featureFlags: (): Promise<FeatureFlag[]> => this.http.request('GET', '/api/v1/platform/system/feature-flags'),
    jobs: (): Promise<SystemJob[]> => this.http.request('GET', '/api/v1/platform/system/jobs'),
  };
}
