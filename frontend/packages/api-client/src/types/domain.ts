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
  | 'PLATFORM_MANAGE'
  // Enforcement (CONTRACT.md v0.7 / ADR 0014). Four capabilities and not one, because issuing an
  // act, reading it, annulling it and configuring what may be fined are held by different people.
  | 'CITATION_ISSUE'
  | 'CITATION_READ'
  | 'CITATION_VOID'
  | 'ENFORCEMENT_MANAGE';

export type MembershipStatus = 'ACTIVE' | 'PENDING_APPROVAL' | 'REJECTED' | 'REVOKED' | 'SUSPENDED';

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
  /**
   * The one type a resident of that country carries, pre-selected when the form opens
   * (CONTRACT.md v0.9). At most one per country, enforced by a partial unique index in the
   * database rather than by whoever writes the seed. Absent means "no opinion": the form then
   * asks instead of guessing.
   */
  default?: boolean;
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

/**
 * `POST /auth/{portal}/login`. The three fields are always present since v0.20: there is no second
 * factor, so a successful login is a session and never a challenge to answer first.
 */
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
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
  /** When this account was last signed into, and through which portal (CONTRACT.md v0.15). */
  lastLoginAt?: string | null;
  lastLoginPortal?: string | null;
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
  /** Why the post is suspended or revoked, when somebody gave a reason (CONTRACT.md v0.15). */
  statusReason?: string | null;
  suspendedAt?: string | null;
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
  blockedReason?: string;
}

export type AdminUsersQuery = {
  q?: string;
  portal?: Portal;
  role?: Role;
  status?: UserStatus;
  tenantId?: string;
};

/**
 * `POST /admin/users` — a member of staff of the active municipality, created by an administrator
 * (CONTRACT.md v0.14).
 *
 * Every §2 field is here because the account is a real person's and the contract asks for all of
 * them; the administrator is entering what the employment file already says, not what the platform
 * guessed. There is deliberately **no password**: the person receives a link and sets their own, so
 * nobody can sign in as them and write fines in their name.
 *
 * `role` is what decides the portal, and only the roles a municipal administrator may grant are
 * accepted — inspectors, finance and support, never another administrator.
 */
export interface CreateAdminUserRequest {
  email: string;
  givenName: string;
  familyName: string;
  secondFamilyName?: string;
  identityDocument: IdentityDocumentInput;
  address: AddressInput;
  phone: PhoneInput;
  nationalityCode: string;
  birthDate: string;
  locale?: string;
  timeZone?: string;
  portal: Portal;
  role: Role;
}

/**
 * `POST /admin/users/lookup` — find one person who is already registered, to give them a post
 * instead of opening a second account for them (CONTRACT.md v0.26).
 *
 * Exactly one of the two criteria: it is an exact match, not a search. A POST rather than a query
 * string because an email address and an identity number are personal data and query strings end up
 * in logs.
 */
export interface LookupPersonRequest {
  email?: string;
  identityDocument?: IdentityDocumentInput;
}

export interface LookupPersonResponse {
  found: boolean;
  person: PersonMatch | null;
}

/**
 * Just enough to be sure it is the right person.
 *
 * The email arrives masked (`ja***@gmail.com`), and `accessHere` lists only what this person holds
 * **in this municipality** — what they do for any other council is not part of the answer.
 */
export interface PersonMatch {
  userId: string;
  fullName: string | null;
  maskedEmail: string;
  accountStatus: UserStatus | null;
  accessHere: PersonAccess[];
}

export interface PersonAccess {
  portal: Portal;
  role: Role;
  status: MembershipStatus;
}

/** The roles a municipal administrator may grant inside their own municipality (CONTRACT.md v0.14). */
export const TENANT_GRANTABLE_ROLES: readonly Role[] = [
  'INSPECTOR',
  'INSPECTOR_LEAD',
  'TENANT_FINANCE',
  'TENANT_SUPPORT',
];

/**
 * One member of staff as the administration panel reads them (CONTRACT.md v0.15).
 *
 * The unit is the post, not the person: the same person can hold two, and each answers the same
 * four questions — who, what may they do, where, and are they still around.
 */
export interface StaffMember {
  membershipId: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  portal: Portal;
  role: Role;
  status: MembershipStatus;
  statusReason?: string | null;
  suspendedAt?: string | null;
  revokedAt?: string | null;
  /** Empty means every zone of this municipality, never none (CONTRACT.md v0.15). */
  zones: ZoneAssignment[];
  /**
   * When THIS post was last used (CONTRACT.md v0.27). Null means no recorded use since the platform
   * began measuring it per post — which is not "never", and the panel must not say "never".
   */
  lastUsedAt?: string | null;
  /**
   * When the PERSON last signed in anywhere, and through which app. A different question: since
   * v0.26 somebody may be signing in daily through a post that is not this one.
   */
  lastLoginAt?: string | null;
  lastLoginPortal?: string | null;
  accountStatus: UserStatus | null;
}

