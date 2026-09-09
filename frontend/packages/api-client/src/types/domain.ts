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
  /**
   * Stable translation key (`country.CR`), not a rendered name: the catalog is shared by every
   * locale, so the country's name is resolved by the client's dictionary (CONTRACT.md §5/§7 —
   * user-facing text is never stored rendered).
   */
  nameKey: string;
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

/**
 * A municipality, carrying enough of itself to be *drawn* and not only identified
 * (CONTRACT.md v0.4 "Identidad visual de la municipalidad").
 *
 * The three branding fields are nullable on purpose and their absence is a normal state, never an
 * error: a municipality created five minutes ago has no emblem yet. `logoUrl` arrives already
 * resolved by the server from the stored `logo_asset_key`, so no client ever decides where a logo
 * lives; when it is null the client draws a monogram over `brandColor`.
 */
export interface TenantCatalogEntry {
  id: string;
  slug: string;
  name: string;
  countryCode: string;
  /** What fits in a top bar when the full name does not ("San José" for "Municipalidad de San José"). */
  shortName?: string | null;
  /** Ready to render. Relative server paths are made absolute against the API base URL by ApiClient. */
  logoUrl?: string | null;
  /** `#rrggbb`, lowercase. Accents the UI; it never replaces the `--lx-*` design tokens. */
  brandColor?: string | null;
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

/**
 * `PUT /{portal}/me` — every personal field of CONTRACT.md §2, in the same order (v0.3
 * §"Perfil editable"). No `email` and no `password`: both change the credentials you sign in with
 * and each has its own flow, `POST /me/email` (with verification) and `POST /me/password`.
 */
export interface UpdateProfileRequest {
  givenName: string;
  familyName: string;
  secondFamilyName?: string;
  identityDocument: IdentityDocumentInput;
  address: AddressInput;
  phone: PhoneInput;
  nationalityCode: string;
  birthDate: string; // ISO-8601 YYYY-MM-DD
  locale: string;
  timeZone: string;
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
  /**
   * The municipality's branding, travelling with the list rather than per municipality
   * (CONTRACT.md v0.4): the picker is a grid of icons, and a client that had to fetch each
   * municipality separately to find its logo would get slower the more the platform serves.
   */
  tenantShortName?: string | null;
  tenantLogoUrl?: string | null;
  tenantBrandColor?: string | null;
  portal: Portal;
  role: Role;
  status: MembershipStatus;
}

export interface MeResponse {
  user: UserProfile;
  memberships: MembershipSummary[];
  /**
   * The municipality this session is currently scoped to, or null/absent when none has been chosen.
   * The server omits the key entirely rather than sending null, so this is optional as well as
   * nullable — never narrow it to a required field.
   */
  activeTenant?: TenantCatalogEntry | null;
}

export interface SessionTenantRequest {
  tenantId: string;
}

/**
 * `POST /{portal}/session/tenant` (CONTRACT.md v0.4). The new token pair AND the branding of the
 * municipality it is scoped to, so the badge next to the LuParX logo can repaint from the same
 * answer that changed the session, with no second request in between.
 */
export interface SwitchTenantResponse {
  tokens: TokenPair;
  activeTenant: TenantCatalogEntry | null;
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

// ---- Citizen: vehicles (CONTRACT.md "v0.2 — Dominio de parqueo", §"Vehículos") -----------------
// Uniqueness is `(user_id, plate normalized)` — plates repeat across users, never within one
// user's own list (CONTRACT.md v0.2 rule 2). Only `plate` is required.

/**
 * One entry of a server-owned enumeration (`GET /catalog/vehicle-types`, `/catalog/vehicle-colors`).
 *
 * `value` is the stable key that travels on the wire and is stored; `labelKey` is what the client
 * translates. The client never keeps its own list of types or colours: adding "cuadraciclo" or
 * "verde oliva" is a server change, and a client that hardcoded the list would silently drop it.
 */
export interface VehicleAttributeCatalogEntry {
  value: string;
  labelKey: string;
}

export interface Vehicle {
  id: string;
  /** Normalized: uppercase, no spaces or dashes (CONTRACT.md v0.2 §"Vehículos"). */
  plate: string;
  name?: string;
  brand?: string;
  model?: string;
  year?: number;
  /**
   * Catalog key from `GET /catalog/vehicle-types` — mandatory server-side, `CAR` by default. Typed
   * as a plain string, not a union: the catalog is data the server may grow at any time.
   */
  type: string;
  /** Catalog key from `GET /catalog/vehicle-colors`. Optional: not every owner cares to say. */
  color?: string;
  isOwner: boolean;
  isPrimary: boolean;
}

export interface CreateVehicleRequest {
  /** Sent normalized (uppercase, no spaces/dashes); the server is expected to enforce the same normalization. */
  plate: string;
  name?: string;
  brand?: string;
  model?: string;
  year?: number;
  /** Catalog key; required by the server, which defaults it to `CAR` when omitted. */
  type: string;
  color?: string;
  isOwner: boolean;
}

export type UpdateVehicleRequest = CreateVehicleRequest;

// ---- Citizen: parking domain (CONTRACT.md "v0.2 — Dominio de parqueo") -------------------------

/** One row per tenant (`parking_policies`, CONTRACT.md v0.2). Every option a citizen screen offers comes from here — never a fixed constant in code. */
export interface ParkingPolicy {
  sessionIncrementsMinutes: number[];
  sessionMinMinutes: number;
  sessionMaxMinutes: number;
  extensionEnabled: boolean;
  extensionIncrementsMinutes: number[];
  extensionMaxTotalMinutes: number;
  earlyFinishEnabled: boolean;
  creditOnEarlyFinishEnabled: boolean;
  creditMinRemainingMinutes: number;
  creditExpiryDays: number;
  graceMinutes: number;
}

export interface ParkingQuoteRequest {
  zoneId: string;
  minutes: number;
}

/**
 * A quote is entirely the server's arithmetic (CONTRACT.md v0.2 §Invariantes); the client only
 * displays it. `chargeableMinutes` is what the municipality's charging schedule (CONTRACT.md v0.3
 * §"Horario de cobro") actually bills out of `minutes` — a stay from 17:30 to 19:00 against a
 * band that closes at 18:00 pays half an hour, so whenever the two differ the screen has to say so.
 * `payableMinor` is what really leaves the wallet after the citizen's minute credit is applied;
 * it is not `amountMinor` minus a converted credit, the remaining minutes are priced on their own.
 */
export interface ParkingQuoteResponse {
  /** Minutes the citizen asked for. */
  minutes: number;
  /** Of those, the ones that fall inside a charging band. Equal to `minutes` when charging is continuous. */
  chargeableMinutes: number;
  amountMinor: number;
  currencyCode: string;
  /** Minutes of the citizen's time-credit balance the server applied to this quote. */
  creditMinutesApplied: number;
  /** Chargeable minutes left after the credit was applied — what `payableMinor` prices. */
  payableMinutes: number;
  /** What remains to be paid from the wallet after `creditMinutesApplied` is subtracted. */
  payableMinor: number;
}

export type ParkingSessionStatus = 'ACTIVE' | 'FINISHED' | 'EXPIRED';

export interface ParkingSession {
  id: string;
  zoneId: string;
  zoneName: string;
  spaceId: string;
  spaceCode: string;
  vehicleId: string;
  /** Copy of the plate at the moment the session started (CONTRACT.md v0.2 rule 2) — verified against this, never the vehicle's possibly-since-edited plate. */
  plateSnapshot: string;
  /** Total booked time, session plus every extension. */
  minutes: number;
  /** Time left before it expires, as the server counted it. */
  remainingMinutes: number;
  amountMinor: number;
  currencyCode: string;
  /** Minutes of time credit this session consumed. */
  creditMinutesApplied: number;
  status: ParkingSessionStatus;
  startedAt: string;
  expiresAt: string;
  endedAt: string | null;
}

export interface StartParkingSessionRequest {
  zoneId: string;
  spaceCode: string;
  vehicleId: string;
  minutes: number;
}

export type ParkingSessionsQuery = {
  status?: ParkingSessionStatus | 'ALL';
};

export interface ExtendParkingSessionRequest {
  minutes: number;
}

/**
 * One entry of `GET /citizen/parking/sessions/{id}/extension-options`: a duration this
 * municipality sells as an extension, already priced, with the expiry it would produce.
 *
 * <p>The whole list arrives in one request, which is the point of the endpoint — a dialog that
 * quoted each option separately would draw one list out of several answers given at several
 * instants, and the total under it would belong to none of them.</p>
 *
 * <p>An option the citizen may not take is present with `allowed: false` and the server's own
 * `unavailableReason` (`EXTENSION_EXCEEDS_MAX`, `INSUFFICIENT_BALANCE`, …) rather than dropped:
 * a list that quietly loses its last option teaches nobody why.</p>
 */
export interface ParkingExtensionOption {
  minutes: number;
  /** Of those, the ones inside a charging band — smaller when the extension runs past closing. */
  chargeableMinutes: number;
  amountMinor: number;
  currencyCode: string;
  creditMinutesApplied: number;
  payableMinutes: number;
  /** What would actually leave the wallet. This is the number the dialog shows. */
  payableMinor: number;
  newExpiresAt: string;
  allowed: boolean;
  unavailableReason: string | null;
}

/**
 * A parking zone as the citizen picks it. The tariff lives on the zone, so the zone plus the
 * duration is all a quote needs.
 */
export interface ParkingZone {
  id: string;
  code: string;
  name: string;
  description?: string;
  /**
   * The bay codes this zone actually contains, summarised by the server so the citizen's field can
   * say "espacios 0001–0050 en esta zona" instead of letting them guess and be refused at submit.
   *
   * Absent while a zone has no published bays — and absent altogether from servers older than the
   * change that added it, which is why every reader treats it as optional rather than assuming the
   * range exists.
   */
  spaceCodes?: ParkingZoneSpaceCodes;
}

/** Summary of one zone's bay codes: the lowest, the highest, and how many there are. */
export interface ParkingZoneSpaceCodes {
  first: string;
  last: string;
  count: number;
}

/**
 * The municipality's charging schedule (CONTRACT.md v0.3 §"Horario de cobro"), evaluated by the
 * server in `timeZone` — the municipality's, never the device's. `chargingNow` and
 * `nextChargingStartsAt` are what let the parking flow say "ahora no se cobra; el cobro se
 * reanuda el lunes a las 7:00" instead of failing at the last step.
 */
export interface ParkingSchedule {
  timeZone: string;
  chargesAllDay: boolean;
  week: ChargingDay[];
  exceptions: ChargingException[];
  chargingNow: boolean;
  nextChargingStartsAt: string | null;
  updatedAt?: string;
}

export type Weekday = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

/** A day with no bands is a day the municipality does not charge (by default, Sunday). */
export interface ChargingDay {
  weekday: Weekday;
  bands: ChargingBand[];
}

/** Minutes from midnight, plus the same instant pre-formatted as `HH:mm` for display and editing. */
export interface ChargingBand {
  startMinute: number;
  endMinute: number;
  startsAt: string;
  endsAt: string;
}

/** A dated override — a public holiday that suspends charging, or one with its own hours. */
export interface ChargingException {
  date: string;
  charges: boolean;
  chargesAllDay: boolean;
  label?: string;
  bands: ChargingBand[];
}

export interface UpdateParkingScheduleRequest {
  chargesAllDay: boolean;
  week: ChargingDay[];
  exceptions: ChargingException[];
}

/**
 * The shape of a bay code in this municipality (CONTRACT.md v0.3 §"Formato del código de
 * espacio"). `pattern` is the effective regex the server validates against and `example` is what
 * the citizen's field shows as a placeholder — both server-owned, never rebuilt client-side.
 */
export interface ParkingSpaceFormat {
  prefix: string;
  digits: number;
  allowLetters: boolean;
  pattern: string;
  example: string;
  updatedAt?: string;
}

export interface UpdateParkingSpaceFormatRequest {
  prefix: string;
  digits: number;
  allowLetters: boolean;
}

// ---- Locales per municipality (CONTRACT.md v0.3 §"Idiomas por municipalidad") ------------------
// The municipal administrator enables the list and picks the default; every portal renders it as a
// dropdown. Resolution stays deterministic: user preference → enabled by the tenant → tenant
// default → platform default.

/** One entry of the public list (`GET /catalog/tenants/{id}/locales`): only enabled locales appear. */
export interface TenantLocale {
  /** BCP 47 tag, e.g. `es-CR`. */
  locale: string;
  isDefault: boolean;
  sortOrder: number;
}

/** The admin view (`GET /admin/settings/locales`): disabled locales included, so they can be turned back on. */
export interface TenantLocaleSetting extends TenantLocale {
  enabled: boolean;
}

export interface TenantLocaleSettings {
  locales: TenantLocaleSetting[];
  platformDefaultLocale: string;
}

export interface UpdateTenantLocalesRequest {
  locales: TenantLocaleSetting[];
}

// ---- Account (CONTRACT.md v0.3 §"Perfil editable") ---------------------------------------------

/** `POST /{portal}/me/password`: revokes every other session and bumps `credentials_version`. */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** `POST /{portal}/me/email`: the new address must be verified before it replaces the current one. */
export interface ChangeEmailRequest {
  newEmail: string;
}


// ---- Citizen: wallet & time credits (CONTRACT.md v0.2) -----------------------------------------
// Both scoped to the active tenant — "las finanzas son por tenant; no hay un saldo global"
// (CONTRACT.md v0.2 rule 6). The server derives the tenant from the access token (`tid` claim);
// neither call takes a tenant parameter.

/** The server's own ledger vocabulary (`module-parking` WalletTransactionType) — never widened or renamed here. */
export type WalletTransactionType = 'TOP_UP' | 'SESSION_CHARGE' | 'EXTENSION_CHARGE' | 'ADJUSTMENT';

/** One movement of the tenant wallet, already flattened out of the server's `MoneyDto` pairs. */
export interface WalletTransaction {
  id: string;
  type: WalletTransactionType;
  /** Signed: negative when money left the wallet. */
  amountMinor: number;
  currencyCode: string;
  balanceAfterMinor: number;
  reference: string | null;
  createdAt: string;
}

export interface WalletResponse {
  balanceMinor: number;
  currencyCode: string;
  /** First page of movements, newest first — the wallet endpoint returns them alongside the balance. */
  transactions: WalletTransaction[];
}

/** Minutes saved from an early finish (CONTRACT.md v0.2 rule 5) — consumed first on this tenant's next session, never money, never portable to another tenant. */
export interface TimeCreditsResponse {
  minutes: number;
  /** Earliest expiry among the lots that still have minutes left; `null` when nothing expires. */
  expiresAt: string | null;
}
