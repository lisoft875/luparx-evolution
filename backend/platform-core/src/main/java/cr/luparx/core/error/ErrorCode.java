package cr.luparx.core.error;

/**
 * Stable, machine-readable error identifiers returned in the {@code code} member of every RFC 9457
 * Problem Details body (CONTRACT.md §4, ADR 0011). Clients branch on these; they map one-to-one to
 * an i18n key on the client side, so a code is never renamed without a contract change.
 */
public final class ErrorCode {

    private ErrorCode() {
    }

    // --- generic -------------------------------------------------------------------------------
    public static final String VALIDATION_FAILED = "VALIDATION_FAILED";
    public static final String NOT_FOUND = "NOT_FOUND";
    public static final String CONFLICT = "CONFLICT";
    public static final String ACCESS_DENIED = "ACCESS_DENIED";
    public static final String UNAUTHENTICATED = "UNAUTHENTICATED";
    public static final String INTERNAL_ERROR = "INTERNAL_ERROR";
    public static final String NOT_IMPLEMENTED = "NOT_IMPLEMENTED";
    public static final String RATE_LIMITED = "RATE_LIMITED";
    public static final String MALFORMED_REQUEST = "MALFORMED_REQUEST";
    public static final String OPTIMISTIC_LOCK_CONFLICT = "OPTIMISTIC_LOCK_CONFLICT";

    // --- idempotency (ADR 0012) ----------------------------------------------------------------
    public static final String IDEMPOTENCY_KEY_REQUIRED = "IDEMPOTENCY_KEY_REQUIRED";
    public static final String IDEMPOTENCY_KEY_CONFLICT = "IDEMPOTENCY_KEY_CONFLICT";
    public static final String IDEMPOTENT_REQUEST_IN_PROGRESS = "IDEMPOTENT_REQUEST_IN_PROGRESS";

    // --- authentication ------------------------------------------------------------------------
    public static final String INVALID_CREDENTIALS = "INVALID_CREDENTIALS";
    public static final String ACCOUNT_BLOCKED = "ACCOUNT_BLOCKED";
    public static final String EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED";
    public static final String PASSWORD_TOO_WEAK = "PASSWORD_TOO_WEAK";
    public static final String PASSWORD_LOGIN_UNAVAILABLE = "PASSWORD_LOGIN_UNAVAILABLE";
    public static final String REFRESH_TOKEN_INVALID = "REFRESH_TOKEN_INVALID";
    public static final String REFRESH_TOKEN_REUSED = "REFRESH_TOKEN_REUSED";
    public static final String VERIFICATION_TOKEN_INVALID = "VERIFICATION_TOKEN_INVALID";
    public static final String PORTAL_MISMATCH = "PORTAL_MISMATCH";
    public static final String SELF_REGISTRATION_DISABLED = "SELF_REGISTRATION_DISABLED";

    // --- MFA (ADR 0007) ------------------------------------------------------------------------
    public static final String MFA_REQUIRED = "MFA_REQUIRED";
    public static final String MFA_NOT_ENABLED = "MFA_NOT_ENABLED";
    public static final String MFA_ALREADY_ACTIVE = "MFA_ALREADY_ACTIVE";
    public static final String INVALID_MFA_CODE = "INVALID_MFA_CODE";
    public static final String MFA_TOKEN_INVALID = "MFA_TOKEN_INVALID";

    // --- federation (ADR 0006) -----------------------------------------------------------------
    public static final String FEDERATION_PROVIDER_UNKNOWN = "FEDERATION_PROVIDER_UNKNOWN";
    public static final String FEDERATION_NOT_CONFIGURED = "FEDERATION_NOT_CONFIGURED";
    public static final String FEDERATION_EMAIL_NOT_VERIFIED = "FEDERATION_EMAIL_NOT_VERIFIED";
    public static final String FEDERATION_LINK_CONFIRMATION_REQUIRED = "FEDERATION_LINK_CONFIRMATION_REQUIRED";
    public static final String FEDERATION_REGISTRATION_REQUIRED = "FEDERATION_REGISTRATION_REQUIRED";

    // --- users ---------------------------------------------------------------------------------
    public static final String USER_NOT_FOUND = "USER_NOT_FOUND";
    public static final String USER_BLOCKED = "USER_BLOCKED";
    public static final String EMAIL_ALREADY_REGISTERED = "EMAIL_ALREADY_REGISTERED";
    public static final String DOCUMENT_ALREADY_REGISTERED = "DOCUMENT_ALREADY_REGISTERED";
    public static final String MINIMUM_AGE_NOT_MET = "MINIMUM_AGE_NOT_MET";
    public static final String INVALID_IDENTITY_DOCUMENT = "INVALID_IDENTITY_DOCUMENT";
    public static final String INVALID_PHONE_NUMBER = "INVALID_PHONE_NUMBER";
    public static final String INVALID_ADDRESS = "INVALID_ADDRESS";
    public static final String INVALID_BIRTH_DATE = "INVALID_BIRTH_DATE";

    // --- geo catalogue -------------------------------------------------------------------------
    public static final String COUNTRY_NOT_FOUND = "COUNTRY_NOT_FOUND";
    public static final String COUNTRY_NOT_ACTIVE = "COUNTRY_NOT_ACTIVE";
    public static final String DIVISION_NOT_FOUND = "DIVISION_NOT_FOUND";
    public static final String DOCUMENT_TYPE_NOT_SUPPORTED = "DOCUMENT_TYPE_NOT_SUPPORTED";