// ---- Staff invitations (CONTRACT.md v0.27) ----------------------------------------------------

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED';

/**
 * A post offered to an address that has no account yet.
 *
 * Two fields are all the municipality supplies. Everything else about the person is theirs to enter:
 * they are the only one who knows how to spell it, and an identity document is unique platform-wide,
 * so a typo is not a formatting slip but the wrong identity.
 */
export interface CreateStaffInvitationRequest {
  email: string;
  role: Role;
}

export interface StaffInvitation {
  id: string;
  email: string;
  portal: Portal;
  role: Role;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
  /** Computed by the server: PENDING and past its deadline. Never a stored status. */
  expired: boolean;
  acceptedAt?: string | null;
  revokedAt?: string | null;
}

/** What the invited person is shown before typing anything. No authentication behind this. */
export interface InvitationPreview {
  tenantName: string;
  email: string;
  portal: Portal;
  role: Role;
  expiresAt: string;
}

/**
 * The invited person's own registration: CONTRACT.md §2 in full, plus a password they choose.
 *
 * There is deliberately **no email field** — the address is the invited one. A body that could carry
 * an address would turn an invitation into a way to open an account on somebody else's mailbox.
 */
export interface AcceptInvitationRequest {
  givenName: string;
  familyName: string;
  secondFamilyName?: string;
  identityDocument: IdentityDocumentInput;
  address: AddressInput;
  phone: PhoneInput;
  nationalityCode: string;
  birthDate: string;
  password: string;
  locale?: string;
  timeZone?: string;
}

export interface AcceptInvitationResponse {
  userId: string;
  portal: Portal;
  role: Role;
  tenantName: string;
}

export interface ZoneAssignment {
  zoneId: string;
  code: string;
  name: string;
}

export interface SuspendMembershipRequest {
  reason?: string;
}

/** The whole assignment, replaced. An empty list clears every restriction. */
export interface AssignZonesRequest {
  zoneIds: string[];
}

export interface BlockUserRequest {
  reason: string;
}

export interface CreateMembershipRequest {
  userId: string;
  /**
   * Optional, and best omitted. The municipality is the session's active one, taken from the token;
   * sending a different id is refused with `CROSS_TENANT_ACCESS_DENIED`, so the field can only ever
   * agree with the server or be rejected by it.
   */
  tenantId?: string;
  portal: Portal;
  role: Role;
}

/**
 * `PUT /admin/memberships/{id}` — change the role of a post that already exists, or its status.
 *
 * Both optional and only what is sent is applied. A role can only change **within the same app**:
 * a role belongs to one portal, so moving somebody from the municipal portal to the enforcement app
 * is a second post, not an edit of this one.
 */
export interface UpdateMembershipRequest {
  role?: Role;
  status?: MembershipStatus;
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

// ---- Platform back-office (CONTRACT.md §4 `/api/v1/platform/**`, PLATFORM_ADMIN/PLATFORM_SUPPORT) ------

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
  /**
   * Minutes of courtesy at the start of a stay (v0.31); 0 means none.
   *
   * Granted **once per plate per calendar day**, so a screen must say "the first N minutes are free,
   * once a day" and never promise them on every stay. Whether a particular car still has its
   * courtesy is answered by the quote, which is the only call that knows the plate. A zone may
   * depart from this number — read `ParkingZone.freeMinutes` for the one that applies where the
   * citizen is parking.
   */
  freeMinutes?: number;
}

