import { HttpClient, type HttpClientOptions } from './http';
import {
  toExtensionOption,
  toParkingRate,
  toParkingSession,
  toParkingSessions,
  toQuote,
  toTimeCredits,
  toWallet,
  type WireExtensionOption,
  type WireParkingRate,
  type WireParkingSession,
  type WireQuote,
  type WireTimeCredits,
  type WireWallet,
} from './wire';
import {
  toCitation,
  toAppeal,
  toCitationDetail,
  toEvidence,
  toFine,
  toFineDetail,
  toInfractionType,
  toPlateStatus,
  type WireCitation,
  type WireAppeal,
  type WireCitationDetail,
  type WireEvidence,
  type WireFine,
  type WireFineDetail,
  type WireInfractionType,
  type WirePlateStatus,
} from './wireEnforcement';
import {
  toBillingTotals,
  toPayment as toBillingPayment,
  toReconciliation,
  toSettlement as toBillingSettlement,
  toSettlementLine,
  type WireBillingTotals,
  type WirePayment,
  type WireReconciliation,
  type WireSettlement,
  type WireSettlementLine,
} from './wireBilling';
import { toDashboard, type WireDashboard } from './wireDashboard';
import {
  withResolvedMeLogos,
  withResolvedMembershipLogo,
  withResolvedSwitchTenantLogo,
  withResolvedTenantLogo,
} from './tenantBranding';
import type { PagedResponse, PageParams } from './types/http';
import type {
  AdminParkingZone,
  AdminUserDetail,
  AppealNotice,
  AppealStatus,
  CitationAppeal,
  FileAppealRequest,
  PublishAppealNoticeRequest,
  ResolveAppealRequest,
  AssignZonesRequest,
  CreateParkingSpaceRequest,
  CreateParkingZoneRequest,
  ParkingRate,
  ParkingSpace,
  SetParkingRateRequest,
  SetRateRungRequest,
  UpdateParkingPolicyRequest,
  UpdateParkingSpaceRequest,
  UpdateParkingZoneRequest,
  UpdateZoneRulesRequest,
  ZoneRules,
  HolidayCatalogEntry,
  CreateAdminUserRequest,
  PlateCheckRequest,
  EnforcementCheck,
  EnforcementChecksQuery,
  InspectorZone,
  ExemptionStatus,
  RequestExemptionRequest,
  AmendExemptionRequest,
  ExemptionDocument,
  ExemptionType,
  SaveExemptionTypeRequest,
  PlateExemption,
  CreateStaffInvitationRequest,
  StaffInvitation,
  InvitationStatus,
  InvitationPreview,
  AcceptInvitationRequest,
  AcceptInvitationResponse,
  LookupPersonRequest,
  LookupPersonResponse,
  MembershipStatus,
  StaffMember,
  SuspendMembershipRequest,
  ZoneAssignment,
  AdminUserListItem,
  AdminCitationsQuery,
  AdminUsersQuery,
  AdministrativeDivision,
  AdminLevelCatalogEntry,
  AuditEvent,
  AuditEventsQuery,
  AuditChain,
  AuditOriginProbe,
  Dashboard,
  BillingPaymentsQuery,
  BillingTotals,
  ImportSettlementRequest,
  Payment,
  Reconciliation,
  Settlement,
  SettlementLine,
  CitationIngestRequest,
  CitationIngestResult,
  ExternalInfractionMapping,
  MapCausalRequest,
  MapCausalResult,
  UnmappedCausal,
  AuditOriginProbeRequest,
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
  Citation,
  CitationCaptureResult,
  CitationDetail,
  CitationEvidence,
  CitationReasonRequest,
  CitationStatus,
  CreateCitationRequest,
  ExtendParkingSessionRequest,
  FeatureFlag,
  Fine,
  FineDetail,
  ForgotPasswordRequest,
  InfractionType,
  InfractionTypeDraft,
  LoginRequest,
  LoginResponse,
  MeResponse,
  MembershipSummary,
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
  PlateStatus,
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
  };

  // ---- Admin: users & memberships -------------------------------------------------------------

  readonly adminUsers = {
    list: (query: AdminUsersQuery & PageParams): Promise<PagedResponse<AdminUserListItem>> =>
      this.http.request('GET', '/api/v1/admin/users', { query }),
    get: (id: string): Promise<AdminUserDetail> => this.http.request('GET', `/api/v1/admin/users/${id}`),
    /**
     * One person, matched exactly by email or identity document (CONTRACT.md v0.26).
     *
     * A POST that reads: the criteria are personal data and do not belong in a URL. Not idempotent
     * on purpose — every attempt has to reach the server, because the server counts them.
     */
    lookup: (payload: LookupPersonRequest): Promise<LookupPersonResponse> =>
      this.http.request('POST', '/api/v1/admin/users/lookup', { body: payload }),
    // Idempotent: a double submit of a staff form must not open two accounts, and the second call
    // would otherwise land on EMAIL_ALREADY_REGISTERED and read to the administrator as their own
    // mistake.
    create: (payload: CreateAdminUserRequest): Promise<AdminUserDetail> =>
      this.http.request('POST', '/api/v1/admin/users', { body: payload, idempotent: true }),
    block: (id: string, payload: BlockUserRequest): Promise<void> =>
      this.http.request('POST', `/api/v1/admin/users/${id}/block`, { body: payload, idempotent: true }),
    unblock: (id: string): Promise<void> =>
      this.http.request('POST', `/api/v1/admin/users/${id}/unblock`, { idempotent: true }),
    forcePasswordReset: (id: string): Promise<void> =>
      this.http.request('POST', `/api/v1/admin/users/${id}/password-reset`, { idempotent: true }),
  };

  readonly adminStaff = {
    /** The municipality's staff, suspended and revoked posts included (CONTRACT.md v0.15). */
    list: (query: { status?: MembershipStatus } & PageParams = {}): Promise<PagedResponse<StaffMember>> =>
      this.http.request('GET', '/api/v1/admin/memberships/staff', { query }),
    suspend: (membershipId: string, payload: SuspendMembershipRequest): Promise<void> =>
      this.http.request('POST', `/api/v1/admin/memberships/${membershipId}/suspend`, {
        body: payload,
        idempotent: true,
      }),
    reactivate: (membershipId: string): Promise<void> =>
      this.http.request('POST', `/api/v1/admin/memberships/${membershipId}/reactivate`, { idempotent: true }),
    assignZones: (membershipId: string, payload: AssignZonesRequest): Promise<ZoneAssignment[]> =>
      this.http.request('PUT', `/api/v1/admin/memberships/${membershipId}/zones`, { body: payload }),
  };

  /**
   * Invitations of the active municipality (CONTRACT.md v0.27).
   *
   * `create` is idempotent-keyed: a double submit must not send the same person two different links,
   * and the second call would otherwise land on a re-issue that silently kills the first mail.
   */
  readonly adminStaffInvitations = {
    list: (query: { status?: InvitationStatus } & PageParams = {}): Promise<PagedResponse<StaffInvitation>> =>
      this.http.request('GET', '/api/v1/admin/staff-invitations', { query }),
    create: (payload: CreateStaffInvitationRequest): Promise<StaffInvitation> =>
      this.http.request('POST', '/api/v1/admin/staff-invitations', { body: payload, idempotent: true }),
    /** Sends it again with a new link. The previous one stops working. */
    resend: (id: string): Promise<StaffInvitation> =>
      this.http.request('POST', `/api/v1/admin/staff-invitations/${id}/resend`),
    revoke: (id: string): Promise<StaffInvitation> =>
      this.http.request('DELETE', `/api/v1/admin/staff-invitations/${id}`),
  };

  /**
   * Accepting an invitation. **Unauthenticated** — the person following the link has no account yet,
   * which is the whole point — so both calls go out with `auth: false`; sending the portal's bearer
   * token here would fail for the very people this is for.
   */
  readonly invitations = {
    preview: (token: string): Promise<InvitationPreview> =>
      this.http.request('GET', `/api/v1/invitations/${encodeURIComponent(token)}`, { auth: false }),
    accept: (token: string, payload: AcceptInvitationRequest): Promise<AcceptInvitationResponse> =>
      this.http.request('POST', `/api/v1/invitations/${encodeURIComponent(token)}/accept`, {
        body: payload,
        auth: false,
        idempotent: true,
      }),
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

  /** Plates this municipality does not fine for non-payment (CONTRACT.md v0.28). */
  /** The fiscalisation log: what each officer consulted, and whether it ended in a citation. */
  readonly adminEnforcementChecks = {
    list: (query: EnforcementChecksQuery & PageParams = {}): Promise<PagedResponse<EnforcementCheck>> =>
      // Spelled out field by field, like every other filtered listing here: an interface has no index
      // signature, and spreading one into the query object would let a renamed field travel silently.
      this.http.request('GET', '/api/v1/admin/enforcement/checks', {
        query: {
          inspectorUserId: query.inspectorUserId,
          zoneId: query.zoneId,
          plate: query.plate,
          verdict: query.verdict,
          from: query.from,
          to: query.to,
          page: query.page,
          size: query.size,
        },
      }),
  };

  readonly adminExemptions = {
    list: (
      query: { status?: ExemptionStatus; exemptionTypeId?: string; plate?: string } & PageParams = {},
    ): Promise<PagedResponse<PlateExemption>> =>
      this.http.request('GET', '/api/v1/admin/enforcement/exemptions', { query }),
    get: (id: string): Promise<PlateExemption> =>
      this.http.request('GET', `/api/v1/admin/enforcement/exemptions/${id}`),
    /** Registers a request. It is PENDING and exempts nobody until somebody grants it. */
    request: (payload: RequestExemptionRequest): Promise<PlateExemption> =>
      this.http.request('POST', '/api/v1/admin/enforcement/exemptions', { body: payload, idempotent: true }),
    amend: (id: string, payload: AmendExemptionRequest): Promise<PlateExemption> =>
      this.http.request('PUT', `/api/v1/admin/enforcement/exemptions/${id}`, { body: payload }),
    approve: (id: string): Promise<PlateExemption> =>
      this.http.request('POST', `/api/v1/admin/enforcement/exemptions/${id}/approve`, { body: {} }),
    reject: (id: string, payload: { reason: string }): Promise<PlateExemption> =>
      this.http.request('POST', `/api/v1/admin/enforcement/exemptions/${id}/reject`, { body: payload }),
    /** A POST and not a DELETE: nothing is deleted, because the row explains a decision. */
    revoke: (id: string, payload: { reason: string }): Promise<PlateExemption> =>
      this.http.request('POST', `/api/v1/admin/enforcement/exemptions/${id}/revoke`, { body: payload }),
    addPlate: (id: string, payload: { plate: string }): Promise<PlateExemption> =>
      this.http.request('POST', `/api/v1/admin/enforcement/exemptions/${id}/plates`, { body: payload }),
    /**
     * The only DELETE here, and it removes which vehicles a decision covers — not the decision. The
     * last plate cannot go: revoking is the act that was meant.
     */
    removePlate: (id: string, plate: string): Promise<PlateExemption> =>
      this.http.request(
        'DELETE',
        `/api/v1/admin/enforcement/exemptions/${id}/plates/${encodeURIComponent(plate)}`,
      ),
    documents: (id: string): Promise<ExemptionDocument[]> =>
      this.http.request('GET', `/api/v1/admin/enforcement/exemptions/${id}/documents`),
    /**
     * Attaches a backing document. The type is decided by the server from the file's own header, so
     * nothing here declares what the file is.
     */
    attachDocument: (id: string, title: string, file: File): Promise<ExemptionDocument> => {
      const form = new FormData();
      form.append('title', title);
      form.append('file', file);
      return this.http.upload<ExemptionDocument>(
        `/api/v1/admin/enforcement/exemptions/${id}/documents`,
        form,
      );
    },
    /**
     * The bytes, as a `Blob`. Never an `<img src>` or an `<a href>`: the document requires a bearer
     * token and is served `no-store`, so a plain link would fetch it without the header and show a
     * broken file — the same reason citation evidence is fetched this way.
     */
    document: (id: string, documentId: string): Promise<Blob> =>
      this.http.blob(`/api/v1/admin/enforcement/exemptions/${id}/documents/${documentId}`),
  };

  /** The municipality's own catalogue of permit categories. Configuration, never an enumeration. */
  readonly adminExemptionTypes = {
    list: (query: { activeOnly?: boolean } = {}): Promise<ExemptionType[]> =>
      this.http.request('GET', '/api/v1/admin/enforcement/exemption-types', { query }),
    create: (payload: SaveExemptionTypeRequest): Promise<ExemptionType> =>
      this.http.request('POST', '/api/v1/admin/enforcement/exemption-types', {
        body: payload,
        idempotent: true,
      }),
    update: (id: string, payload: SaveExemptionTypeRequest): Promise<ExemptionType> =>
      this.http.request('PUT', `/api/v1/admin/enforcement/exemption-types/${id}`, { body: payload }),
  };

  readonly adminAudit = {
    list: (query: AuditEventsQuery & PageParams): Promise<PagedResponse<AuditEvent>> =>
      this.http.request('GET', '/api/v1/admin/audit-events', { query }),
    /**
     * Recomputes this municipality's audit chain and reports any break (v0.32).
     *
     * A read that changes nothing: verification that could repair a chain would be a chain that
     * repairs itself, which proves nothing.
     */
    chain: (): Promise<AuditChain> => this.http.request('GET', '/api/v1/admin/audit-events/chain'),
    /**
     * Checks an address against this municipality's trail without the platform ever storing one
     * (v0.33).
     *
     * POST with the address in the body, deliberately, even though it changes nothing and would
     * otherwise be a GET: an address is personal data and personal data does not go in a URL. What
     * comes back is a hash, which is safe to pass to `list` as `ipHash`.
     *
     * Bounded per person like the directory lookup, and audited — it answers a yes-or-no about
     * somebody, so who asked it is itself part of the record.
     */
    checkOrigin: (payload: AuditOriginProbeRequest): Promise<AuditOriginProbe> =>
      this.http.request('POST', '/api/v1/admin/audit-events/ip-fingerprint', { body: payload }),
  };

  /**
   * What was charged, what the provider confirmed, and what is still owed (v0.35).
   *
   * The chain the checklist asks for — stay → payment → movement → settlement — is readable from
   * here in both directions: a payment says what it was applied to, and a movement says which
   * payment funded it.
   */
  readonly adminBilling = {
    totals: async (query: { from?: string; to?: string } = {}): Promise<BillingTotals> =>
      toBillingTotals(
        await this.http.request<WireBillingTotals>('GET', '/api/v1/admin/billing/totals', { query }),
      ),
    payments: async (query: BillingPaymentsQuery & PageParams = {}): Promise<PagedResponse<Payment>> => {
      const page = await this.http.request<PagedResponse<WirePayment>>(
        'GET',
        '/api/v1/admin/billing/payments',
        { query },
      );
      return { ...page, items: (page.items ?? []).map(toBillingPayment) };
    },
    /** Captured and unconfirmed: the list worth opening every week. */
    unsettled: async (query: { from?: string; to?: string } = {}): Promise<Payment[]> =>
      (
        await this.http.request<WirePayment[]>('GET', '/api/v1/admin/billing/payments/unsettled', { query })
      ).map(toBillingPayment),
    settlements: async (limit = 20): Promise<Settlement[]> =>
      (
        await this.http.request<WireSettlement[]>('GET', '/api/v1/admin/billing/settlements', {
          query: { limit },
        })
      ).map(toBillingSettlement),
    /** Imports a statement and reconciles it in the same call — two half-answers help nobody. */
    importSettlement: async (payload: ImportSettlementRequest): Promise<Reconciliation> =>
      toReconciliation(
        await this.http.request<WireReconciliation>('POST', '/api/v1/admin/billing/settlements', {
          body: payload,
        }),
      ),
    findings: async (settlementId: string): Promise<SettlementLine[]> =>
      (
        await this.http.request<WireSettlementLine[]>(
          'GET',
          `/api/v1/admin/billing/settlements/${settlementId}/findings`,
        )
      ).map(toSettlementLine),
    dispute: async (settlementId: string): Promise<Settlement> =>
      toBillingSettlement(
        await this.http.request<WireSettlement>(
          'POST',
          `/api/v1/admin/billing/settlements/${settlementId}/dispute`,
        ),
      ),
  };

  /**
   * Everything the municipality can consult, in one read (v0.36).
   *
   * One call and not nine: a dashboard assembled from nine requests renders in nine steps and each
   * can fail on its own, leaving a screen that is half true — worse than one honestly still loading,
   * because nobody can tell which half.
   */
  readonly adminDashboard = {
    get: async (query: { from?: string; to?: string } = {}): Promise<Dashboard> =>
      toDashboard(await this.http.request<WireDashboard>('GET', '/api/v1/admin/dashboard', { query })),
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
    policy: (): Promise<ParkingPolicy> => this.http.request('GET', '/api/v1/admin/parking/policy'),
    updatePolicy: (payload: UpdateParkingPolicyRequest): Promise<ParkingPolicy> =>
      this.http.request('PUT', '/api/v1/admin/parking/policy', { body: payload }),
    zones: (): Promise<AdminParkingZone[]> => this.http.request('GET', '/api/v1/admin/parking/zones'),
    createZone: (payload: CreateParkingZoneRequest): Promise<AdminParkingZone> =>
      this.http.request('POST', '/api/v1/admin/parking/zones', { body: payload, idempotent: true }),
    updateZone: (id: string, payload: UpdateParkingZoneRequest): Promise<AdminParkingZone> =>
      this.http.request('PUT', `/api/v1/admin/parking/zones/${id}`, { body: payload }),
    /** What this zone departs from the municipality in, and what it therefore applies (v0.31). */
    zoneRules: (id: string): Promise<ZoneRules> =>
      this.http.request('GET', `/api/v1/admin/parking/zones/${id}/rules`),
    /**
     * Replaces it all as one form. Absent means "follow the municipality", never "leave unchanged".
     */
    updateZoneRules: (id: string, payload: UpdateZoneRulesRequest): Promise<ZoneRules> =>
      this.http.request('PUT', `/api/v1/admin/parking/zones/${id}/rules`, { body: payload }),
    /**
     * The public holidays of this municipality's country, as a starting point it copies and then
     * owns. Never a live authority over what gets charged — see `HolidayCatalogEntry`.
     */
    holidays: (): Promise<HolidayCatalogEntry[]> =>
      this.http.request('GET', '/api/v1/admin/parking/holidays'),
    spaces: (query: { zoneId?: string } & PageParams = {}): Promise<PagedResponse<ParkingSpace>> =>
      this.http.request('GET', '/api/v1/admin/parking/spaces', { query }),
    createSpace: (payload: CreateParkingSpaceRequest): Promise<ParkingSpace> =>
      this.http.request('POST', '/api/v1/admin/parking/spaces', { body: payload, idempotent: true }),
    updateSpace: (id: string, payload: UpdateParkingSpaceRequest): Promise<ParkingSpace> =>
      this.http.request('PUT', `/api/v1/admin/parking/spaces/${id}`, { body: payload }),
    /** Read through the adapter: the server wraps the amount, this type is flat (see WireParkingRate). */
    rates: async (query: { zoneId?: string } = {}): Promise<ParkingRate[]> =>
      (
        await this.http.request<WireParkingRate[]>('GET', '/api/v1/admin/parking/rates', { query })
      ).map(toParkingRate),
    /** The request carries `amountMinor` flat; the RESPONSE is a wrapped rate, like every read. */
    setRate: async (payload: SetParkingRateRequest): Promise<ParkingRate> =>
      toParkingRate(
        await this.http.request<WireParkingRate>('PUT', '/api/v1/admin/parking/rates', { body: payload }),
      ),
    /** Prices one exact duration. Setting it twice supersedes it; the earlier window is kept. */
    setRateRung: async (payload: SetRateRungRequest): Promise<ParkingRate> =>
      toParkingRate(
        await this.http.request<WireParkingRate>('PUT', '/api/v1/admin/parking/rates/rungs', { body: payload }),
      ),
    /** Removes a rung: that duration goes back to being priced by the zone's base. */
    clearRateRung: (zoneId: string, minutes: number): Promise<void> =>
      this.http.request('DELETE', '/api/v1/admin/parking/rates/rungs', { query: { zoneId, minutes } }),
  };

  // ---- Platform back-office (CONTRACT.md §4 `/api/v1/platform/**`) ---------------------------
  // Every route here requires PLATFORM_ADMIN/PLATFORM_SUPPORT; the resource server checks
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

  // ---- Enforcement (CONTRACT.md v0.7, ADR 0014) -----------------------------------------------
  // Three audiences, three roots, and no shortcut between them: the officer reads and writes their
  // own citations, the administration reads the municipality's and annuls them, and the citizen
  // reads the ones issued against their own vehicles. The server enforces that separation; these
  // roots exist so no screen is ever one typo away from calling the wrong one.

  readonly inspectorEnforcement = {
    /**
     * Has this plate paid, on this bay, right now?
     *
     * `zoneId` and `spaceCode` travel together or not at all — half a pair is `VALIDATION_FAILED`,
     * by the server's own rule. Without them the verdict can only ever be `NOT_COVERED` or
     * `AMBIGUOUS`: the platform refuses to guess which of several cars carrying a plate is the one
     * in front of the officer, and the client must not paper over that with a hopeful default.
     */
    plateStatus: async (payload: PlateCheckRequest): Promise<PlateStatus> =>
      toPlateStatus(
        await this.http.request<WirePlateStatus>('POST', '/api/v1/inspector/plate-checks', {
          body: payload,
        }),
      ),
    /**
     * The zones this officer covers, with the bay codes each one has (CONTRACT.md v0.28).
     *
     * The endpoint existed on the server from v0.7 and no screen called it, so the app learned zones
     * by mining its own past citations — which left a brand-new device with an empty picker and
     * therefore unable to get anything but `AMBIGUOUS`. This is the fix; the mined directory stays
     * only as the offline cache it always was.
     */
    zones: (): Promise<InspectorZone[]> => this.http.request('GET', '/api/v1/inspector/zones'),
    /** What this municipality fines today. Only the kinds still in force. */
    infractionTypes: async (): Promise<InfractionType[]> =>
      (
        await this.http.request<WireInfractionType[]>('GET', '/api/v1/inspector/enforcement/infraction-types')
      ).map(toInfractionType),
    /**
     * Write a citation.
     *
     * `idempotencyKey` is the caller's, not the transport's, because the offline queue mints it
     * once with the capture and reuses it on every flush. `created` reports whether this call made
     * the act (201) or recognised a resend by `deviceCitationId` and returned the one that already
     * existed (200) — the distinction a queue needs so it never reports two tickets for one.
     */
    create: async (
      payload: CreateCitationRequest,
      idempotencyKey: string,
    ): Promise<CitationCaptureResult> => {
      const { data, status } = await this.http.requestWithStatus<WireCitationDetail>(
        'POST',
        '/api/v1/inspector/citations',
        { body: payload, idempotencyKey },
      );
      return { ...toCitationDetail(data), created: status === 201 };
    },
    /**
     * Close a draft once the photograph its infraction type demands has landed.
     *
     * Takes the caller's key for the same reason `create` does: a queue that retries this step with
     * a fresh key gets `CITATION_INVALID_TRANSITION` on the second try — the citation is already
     * issued — and would report a failure over an operation that had in fact succeeded.
     */
    issue: async (id: string, idempotencyKey?: string): Promise<CitationDetail> =>
      toCitationDetail(
        await this.http.request<WireCitationDetail>('POST', `/api/v1/inspector/citations/${id}/issue`, {
          idempotencyKey,
          idempotent: idempotencyKey === undefined,
        }),
      ),
    /**
     * Attach a photograph. `multipart/form-data`, and the capture time and coordinates travel as
     * text parts beside it — they belong to the photograph, not to the citation.
     */
    attachPhoto: async (
      id: string,
      photo: Blob,
      meta: { fileName?: string; capturedAt?: string; latitude?: number; longitude?: number } = {},
    ): Promise<CitationEvidence> => {
      const form = new FormData();
      form.append('file', photo, meta.fileName ?? 'evidence.jpg');
      if (meta.capturedAt) form.append('capturedAt', meta.capturedAt);
      if (meta.latitude !== undefined) form.append('latitude', String(meta.latitude));
      if (meta.longitude !== undefined) form.append('longitude', String(meta.longitude));
      return toEvidence(
        await this.http.upload<WireEvidence>(`/api/v1/inspector/citations/${id}/evidence`, form),
      );
    },
    /** Attach a written note. Same table as a photograph: legally the same thing. */
    attachNote: async (id: string, note: string): Promise<CitationEvidence> =>
      toEvidence(
        await this.http.request<WireEvidence>('POST', `/api/v1/inspector/citations/${id}/evidence`, {
          body: { note },
        }),
      ),
    /** My citations, newest first. Always paginated: a shift writes many. */
    list: async (params: PageParams = {}): Promise<PagedResponse<Citation>> => {
      const page = await this.http.request<PagedResponse<WireCitation>>('GET', '/api/v1/inspector/citations', {
        query: { page: params.page, size: params.size },
      });
      return { ...page, items: (page.items ?? []).map(toCitation) };
    },
    get: async (id: string): Promise<CitationDetail> =>
      toCitationDetail(await this.http.request<WireCitationDetail>('GET', `/api/v1/inspector/citations/${id}`)),
    /** The bytes of one photograph. Authenticated, so it can never be a bare `<img src>`. */
    evidenceContent: (citationId: string, evidenceId: string): Promise<Blob> =>
      this.http.blob(`/api/v1/inspector/citations/${citationId}/evidence/${evidenceId}`),
  };

  /**
   * Citations raised in another system (v0.34).
   *
   * Mirroring, not a second issuing path: nothing here mints a number, computes a fine or takes
   * money. `push` is idempotent by `(sourceSystem, externalId)` — a repeat is the ordinary case, and
   * `outcome` says which one happened so the caller need not infer it from a status code.
   */
  readonly adminCitationIngest = {
    push: async (payload: CitationIngestRequest): Promise<CitationIngestResult> => {
      const wire = await this.http.request<{
        citation: WireCitation;
        outcome: CitationIngestResult['outcome'];
        discrepancies?: string[] | null;
      }>('POST', '/api/v1/admin/enforcement/ingest/citations', { body: payload });
      return {
        citation: toCitation(wire.citation),
        outcome: wire.outcome,
        discrepancies: wire.discrepancies ?? [],
      };
    },
    /** Foreign causals that have arrived and nobody mapped yet, busiest first. */
    unmappedCausals: (limit = 50): Promise<UnmappedCausal[]> =>
      this.http.request('GET', '/api/v1/admin/enforcement/ingest/unmapped-causals', { query: { limit } }),
    mappings: (): Promise<ExternalInfractionMapping[]> =>
      this.http.request('GET', '/api/v1/admin/enforcement/ingest/mappings'),
    /**
     * Points a foreign causal at one of ours and relinks the citations already here.
     *
     * Bounded per call: `more` true means the batch filled up and there are others waiting, so the
     * caller repeats. That is also what makes it safe to retry after a timeout.
     */
    map: (payload: MapCausalRequest): Promise<MapCausalResult> =>
      this.http.request('PUT', '/api/v1/admin/enforcement/ingest/mappings', { body: payload }),
  };

  readonly adminEnforcement = {
    citations: async (query: AdminCitationsQuery & PageParams = {}): Promise<PagedResponse<Citation>> => {
      const page = await this.http.request<PagedResponse<WireCitation>>(
        'GET',
        '/api/v1/admin/enforcement/citations',
        {
          query: {
            status: query.status,
            zoneId: query.zoneId,
            inspectorUserId: query.inspectorUserId,
            plate: query.plate,
            from: query.from,
            to: query.to,
            page: query.page,
            size: query.size,
          },
        },
      );
      return { ...page, items: (page.items ?? []).map(toCitation) };
    },
    get: async (id: string): Promise<CitationDetail> =>
      toCitationDetail(
        await this.http.request<WireCitationDetail>('GET', `/api/v1/admin/enforcement/citations/${id}`),
      ),
    /**
     * Annul a citation, with a reason. The only way an issued citation stops standing: there is no
     * PUT and no DELETE on a citation anywhere in this API, and there should never be one.
     */
    cancel: async (id: string, payload: CitationReasonRequest): Promise<CitationDetail> =>
      toCitationDetail(
        await this.http.request<WireCitationDetail>('POST', `/api/v1/admin/enforcement/citations/${id}/cancel`, {
          body: payload,
          idempotent: true,
        }),
      ),
    evidenceContent: (citationId: string, evidenceId: string): Promise<Blob> =>
      this.http.blob(`/api/v1/admin/enforcement/citations/${citationId}/evidence/${evidenceId}`),
    /**
     * The moderation queue: defences waiting for a decision, oldest first.
     *
     * <p>Oldest first is the server's order and it matters — a queue sorted newest-first is one
     * where the oldest case is never reached.</p>
     */
    appeals: async (query: { status?: AppealStatus | 'ALL' } & PageParams = {}): Promise<PagedResponse<CitationAppeal>> => {
      const page = await this.http.request<PagedResponse<WireAppeal>>('GET', '/api/v1/admin/enforcement/appeals', {
        query: { status: query.status, page: query.page, size: query.size },
      });
      return { ...page, items: (page.items ?? []).map(toAppeal) };
    },
    /** Accept and the citation is void; reject and it stands. The reason is mandatory either way. */
    resolveAppeal: async (citationId: string, payload: ResolveAppealRequest): Promise<CitationDetail> =>
      toCitationDetail(
        await this.http.request<WireCitationDetail>(
          'POST',
          `/api/v1/admin/enforcement/citations/${citationId}/appeal/resolve`,
          { body: payload, idempotent: true },
        ),
      ),
    appealEvidenceContent: (citationId: string, evidenceId: string): Promise<Blob> =>
      this.http.blob(`/api/v1/admin/enforcement/citations/${citationId}/evidence/${evidenceId}`),
    /** The notice in force, falling back to the country default a municipality has not replaced. */
    appealNotice: (locale?: string): Promise<AppealNotice> =>
      this.http.request('GET', '/api/v1/admin/enforcement/appeal-notice', { query: { locale } }),
    appealNoticeVersions: (locale?: string): Promise<AppealNotice[]> =>
      this.http.request('GET', '/api/v1/admin/enforcement/appeal-notice/versions', { query: { locale } }),
    /** Publishes a new version. It inserts, never edits: past defences point at the text they read. */
    publishAppealNotice: (payload: PublishAppealNoticeRequest): Promise<AppealNotice> =>
      this.http.request('PUT', '/api/v1/admin/enforcement/appeal-notice', { body: payload }),
    /** The whole catalogue, retired kinds included — the administrator edits what exists, not what is live. */
    infractionTypes: async (): Promise<InfractionType[]> =>
      (
        await this.http.request<WireInfractionType[]>('GET', '/api/v1/admin/enforcement/infraction-types')
      ).map(toInfractionType),
    /**
     * Replace the catalogue in one call — that is what the screen edits: a table with rows added,
     * changed and removed, saved once. A row left out is deactivated, never deleted, because
     * citations years old reference it.
     */
    updateInfractionTypes: async (drafts: InfractionTypeDraft[]): Promise<InfractionType[]> =>
      (
        await this.http.request<WireInfractionType[]>('PUT', '/api/v1/admin/enforcement/infraction-types', {
          body: { infractionTypes: drafts },
        })
      ).map(toInfractionType),
  };

  readonly citizenFines = {
    /** Citations against my own vehicles, matched by vehicle and never by plate (see the server's own note). */
    list: async (query: { status?: CitationStatus } & PageParams = {}): Promise<PagedResponse<Fine>> => {
      const page = await this.http.request<PagedResponse<WireFine>>('GET', '/api/v1/citizen/fines', {
        query: { status: query.status, page: query.page, size: query.size },
      });
      return { ...page, items: (page.items ?? []).map(toFine) };
    },
    get: async (id: string): Promise<FineDetail> =>
      toFineDetail(await this.http.request<WireFineDetail>('GET', `/api/v1/citizen/fines/${id}`)),
    evidenceContent: (fineId: string, evidenceId: string): Promise<Blob> =>
      this.http.blob(`/api/v1/citizen/fines/${fineId}/evidence/${evidenceId}`),
    /**
     * The legal notice to read before writing a defence, resolved for my own locale.
     *
     * Never cached — not by the server and not here: a municipality whose lawyer corrects the
     * wording must not have citizens accepting yesterday's text. `id` is sent back on filing and
     * the server refuses anything but the version in force, which is what turns "we warned them"
     * from a claim into a record.
     */
    appealNotice: (): Promise<AppealNotice> =>
      this.http.request('GET', '/api/v1/citizen/fines/appeal-notice'),
    /**
     * Files the defence: the text and the id of the notice that was on screen.
     *
     * Text first and images afterwards on their own call, because what makes the defence exist is
     * what the person wrote — losing it to a failed upload on a bad connection would be losing the
     * case, not the photograph.
     */
    fileAppeal: async (fineId: string, payload: FileAppealRequest): Promise<CitationAppeal> =>
      toAppeal(
        await this.http.request<WireAppeal>('POST', `/api/v1/citizen/fines/${fineId}/appeals`, {
          body: payload,
          idempotent: true,
        }),
      ),
    /** My defence and where it stands, including the municipality's reason once it is decided. */
    appeal: async (fineId: string): Promise<CitationAppeal> =>
      toAppeal(await this.http.request<WireAppeal>('GET', `/api/v1/citizen/fines/${fineId}/appeal`)),
    /**
     * Attaches one photograph to my defence. The app compresses before sending; the limit that
     * counts is the server's (1 MB, type read from the file's own header, count per municipality).
     */
    attachAppealImage: async (fineId: string, photo: Blob, fileName?: string): Promise<CitationEvidence> => {
      const form = new FormData();
      form.append('file', photo, fileName ?? 'appeal.jpg');
      return toEvidence(await this.http.upload<WireEvidence>(`/api/v1/citizen/fines/${fineId}/appeal/images`, form));
    },
    // Paying a fine online is declared and not implemented: the server answers 501 NOT_IMPLEMENTED
    // on `POST /citizen/fines/{id}/payments` so a client can tell "not built yet" from "wrong URL".
    // No method is exposed here, deliberately — a call that can only fail is worse than none, and
    // the screen states the situation instead of offering a button that pretends.
  };

  readonly platformSystem = {
    // TODO(extension): scope of what's controlled here is defined later (CONTRACT.md §4) — health/flags/jobs
    // are read-only placeholders today; billing, plans and usage limits arrive as new resources, not changes to these.
    health: (): Promise<SystemHealth> => this.http.request('GET', '/api/v1/platform/system/health'),
    featureFlags: (): Promise<FeatureFlag[]> => this.http.request('GET', '/api/v1/platform/system/feature-flags'),
    jobs: (): Promise<SystemJob[]> => this.http.request('GET', '/api/v1/platform/system/jobs'),
  };
}