    // --- tenancy -------------------------------------------------------------------------------
    public static final String TENANT_NOT_FOUND = "TENANT_NOT_FOUND";
    public static final String TENANT_NOT_ACTIVE = "TENANT_NOT_ACTIVE";
    public static final String TENANT_SLUG_ALREADY_USED = "TENANT_SLUG_ALREADY_USED";
    public static final String TENANT_CONTEXT_REQUIRED = "TENANT_CONTEXT_REQUIRED";
    public static final String CROSS_TENANT_ACCESS_DENIED = "CROSS_TENANT_ACCESS_DENIED";
    public static final String MEMBERSHIP_NOT_FOUND = "MEMBERSHIP_NOT_FOUND";
    public static final String MEMBERSHIP_NOT_ACTIVE = "MEMBERSHIP_NOT_ACTIVE";
    /**
     * The account belongs to no municipality that is currently open to it — every membership it has
     * was revoked, or points at a municipality that has been suspended or closed. Distinct from
     * {@link #MEMBERSHIP_NOT_ACTIVE}, which is about one municipality the caller named, and from
     * {@link #TENANT_CONTEXT_REQUIRED}, which means the caller has municipalities and has not picked
     * one yet.
     */
    public static final String NO_ACTIVE_MEMBERSHIP = "NO_ACTIVE_MEMBERSHIP";
    public static final String MEMBERSHIP_ALREADY_EXISTS = "MEMBERSHIP_ALREADY_EXISTS";
    public static final String MEMBERSHIP_INVALID_TRANSITION = "MEMBERSHIP_INVALID_TRANSITION";
    public static final String ROLE_NOT_ALLOWED_FOR_PORTAL = "ROLE_NOT_ALLOWED_FOR_PORTAL";
    public static final String TENANT_SETTING_INVALID = "TENANT_SETTING_INVALID";

    // --- parking (CONTRACT.md "v0.2 — Dominio de parqueo") --------------------------------------
    public static final String VEHICLE_NOT_FOUND = "VEHICLE_NOT_FOUND";
    public static final String VEHICLE_PLATE_ALREADY_REGISTERED = "VEHICLE_PLATE_ALREADY_REGISTERED";
    public static final String VEHICLE_HAS_ACTIVE_SESSION = "VEHICLE_HAS_ACTIVE_SESSION";
    public static final String PARKING_POLICY_NOT_CONFIGURED = "PARKING_POLICY_NOT_CONFIGURED";
    public static final String PARKING_ZONE_NOT_FOUND = "PARKING_ZONE_NOT_FOUND";
    public static final String PARKING_SPACE_NOT_FOUND = "PARKING_SPACE_NOT_FOUND";
    public static final String PARKING_SPACE_OUT_OF_SERVICE = "PARKING_SPACE_OUT_OF_SERVICE";
    public static final String PARKING_RATE_NOT_FOUND = "PARKING_RATE_NOT_FOUND";
    public static final String PARKING_SESSION_NOT_FOUND = "PARKING_SESSION_NOT_FOUND";
    public static final String PARKING_SESSION_NOT_ACTIVE = "PARKING_SESSION_NOT_ACTIVE";
    public static final String WALLET_CURRENCY_MISMATCH = "WALLET_CURRENCY_MISMATCH";

    // The seven codes CONTRACT.md v0.2 pins by name. They are part of the wire contract: a client
    // branches on them, so none of them is ever renamed without a contract change.
    public static final String SESSION_ALREADY_ACTIVE_FOR_VEHICLE = "SESSION_ALREADY_ACTIVE_FOR_VEHICLE";
    public static final String SPACE_OCCUPIED = "SPACE_OCCUPIED";
    public static final String EXTENSION_DISABLED = "EXTENSION_DISABLED";
    public static final String EARLY_FINISH_DISABLED = "EARLY_FINISH_DISABLED";
    public static final String EXTENSION_EXCEEDS_MAX = "EXTENSION_EXCEEDS_MAX";
    public static final String INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE";
    public static final String INVALID_INCREMENT = "INVALID_INCREMENT";

    // --- account, locales and municipal operation (CONTRACT.md "v0.3") --------------------------
    /** The current password given to {@code POST /{portal}/me/password} did not match. */
    public static final String CURRENT_PASSWORD_INVALID = "CURRENT_PASSWORD_INVALID";
    /** The address a {@code POST /{portal}/me/email} is moving to already belongs to somebody. */
    public static final String EMAIL_CHANGE_NOT_ALLOWED = "EMAIL_CHANGE_NOT_ALLOWED";
    /** The requested locale is not one this municipality offers. */
    public static final String LOCALE_NOT_SUPPORTED = "LOCALE_NOT_SUPPORTED";
    /** The bay code does not match the code format this municipality configured. */
    public static final String PARKING_SPACE_CODE_INVALID = "PARKING_SPACE_CODE_INVALID";
    /** A bay with that code already exists in this municipality. */
    public static final String PARKING_SPACE_CODE_TAKEN = "PARKING_SPACE_CODE_TAKEN";
    /**
     * The whole requested stay falls outside the municipality's charging hours. The next band is
     * readable from {@code GET /citizen/parking/schedule}.
     */
    public static final String OUTSIDE_CHARGING_HOURS = "OUTSIDE_CHARGING_HOURS";
}