export interface ParkingQuoteRequest {
  zoneId: string;
  minutes: number;
  /**
   * Which car it is for. Optional, and it only ever makes the answer cheaper: courtesy is limited
   * per plate, so without it the server cannot tell whether this stay would be free and answers with
   * the price. Give one or the other — a registered vehicle of the caller's, or a plate typed for
   * somebody else's car.
   */
  vehicleId?: string;
  plate?: string;
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
  /**
   * The citizen's registered vehicle, or `null` when they parked somebody else's car by typing its
   * plate (CONTRACT.md v0.11). `plateSnapshot` and `vehicleType` are filled in either case, so a
   * screen that only shows the car never has to branch on this.
   */
  vehicleId: string | null;
  /** Copy of the plate at the moment the session started (CONTRACT.md v0.2 rule 2) — verified against this, never the vehicle's possibly-since-edited plate. */
  plateSnapshot: string;
  /**
   * Copy of the kind of vehicle, for the same reason as the plate. Catalog key from
   * `GET /catalog/vehicle-types`, typed as a plain string like `Vehicle.type`.
   */
  vehicleType: string;
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

/**
 * Exactly one of `vehicleId` and `plate` is sent: a vehicle of the citizen's, or somebody else's
 * car typed on the spot (CONTRACT.md v0.11). A typed plate is saved nowhere but on the stay, and
 * carries its own `vehicleType` because there is no vehicle record to read it from.
 */
export type StartParkingSessionRequest = {
  zoneId: string;
  spaceCode: string;
  minutes: number;
} & (
  | { vehicleId: string; plate?: never; vehicleType?: never }
  | { vehicleId?: never; plate: string; vehicleType: string }
);

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
  /**
   * What each duration this municipality sells costs in this zone (CONTRACT.md v0.24).
   *
   * Priced by the server, one entry per duration, and rendered verbatim: a client that computed
   * "30 minutes is twice 15" would be wrong in every municipality with a non-linear ladder — which
   * is most of them, and is the reason the ladder exists. Absent from servers older than v0.24.
   */
  durations?: ParkingDurationPrice[];
  /**
   * The durations sold **in this zone** (v0.31). Since a zone may depart from its municipality, a
   * client must offer these and not the list from `GET /policy`, or it will show a citizen a
   * duration the start refuses. Absent from servers older than v0.31.
   */
  sessionIncrementsMinutes?: number[];
  sessionMinMinutes?: number;
  /** The longest a car may hold a bay here: two hours downtown, more on the edges. */
  sessionMaxMinutes?: number;
  /** Courtesy minutes in this zone; 0 means none. Once per plate per day — see `ParkingPolicy`. */
  freeMinutes?: number;
}

/** One entry of the citizen's duration picker: how long, and what it costs here. */
export interface ParkingDurationPrice {
  minutes: number;
  amountMinor: number;
  currencyCode: string;
}

/**
 * A zone as the municipal administrator sees it (CONTRACT.md v0.16) — including the deactivated
 * ones, which the citizen listing never shows.
 *
 * `spaceCount` is why this is a different shape from the citizen's: an operator's first question
 * about a sector is how many bays are in it, and a citizen's is what it costs.
 */
export interface AdminParkingZone {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  divisionId?: string | null;
  active: boolean;
  spaceCount: number;
}

/** `PUT /admin/parking/policy` — the whole policy, replaced as one form (CONTRACT.md v0.16). */
export interface UpdateParkingPolicyRequest {
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
  /** Absent keeps whatever the municipality has, which for most of them is 0. */
  freeMinutes?: number;
}

export interface CreateParkingZoneRequest {
  /** The zone's identity for every report and every bay in it. Not editable afterwards. */
  code: string;
  name: string;
  description?: string;
  divisionId?: string;
}

export interface UpdateParkingZoneRequest {
  name: string;
  description?: string;
  divisionId?: string;
  active: boolean;
}

/** A bay is never deleted: one that is dug up goes `OUT_OF_SERVICE` and keeps its history readable. */
export type ParkingSpaceStatus = 'AVAILABLE' | 'OUT_OF_SERVICE';

export interface ParkingSpace {
  id: string;
  zoneId: string;
  code: string;
  status: ParkingSpaceStatus;
}

export interface CreateParkingSpaceRequest {
  zoneId: string;
  code: string;
}

/**
 * Only the fields sent are applied.
 *
 * `code` corrects the number painted on the bay (CONTRACT.md v0.25). It changes the bay from today
 * onwards and nothing that already happened on it: every stay and every citation keeps the code it
 * was issued with, so a receipt from last year still names the bay the citizen parked in.
 */
export interface UpdateParkingSpaceRequest {
  status?: ParkingSpaceStatus;
  zoneId?: string;
  code?: string;
}

/**
 * One tariff window of a zone. A window with `validTo` set is history and is never edited: setting a
 * new tariff closes the open one and opens another, so a stay is always priced by what was in force
 * when it started.
 */
/**
 * What a zone charges over one validity window (CONTRACT.md v0.24).
 *
 * `BLOCK` is the zone's linear base: `amountMinor` covers `minutes` minutes and is charged per
 * started block. It is mandatory, and it prices every duration the ladder does not name — including
 * a citizen spending exactly the minutes they had saved, which is an arbitrary number.
 *
 * `EXACT` is one rung of the ladder: `amountMinor` **is** the price of a stay of exactly `minutes`
 * minutes, never multiplied. An exact rung always wins over the base, because a price stated for
 * that duration is more specific than a formula that can also produce a number for it.
 */
export type RateKind = 'BLOCK' | 'EXACT';

export interface ParkingRate {
  id: string;
  zoneId: string;
  kind: RateKind;
  amountMinor: number;
  currencyCode: string;
  minutes: number;
  validFrom: string;
  validTo: string | null;
}

