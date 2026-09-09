import { HttpClient, type HttpClientOptions } from './http';
import {
  toExtensionOption,
  toParkingSession,
  toParkingSessions,
  toQuote,
  toTimeCredits,
  toWallet,
  type WireExtensionOption,
  type WireParkingSession,
  type WireQuote,
  type WireTimeCredits,
  type WireWallet,
} from './wire';
import {
  withResolvedMeLogos,
  withResolvedMembershipLogo,
  withResolvedSwitchTenantLogo,
  withResolvedTenantLogo,
} from './tenantBranding';
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
  ChangeEmailRequest,
  ChangePasswordRequest,
  ExtendParkingSessionRequest,
  FeatureFlag,
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
  ParkingExtensionOption,
  ParkingPolicy,
  ParkingQuoteRequest,
  ParkingQuoteResponse,
  ParkingSession,
  ParkingSchedule,
  ParkingSessionsQuery,
  ParkingSpaceFormat,
  ParkingZone,
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
  SwitchTenantResponse,
  StartParkingSessionRequest,
  SystemHealth,
  SystemJob,
  TenantAdmin,
  TenantCatalogEntry,
  TenantLocale,
  TenantLocaleSettings,
  TenantSettings,
  TimeCreditsResponse,
  UpdateMembershipRequest,
  UpdateParkingScheduleRequest,
  UpdateParkingSpaceFormatRequest,
  UpdateProfileRequest,
  UpdateTenantLocalesRequest,
  UpdateTenantStatusRequest,
  UpdateVehicleRequest,
  UpsertAdminLevelRequest,
  UpsertCountryRequest,
  UpsertDivisionRequest,
  UpsertDocumentTypeRequest,
  UserProfile,
  Vehicle,
  VehicleAttributeCatalogEntry,
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
  /** Kept so a municipality's server-resolved `logoUrl` can be absolutised (see ./tenantBranding). */
  private readonly baseUrl: string;

  constructor(portal: Portal, options: HttpClientOptions) {
    this.portal = portal;
    this.baseUrl = options.baseUrl;
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
    /**
     * Every municipality a citizen may pick — the whole publishable catalogue, not the ones they
     * already belong to: switching to a municipality they have never used joins them to it on the
     * spot. `q` is matched server-side against the name and the slug, which is what makes a list
     * of every municipality in a country usable without paging it.
     */
    tenants: async (params: { country?: string; q?: string } = {}): Promise<TenantCatalogEntry[]> =>
      (
        await this.http.request<TenantCatalogEntry[]>('GET', '/api/v1/catalog/tenants', {
          auth: false,
          query: { country: params.country, q: params.q },
        })
      ).map((tenant) => withResolvedTenantLogo(tenant, this.baseUrl)),
    /**
     * Locales a municipality has enabled (CONTRACT.md v0.3 §"Idiomas por municipalidad").
     * Public on purpose: the login screen needs it before anyone has authenticated.
     */
    tenantLocales: (tenantId: string): Promise<TenantLocale[]> =>
      this.http.request('GET', `/api/v1/catalog/tenants/${tenantId}/locales`, { auth: false }),
    /**
     * The vehicle enumerations the whole platform shares (`[{value, labelKey}]`). Public and
     * slow-moving like the rest of `/catalog`, so every portal can read them before authenticating
     * and cache them for a long time.
     */
    vehicleTypes: (): Promise<VehicleAttributeCatalogEntry[]> =>
      this.http.request('GET', '/api/v1/catalog/vehicle-types', { auth: false }),
    vehicleColors: (): Promise<VehicleAttributeCatalogEntry[]> =>
      this.http.request('GET', '/api/v1/catalog/vehicle-colors', { auth: false }),
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
    me: async (): Promise<MeResponse> =>
      withResolvedMeLogos(await this.http.request<MeResponse>('GET', `/api/v1/${this.portal}/me`), this.baseUrl),
    /**
     * Every personal field of CONTRACT.md §2 (v0.3 §"Perfil editable"). The e-mail is deliberately
     * NOT part of this payload: changing it is changing the identity you sign in with, so it goes
     * through {@link changeEmail} and its verification.
     *
     * <p>It answers with the PROFILE, not with the `/me` envelope: no memberships, no active
     * municipality — editing a phone number changes none of those. This used to be typed and
     * post-processed as a {@link MeResponse}, so every successful save then threw on
     * `memberships.map(...)` of an undefined list and the screen reported a generic failure over a
     * change the server had already committed. The shape is the server's; reading it correctly is
     * this layer's job.</p>
     */
    updateMe: (payload: UpdateProfileRequest): Promise<UserProfile> =>
      this.http.request('PUT', `/api/v1/${this.portal}/me`, { body: payload }),
    /** Requires the current password; revokes every other session (CONTRACT.md v0.3 §1.3). */
    changePassword: (payload: ChangePasswordRequest): Promise<void> =>
      this.http.request('POST', `/api/v1/${this.portal}/me/password`, { body: payload }),
    /** Starts the e-mail change: the new address has to be verified before it replaces the current one. */
    changeEmail: (payload: ChangeEmailRequest): Promise<void> =>
      this.http.request('POST', `/api/v1/${this.portal}/me/email`, { body: payload }),
    memberships: async (): Promise<MembershipSummary[]> =>
      (
        await this.http.request<MembershipSummary[]>('GET', `/api/v1/${this.portal}/me/memberships`)
      ).map((membership) => withResolvedMembershipLogo(membership, this.baseUrl)),
    /**
     * Scopes the session to one municipality (CONTRACT.md v0.4). The answer carries the new token
     * pair AND that municipality's branding, so the badge in the top bar repaints from the very
     * response that changed the session rather than from a follow-up request that could disagree.
     */
    switchTenant: async (payload: SessionTenantRequest): Promise<SwitchTenantResponse> =>
      withResolvedSwitchTenantLogo(
        await this.http.request<SwitchTenantResponse>('POST', `/api/v1/${this.portal}/session/tenant`, {
          body: payload,
        }),
        this.baseUrl,
      ),
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
  // tap can never charge twice. Everything the server returns goes through ./wire: money arrives
  // as `{amountMinor, currencyCode}` and lists arrive inside a page envelope, and no screen should
  // have to know that.

  readonly citizenParking = {
    policy: (): Promise<ParkingPolicy> => this.http.request('GET', '/api/v1/citizen/parking/policy'),
    /** The municipality's charging schedule, evaluated in its own time zone (CONTRACT.md v0.3). */
    schedule: (): Promise<ParkingSchedule> => this.http.request('GET', '/api/v1/citizen/parking/schedule'),
    /**
     * Zones the citizen can park in, with the bay-code range of each — the list `POST /quote` and
     * `POST /sessions` take their mandatory `zoneId` from.
     */
    zones: (): Promise<ParkingZone[]> => this.http.request('GET', '/api/v1/citizen/parking/zones'),
    /**
     * The shape of a bay code in this municipality (CONTRACT.md v0.3 §"Formato del código de
     * espacio"), published to the citizen so their field can show the municipality's own example
     * and refuse an impossible code before it costs a round trip. The admin endpoint of the same
     * name writes it; this one only reads, and needs no `TENANT_MANAGE`.
     */
    spaceFormat: (): Promise<ParkingSpaceFormat> =>
      this.http.request('GET', '/api/v1/citizen/parking/space-format'),
    quote: async (payload: ParkingQuoteRequest): Promise<ParkingQuoteResponse> =>
      toQuote(await this.http.request<WireQuote>('POST', '/api/v1/citizen/parking/quote', { body: payload })),
    sessions: async (query: ParkingSessionsQuery = {}): Promise<ParkingSession[]> =>
      toParkingSessions(
        await this.http.request<PagedResponse<WireParkingSession>>('GET', '/api/v1/citizen/parking/sessions', {
          query,
        }),
      ),
    session: async (id: string): Promise<ParkingSession> =>
      toParkingSession(
        (
          await this.http.request<{ session: WireParkingSession }>(
            'GET',
            `/api/v1/citizen/parking/sessions/${id}`,
          )
        ).session,
      ),
    start: async (payload: StartParkingSessionRequest): Promise<ParkingSession> =>
      toParkingSession(
        await this.http.request<WireParkingSession>('POST', '/api/v1/citizen/parking/sessions', {
          body: payload,
          idempotent: true,
        }),
      ),
    /**
     * Every extension this municipality offers on this stay, priced, in one request.
     *
     * <p>The dialog that offers extensions needs a price per option; quoting them one at a time
     * would be a round trip per row and a list whose rows were answered at different instants.
     * Options the citizen may not take come back with `allowed: false` and a reason, and are shown
     * disabled rather than hidden.</p>
     */
    extensionOptions: async (id: string): Promise<ParkingExtensionOption[]> =>
      (
        await this.http.request<WireExtensionOption[]>(
          'GET',
          `/api/v1/citizen/parking/sessions/${id}/extension-options`,
        )
      ).map(toExtensionOption),
    extend: async (id: string, payload: ExtendParkingSessionRequest): Promise<ParkingSession> =>
      toParkingSession(
        await this.http.request<WireParkingSession>(`POST`, `/api/v1/citizen/parking/sessions/${id}/extend`, {
          body: payload,
          idempotent: true,
        }),
      ),
    finish: async (id: string): Promise<ParkingSession> =>
      toParkingSession(
        await this.http.request<WireParkingSession>('POST', `/api/v1/citizen/parking/sessions/${id}/finish`, {
          idempotent: true,
        }),
      ),
  };

  // ---- Citizen: wallet & time credits (CONTRACT.md v0.2) ---------------------------------------

  readonly citizenWallet = {
    get: async (): Promise<WalletResponse> =>
      toWallet(await this.http.request<WireWallet>('GET', '/api/v1/citizen/wallet')),
  };

  readonly citizenTimeCredits = {
    get: async (): Promise<TimeCreditsResponse> =>
      toTimeCredits(await this.http.request<WireTimeCredits>('GET', '/api/v1/citizen/time-credits')),
  };

  // ---- Municipal operation settings (CONTRACT.md v0.3) -----------------------------------------
  // The three knobs a municipal administrator owns: which languages the portals offer, how a bay
  // code is written, and when parking is actually charged. All three are configuration read by
  // every portal, never constants in the apps.

  readonly adminSettings = {
    locales: (): Promise<TenantLocaleSettings> => this.http.request('GET', '/api/v1/admin/settings/locales'),
    updateLocales: (payload: UpdateTenantLocalesRequest): Promise<TenantLocaleSettings> =>
      this.http.request('PUT', '/api/v1/admin/settings/locales', { body: payload }),
  };

  readonly adminParking = {
    spaceFormat: (): Promise<ParkingSpaceFormat> =>
      this.http.request('GET', '/api/v1/admin/parking/space-format'),
    updateSpaceFormat: (payload: UpdateParkingSpaceFormatRequest): Promise<ParkingSpaceFormat> =>
      this.http.request('PUT', '/api/v1/admin/parking/space-format', { body: payload }),
    schedule: (): Promise<ParkingSchedule> => this.http.request('GET', '/api/v1/admin/parking/schedule'),
    updateSchedule: (payload: UpdateParkingScheduleRequest): Promise<ParkingSchedule> =>
      this.http.request('PUT', '/api/v1/admin/parking/schedule', { body: payload }),
    zones: (): Promise<ParkingZone[]> => this.http.request('GET', '/api/v1/admin/parking/zones'),
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
