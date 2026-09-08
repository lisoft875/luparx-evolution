package cr.luparx.core.audit;

/**
 * Canonical {@code action} values written to {@code audit_events}. Kept as constants (not free text)
 * so that the admin audit filter {@code GET /admin/audit-events?action=} has a stable vocabulary.
 */
public final class AuditAction {

    private AuditAction() {
    }

    public static final String USER_REGISTERED = "USER_REGISTERED";
    public static final String USER_UPDATED = "USER_UPDATED";
    public static final String USER_BLOCKED = "USER_BLOCKED";
    public static final String USER_UNBLOCKED = "USER_UNBLOCKED";
    public static final String USER_PASSWORD_RESET_REQUESTED = "USER_PASSWORD_RESET_REQUESTED";
    public static final String USER_PASSWORD_CHANGED = "USER_PASSWORD_CHANGED";
    public static final String USER_MFA_REQUIREMENT_CHANGED = "USER_MFA_REQUIREMENT_CHANGED";
    public static final String USER_MFA_ACTIVATED = "USER_MFA_ACTIVATED";
    public static final String USER_MFA_DISABLED = "USER_MFA_DISABLED";
    public static final String USER_EMAIL_VERIFIED = "USER_EMAIL_VERIFIED";

    public static final String LOGIN_SUCCEEDED = "LOGIN_SUCCEEDED";
    public static final String LOGIN_FAILED = "LOGIN_FAILED";
    public static final String LOGOUT = "LOGOUT";
    public static final String REFRESH_TOKEN_REUSE_DETECTED = "REFRESH_TOKEN_REUSE_DETECTED";
    public static final String SESSION_TENANT_SWITCHED = "SESSION_TENANT_SWITCHED";
    public static final String FEDERATED_IDENTITY_LINKED = "FEDERATED_IDENTITY_LINKED";

    public static final String MEMBERSHIP_REQUESTED = "MEMBERSHIP_REQUESTED";
    public static final String MEMBERSHIP_CREATED = "MEMBERSHIP_CREATED";
    public static final String MEMBERSHIP_APPROVED = "MEMBERSHIP_APPROVED";
    public static final String MEMBERSHIP_REJECTED = "MEMBERSHIP_REJECTED";
    public static final String MEMBERSHIP_REVOKED = "MEMBERSHIP_REVOKED";
    public static final String MEMBERSHIP_ROLE_CHANGED = "MEMBERSHIP_ROLE_CHANGED";

    public static final String TENANT_CREATED = "TENANT_CREATED";
    public static final String TENANT_UPDATED = "TENANT_UPDATED";
    public static final String TENANT_STATUS_CHANGED = "TENANT_STATUS_CHANGED";
    public static final String TENANT_SETTING_CHANGED = "TENANT_SETTING_CHANGED";

    public static final String EXPORT_REQUESTED = "EXPORT_REQUESTED";
    public static final String CATALOG_UPDATED = "CATALOG_UPDATED";
    public static final String PLATFORM_SCOPE_ACCESS = "PLATFORM_SCOPE_ACCESS";

    // --- parking (CONTRACT.md v0.2: "Toda operacion queda auditada con tenant, usuario, vehiculo y
    // espacio") ---------------------------------------------------------------------------------
    public static final String VEHICLE_REGISTERED = "VEHICLE_REGISTERED";
    public static final String VEHICLE_UPDATED = "VEHICLE_UPDATED";
    public static final String VEHICLE_DELETED = "VEHICLE_DELETED";
    public static final String VEHICLE_PRIMARY_CHANGED = "VEHICLE_PRIMARY_CHANGED";
    public static final String PARKING_SESSION_STARTED = "PARKING_SESSION_STARTED";
    public static final String PARKING_SESSION_EXTENDED = "PARKING_SESSION_EXTENDED";
    public static final String PARKING_SESSION_FINISHED = "PARKING_SESSION_FINISHED";
    public static final String PARKING_POLICY_UPDATED = "PARKING_POLICY_UPDATED";
    public static final String PARKING_ZONE_UPDATED = "PARKING_ZONE_UPDATED";
    public static final String PARKING_RATE_UPDATED = "PARKING_RATE_UPDATED";
    public static final String PARKING_SPACE_CREATED = "PARKING_SPACE_CREATED";

    // --- account, locales and municipal operation (CONTRACT.md "v0.3") --------------------------
    public static final String USER_EMAIL_CHANGE_REQUESTED = "USER_EMAIL_CHANGE_REQUESTED";
    public static final String USER_EMAIL_CHANGED = "USER_EMAIL_CHANGED";
    public static final String TENANT_LOCALES_UPDATED = "TENANT_LOCALES_UPDATED";
    public static final String TENANT_BRANDING_UPDATED = "TENANT_BRANDING_UPDATED";
    public static final String PARKING_SPACE_FORMAT_UPDATED = "PARKING_SPACE_FORMAT_UPDATED";
    public static final String PARKING_SCHEDULE_UPDATED = "PARKING_SCHEDULE_UPDATED";
}