/** `PUT /admin/parking/rates/rungs` — prices one exact duration. */
export interface SetRateRungRequest {
  zoneId: string;
  amountMinor: number;
  minutes: number;
}

export interface SetParkingRateRequest {
  zoneId: string;
  amountMinor: number;
  minutes: number;
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

/**
 * How an exception decides which day it falls on (v0.31).
 *
 * `ONCE` is one concrete date, and it is what every exception written before v0.31 means. `ANNUAL`
 * is a day of the year, every year — so a municipality writes its holidays once instead of every
 * December. `EASTER` is a number of days from Easter Sunday, which is the only way to describe
 * Maundy Thursday and Good Friday: they move.
 */
export type ExceptionRecurrence = 'ONCE' | 'ANNUAL' | 'EASTER';

/**
 * When a holiday is taken, given the day it falls on. `MONDAY` moves it to the following Monday,
 * which is what Costa Rican law does with several of them; a holiday already on a Monday stays put.
 */
export type HolidayObservance = 'EXACT' | 'MONDAY';

/** An override of the weekly timetable — a holiday that suspends charging, or a day with its own hours. */
export interface ChargingException {
  /** Only for `ONCE`. The other two compute their date for whatever year is being asked about. */
  date?: string | null;
  charges: boolean;
  chargesAllDay: boolean;
  label?: string;
  bands: ChargingBand[];
  /** Absent is read as `ONCE`, which is what a client older than v0.31 means. */
  recurrence?: ExceptionRecurrence;
  month?: number | null;
  day?: number | null;
  easterOffsetDays?: number | null;
  observance?: HolidayObservance;
  /** Which catalogue entry it was copied from. Provenance only; the row is the municipality's. */
  holidayCode?: string | null;
  /** Read-only: the next date this rule lands on, so nobody works out a recurrence on screen. */
  nextDate?: string | null;
}

export interface UpdateParkingScheduleRequest {
  chargesAllDay: boolean;
  week: ChargingDay[];
  exceptions: ChargingException[];
}

/**
 * One holiday of the municipality's country, offered so nobody has to type it (v0.31).
 *
 * A starting point and **not legal advice**: holiday law changes, and the calendar a canton charges
 * on is the canton's to answer for. That is why these are *copied* into the municipality's own
 * exceptions — once copied, editing or deleting one is entirely the municipality's business.
 */
export interface HolidayCatalogEntry {
  code: string;
  name: string;
  kind: 'FIXED' | 'EASTER';
  month: number | null;
  day: number | null;
  easterOffsetDays: number | null;
  observance: HolidayObservance;
  /** When it falls this year and next, so a screen shows dates rather than a rule to evaluate. */
  thisYear: string | null;
  nextYear: string | null;
  /** True when the municipality already copied it. What stops a screen offering it twice. */
  alreadyAdded: boolean;
}

/**
 * What a zone departs from its municipality in, and what it therefore applies (v0.31).
 *
 * The `override*` fields are null where the zone follows the municipality; the `effective*` fields
 * are always filled, because that is what somebody deciding whether to depart needs to see.
 */
export interface ZoneRules {
  zoneId: string;
  hasOwnRules: boolean;
  overrideSessionIncrementsMinutes: number[] | null;
  overrideSessionMinMinutes: number | null;
  overrideSessionMaxMinutes: number | null;
  overrideExtensionIncrementsMinutes: number[] | null;
  overrideExtensionMaxTotalMinutes: number | null;
  overrideFreeMinutes: number | null;
  effectiveSessionIncrementsMinutes: number[];
  effectiveSessionMinMinutes: number;
  effectiveSessionMaxMinutes: number;
  effectiveExtensionIncrementsMinutes: number[];
  effectiveExtensionMaxTotalMinutes: number;
  effectiveFreeMinutes: number;
  /** Whether the zone keeps its own timetable. False means it follows the municipality's. */
  hasOwnSchedule: boolean;
  chargesAllDay: boolean;
  week: ChargingDay[];
}

/**
 * `PUT /admin/parking/zones/{id}/rules`.
 *
 * Every field is optional and **absent means "follow the municipality"**, not "leave unchanged":
 * those are opposite instructions and a partial update could not tell them apart. A body where
 * everything is absent puts the zone back to following in everything.
 */
export interface UpdateZoneRulesRequest {
  sessionIncrementsMinutes?: number[];
  sessionMinMinutes?: number;
  sessionMaxMinutes?: number;
  extensionIncrementsMinutes?: number[];
  extensionMaxTotalMinutes?: number;
  freeMinutes?: number;
  /** True gives the zone its own timetable; false takes it away and it follows again. */
  ownSchedule?: boolean;
  chargesAllDay?: boolean;
  week?: ChargingDay[];
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

// ---- Enforcement (CONTRACT.md v0.7, ADR 0014) --------------------------------------------------
// A citation is an administrative act, not a payment row: it is append-only once issued, it is
// annulled with a reason rather than edited, and its own history travels with it because whoever
// challenges it is entitled to read what happened. The three audiences below — officer,
// administration and the citizen who was fined — read deliberately different shapes, and those
// shapes are kept apart here for the same reason the server keeps them apart.

/**
 * The answer to "has this plate paid, on this bay, right now?" — never `COVERED` without a bay.
 *
 * `EXEMPT` is decided before anything about payment: an ambulance is not fined whether or not it
 * also paid. `EXPIRED` is "paid for this bay and the clock ran out", which until v0.28 was collapsed
 * into `NOT_COVERED` — a different conversation with the driver, and often a different infraction.
 */
export type PlateVerdict = 'EXEMPT' | 'COVERED' | 'EXPIRED' | 'BAY_MISMATCH' | 'NOT_COVERED' | 'AMBIGUOUS';

/** The legal life of a citation (`CitationStatus`); the transition table lives on the server. */
export type CitationStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'PAID'
  | 'APPEALED'
  | 'UPHELD'
  | 'DISMISSED'
  | 'CANCELLED'
  | 'EXPIRED';

/** What was done to a citation, as written in its own history (`CitationAction`). */
export type CitationAction =
  | 'DRAFTED'
  | 'ISSUED'
  | 'EVIDENCE_ATTACHED'
  | 'PAID'
  | 'APPEALED'
  | 'APPEAL_UPHELD'
  | 'APPEAL_DISMISSED'
  | 'CANCELLED'
  | 'EXPIRED';

/** A photograph has bytes behind it; a note has only the officer's text. Same table, same weight. */
export type EvidenceKind = 'PHOTO' | 'NOTE';

/**
 * One kind of infraction as the municipality configures it. The currency is the municipality's and
 * never a field of a request: a catalogue holding two currencies is a report that adds up wrong.
 */
export interface InfractionType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  fineMinor: number;
  currencyCode: string;
  /** The reduced amount while the early window is open; null when this kind offers no discount. */
  discountedFineMinor: number | null;
  discountDays: number | null;
  discountPercent: number | null;
  dueDays: number;
  /** When true the citation is captured as a DRAFT and cannot be issued until a photograph lands. */
  requiresPhoto: boolean;
  allowsAppeal: boolean;
  active: boolean;
}

/** One row of `PUT /admin/enforcement/infraction-types`. Absent rows are deactivated, never deleted. */
export interface InfractionTypeDraft {
  /** Present updates that row; absent creates one. */
  id?: string;
  code: string;
  name: string;
  description?: string;
  fineAmountMinor: number;
  requiresPhoto: boolean;
  allowsAppeal: boolean;
  discountDays?: number | null;
  discountPercent?: number | null;
  dueDays: number;
  active: boolean;
}

/** The bay the officer is standing at, as the server resolved it. */
export interface EnforcementBay {
  spaceId: string;
  spaceCode: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string;
}

/** A running stay as enforcement sees it: where, and until when. Never who paid for it. */
export interface EnforcementStay {
  sessionId: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  spaceId: string;
  spaceCode: string;
  startedAt: string;
  expiresAt: string;
}

export interface PlateStatus {
  plate: string;
  plateNormalized: string;
  verdict: PlateVerdict;
  /** The server's own translation key for the verdict; the client keeps its own copy keyed by verdict. */
  verdictLabelKey: string;
  /** True when matches exist and no bay was supplied — the answer is incomplete, not negative. */
  requiresBay: boolean;
  bay: EnforcementBay | null;
  coveringStay: EnforcementStay | null;
  /** The stay that ran out on this bay, when the verdict is `EXPIRED`. */
  expiredStay: EnforcementStay | null;
  /** Why this plate is not fined, when the verdict is `EXEMPT`. */
  exemption: PlateExemptionSummary | null;
  /**
   * Running stays for the same plate elsewhere in the municipality. What makes BAY_MISMATCH legible.
   * Narrowed by the server to the sectors this officer covers (CONTRACT.md v0.28).
   */
  otherStays: EnforcementStay[];
  /**
   * The municipality's tolerance in minutes after the clock runs out.
   *
   * Carried so the screen can explain a `COVERED` whose expiry time has already passed. Without it
   * the officer reads "vigente" beside a time in the past and has no way to know that is correct.
   */
  graceMinutes: number;
  /**
   * The fiscalisation-log entry this lookup produced (CONTRACT.md v0.29).
   *
   * Sent back on the citation the officer may write next, which is what links "he looked" to "he
   * looked and then fined" — and answers the other direction, "they fined me without coming to see".
   */
  checkId: string | null;
  checkedAt: string;
}

/**
 * A zone as the officer's device needs it (`GET /inspector/zones`).
 *
 * No tariff: an officer does not quote prices, and a screen that showed one would invite the
 * question of whether they can negotiate it.
 */
export interface InspectorZone {
  id: string;
  code: string;
  name: string;
  description: string | null;
  /** The bay codes this zone actually contains, so the field can validate instead of guessing. */
  spaceCodes?: ParkingZoneSpaceCodes;
}

/**
 * Why an act does or does not carry coordinates (CONTRACT.md v0.29).
 *
 * Until v0.29 all three collapsed into "latitude is null", so a refusal, a timeout and a phone with
 * no signal were the same row — and none could be told apart when somebody later asked whether the
 * officer had actually been there.
 */
export type LocationState = 'FIX' | 'NO_FIX' | 'NOT_GRANTED';

/**
 * `POST /inspector/plate-checks` — the plate lookup since v0.29.
 *
 * A POST because it is no longer safe: every lookup writes a row in the fiscalisation log, and
 * because it carries the officer's coordinates, which are personal data and do not belong in a URL.
 */
export interface PlateCheckRequest {
  plate: string;
  zoneId?: string;
  spaceCode?: string;
  /** What the device actually knows — never derived from whether the coordinates are present. */
  locationState?: LocationState;
  latitude?: number;
  longitude?: number;
  locationAccuracyM?: number;
}

/** One recorded lookup, as the municipality's activity screen reads it. */
export interface EnforcementCheck {
  id: string;
  inspectorUserId: string;
  inspectorName: string | null;
  plate: string;
  plateRaw: string;
  zoneId: string | null;
  zoneName: string | null;
  spaceCode: string | null;
  /** The verdict, when the server answered. Null when it refused — see `refusalCode`. */
  verdict: PlateVerdict | null;
  /** Why the server refused to answer. A refusal is a result too, and it is kept. */
  refusalCode: string | null;
  locationState: LocationState;
  latitude: number | null;
  longitude: number | null;
  locationAccuracyM: number | null;
  userAgent: string | null;
  /** Whether a citation came out of this lookup — "he looked" versus "he looked and then fined". */
  citationIssued: boolean;
  occurredAt: string;
}

export interface EnforcementChecksQuery {
  inspectorUserId?: string;
  zoneId?: string;
  plate?: string;
  verdict?: PlateVerdict;
  from?: string;
  to?: string;
}

/** Just enough for an officer to say out loud why they are not fining this car. */
export interface PlateExemptionSummary {
  id: string;
  plate: string;
  reason: string;
  documentRef: string | null;
  /**
   * The category, as this municipality named it (v0.30): "Discapacidad", "Vehículo institucional".
   * The **beneficiary** deliberately does not travel here: knowing whose permit it is adds nothing to
   * the decision not to fine, and everything to what a device in the street carries about a person.
   */
  typeName: string | null;
  validFrom: string;
  validTo: string | null;
}

// ---- Permits and exemptions, administration side (CONTRACT.md v0.30) --------------------------

/**
 * Four states since v0.30, when a permit became something that is *requested* before it is granted —
 * a state that can be rejected implies somebody asked.
 *
 * `ACTIVE` is what v0.28 called an approved permit and only appears during the expansion phase; treat
 * it exactly as `APPROVED` wherever it turns up.
 *
 * There is deliberately no `EXPIRED`: running out is a fact about the clock, not a decision anybody
 * took, so it is read from `expired` — computed against now, never stored.
 */
export type ExemptionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'ACTIVE';

/** Person or organisation. A disability permit is doña María's; an institutional one is the ministry's. */
export type BeneficiaryKind = 'PERSON' | 'ORGANISATION';

/** A category of permit, as this municipality defines it. Configuration, never an enumeration. */
export interface ExemptionType {
  id: string;
  /** What a future rule would match on. Set once and never edited. */
  code: string;
  name: string;
  description: string | null;
  /** A half-hour courtesy may have no beneficiary; a disability permit without a person is not one. */
  requiresBeneficiary: boolean;
  active: boolean;
}

export interface SaveExemptionTypeRequest {
  code?: string;
  name: string;
  description?: string;
  requiresBeneficiary: boolean;
  /** Only on update. Retiring is not deleting: granted permits point at the category. */
  active?: boolean;
}

/** One plate a permit covers. `plateRaw` is what was typed, and it is what an appeal argues over. */
export interface ExemptionPlate {
  plate: string;
  plateRaw: string;
  status: ExemptionStatus;
  addedAt: string;
}

export interface ExemptionDocument {
  id: string;
  title: string;
  contentType: string;
  byteSize: number;
  /** The digest of what was stored: "the assessment that was submitted", not "a file put there later". */
  sha256: string;
  uploadedByName: string | null;
  createdAt: string;
}

export interface RequestExemptionRequest {
  exemptionTypeId: string;
  /** One or several: a disability permit belongs to the person and travels with them. */
  plates: string[];
  beneficiaryKind?: BeneficiaryKind;
  beneficiaryName?: string;
  /** Personal identifier. Never shown on the officer's device. */
  beneficiaryDocument?: string;
  /** Required. The category says which rule applies; this says why this vehicle falls under it. */
  reason: string;
  documentRef?: string;
  validFrom?: string;
  /** Omitted means **no expiry** — legitimate for a council fleet, and the screen says so in words. */
  validTo?: string;
}

export interface AmendExemptionRequest {
  /** Omitted keeps the category the permit already has. */
  exemptionTypeId?: string;
  beneficiaryKind?: BeneficiaryKind;
  beneficiaryName?: string;
  beneficiaryDocument?: string;
  reason: string;
  documentRef?: string;
  validFrom?: string;
  validTo?: string;
}

export interface PlateExemption {
  id: string;
  /** @deprecated since v0.30 — read `plates`. The first of them, kept for an older client. */
  plate: string;
  /** @deprecated since v0.30 — read `plates`. */
  plateRaw: string;
  reason: string;
  documentRef: string | null;
  status: ExemptionStatus;
  validFrom: string;
  validTo: string | null;
  /** Computed against the clock, never stored — see the three flags together. */
  inForce: boolean;
  pending: boolean;
  expired: boolean;
  grantedAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  exemptionTypeId: string | null;
  exemptionTypeCode: string | null;
  exemptionTypeName: string | null;
  plates: ExemptionPlate[];
  beneficiaryKind: BeneficiaryKind | null;
  beneficiaryName: string | null;
  beneficiaryDocument: string | null;
  requestedAt: string | null;
  requestedByName: string | null;
  decidedAt: string | null;
  /** "Who authorised that this car did not pay" — not answered by naming whoever typed the request. */
  decidedByName: string | null;
  decisionReason: string | null;
  /** The same person asked and decided. Permitted, and therefore shown rather than left to be noticed. */
  selfApproved: boolean;
  documentCount: number;
}

/** What the officer's device sends. Everything about location is optional and never invented. */
export interface CreateCitationRequest {
  infractionTypeId: string;
  plate: string;
  zoneId?: string;
  spaceId?: string;
  spaceCode?: string;
  latitude?: number;
  longitude?: number;
  locationAccuracyM?: number;
  addressText?: string;
  /** The officer's declaration of when it happened. The server records its own emission time apart. */
  occurredAt?: string;
  /**
   * Generated on the device once, when the capture is created, and unique per municipality. It is
   * what makes a resend after a lost connection resolve to the same citation even when the retry
   * carries a brand-new `Idempotency-Key`: the header protects the request, this protects the act.
   */
  deviceCitationId?: string;
  /**
   * The plate lookup this citation came out of (CONTRACT.md v0.29).
   *
   * Optional: a citation can be written without one — the officer saw the car yesterday, the app had
   * no signal — and requiring it would turn a traceability field into something that stops the work.
   */
  enforcementCheckId?: string;
  parkingSessionId?: string;
  notes?: string;
}

/** A reason is mandatory wherever an act is annulled or an appeal resolved. */
export interface CitationReasonRequest {
  reason: string;
}

/** The citation as the officer and the administration read it. */
/**
 * A defence filed against a citation (CONTRACT.md v0.8, and its moderation queue in v0.17).
 *
 * `SUBMITTED` is waiting for a decision; `ACCEPTED` means the citation was dismissed and `REJECTED`
 * that it stands. There is no fourth state and no way back: resolving is once, and the reason is
 * mandatory in both directions — a citizen whose defence is rejected is entitled to read why, and a
 * municipality that voids its own citation owes its auditor the same sentence.
 */
export type AppealStatus = 'SUBMITTED' | 'ACCEPTED' | 'REJECTED';

export interface CitationAppeal {
  id: string;
  citationId: string;
  status: AppealStatus;
  statusLabelKey: string;
  body: string;
  submittedAt: string;
  resolvedAt: string | null;
  resolutionReason: string | null;
  /** The exact version of the legal notice this citizen read before writing. */
  noticeVersion: number;
  maxImages: number;
  images: CitationEvidence[];
}

/**
 * The legal notice a citizen reads before writing a defence.
 *
 * Versioned and append-only: publishing inserts, never edits, because `noticeVersion` on every
 * defence points at the exact text its author accepted. `countryDefault` marks the wording a
 * municipality inherited rather than wrote.
 */
export interface AppealNotice {
  id: string;
  version: number;
  locale: string;
  body: string;
  effectiveFrom: string;
  countryDefault: boolean;
}

/**
 * `POST /citizen/fines/{id}/appeals`.
 *
 * `acceptedNoticeId` is the id of the notice the citizen actually had on screen, not a boolean
 * "accepted": a checkbox proves nothing months later, and the server refuses any id but the version
 * in force so a stale tab cannot file against wording nobody is showing any more.
 */
export interface FileAppealRequest {
  body: string;
  acceptedNoticeId: string;
}

export interface ResolveAppealRequest {
  accept: boolean;
  reason: string;
}

export interface PublishAppealNoticeRequest {
  locale: string;
  body: string;
  /** A date in the future prepares a change without it appearing on screens today. */
  effectiveFrom?: string;
}

export interface Citation {
  id: string;
  /** Absent while DRAFT: an abandoned capture must not burn a number of the municipality's series. */
  number: string | null;
  seriesYear: number | null;
  status: CitationStatus;
  statusLabelKey: string;
  statusReason: string | null;
  plate: string;
  vehicleId: string | null;
  zoneId: string | null;
  zoneCode: string | null;
  zoneName: string | null;
  spaceId: string | null;
  spaceCode: string | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracyM: number | null;
  addressText: string | null;
  infractionTypeId: string;
  infractionCode: string;
  infractionName: string;
  fineMinor: number;
  /** The amount actually owed today: the reduced one while the early window is open. */
  amountPayableMinor: number;
  discountedFineMinor: number | null;
  currencyCode: string;
  discountUntil: string | null;
  dueAt: string | null;
  occurredAt: string;
  issuedAt: string | null;
  /** Declared time minus emission time. A defence is built out of exactly this number. */
  deviceClockSkewSeconds: number | null;
  inspectorUserId: string | null;
  parkingSessionId: string | null;
  notes: string | null;
  /**
   * Only meaningful on a **detail** response. The server leaves it at zero in listings on purpose —
   * counting evidence per row is the N+1 its mapper exists to avoid — so no list screen may render
   * it, and none does.
   */
  evidenceCount: number;
}

/** A piece of evidence. The digest is what proves, later, that the photograph is the one taken. */
export interface CitationEvidence {
  id: string;
  kind: EvidenceKind;
  contentType: string | null;
  byteSize: number | null;
  sha256: string | null;
  note: string | null;
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  /** Path of the bytes, relative to the API base. Authenticated: never put it in a bare `<img src>`. */
  contentUrl: string | null;
}

/** One entry of the citation's own history. */
export interface CitationEvent {
  id: string;
  action: CitationAction;
  actionLabelKey: string;
  fromStatus: CitationStatus | null;
  toStatus: CitationStatus | null;
  actorUserId: string | null;
  actorPortal: Portal | null;
  reason: string | null;
  occurredAt: string;
}

/** The citation with everything a defence is entitled to read. */
export interface CitationDetail {
  citation: Citation;
  evidence: CitationEvidence[];
  history: CitationEvent[];
}

/** What `POST /inspector/citations` reports back — including whether it created anything. */
export interface CitationCaptureResult extends CitationDetail {
  /**
   * True when this call created the act (201), false when the server recognised the resend by its
   * `deviceCitationId` and handed back the citation that already existed (200). A queue flushing
   * twice needs to be able to tell those apart; a silent 201 would tell it the opposite.
   */
  created: boolean;
}

export interface AdminCitationsQuery {
  status?: CitationStatus;
  zoneId?: string;
  inspectorUserId?: string;
  /** Matched on the normalised form, so `sjp-123` finds `SJP123`. */
  plate?: string;
  from?: string;
  to?: string;
}

/**
 * A fine as the citizen sees it: deliberately narrower than the officer's view — no officer
 * identifier, no device clock skew, no internal session reference.
 */
export interface Fine {
  id: string;
  number: string | null;
  status: CitationStatus;
  statusLabelKey: string;
  plate: string;
  infractionCode: string;
  infractionName: string;
  zoneName: string | null;
  spaceCode: string | null;
  addressText: string | null;
  fineMinor: number;
  amountPayableMinor: number;
  currencyCode: string;
  discountUntil: string | null;
  dueAt: string | null;
  occurredAt: string;
  issuedAt: string | null;
  appealable: boolean;
  /** Zero in listings by design, like {@link Citation.evidenceCount}; read it from the detail. */
  evidenceCount: number;
}

export interface FineDetail {
  fine: Fine;
  evidence: CitationEvidence[];
  history: CitationEvent[];
  /**
   * The defence filed against this fine, or `null` when none was. It travels with the detail rather
   * than on its own request because the answer decides what the screen offers — writing a defence,
   * or reading the one already filed — and two requests would let the screen render the wrong one
   * for as long as the second was in flight.
   */
  appeal: CitationAppeal | null;
}
