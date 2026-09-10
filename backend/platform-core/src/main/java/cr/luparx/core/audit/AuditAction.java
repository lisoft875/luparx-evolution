package cr.luparx.core.audit;

/**
 * Canonical {@code action} values written to {@code audit_events}. Kept as constants (not free text)
 * so that the admin audit filter {@code GET /admin/audit-events?action=} has a stable vocabulary.
 */
public final class AuditAction {

    private AuditAction() {
    }

    public static final String USER_REGISTERED = "USER_REGISTERED";
    /**
     * An account opened <em>for</em> somebody by an operator (CONTRACT.md v0.14), as opposed to
     * {@link #USER_REGISTERED}, which somebody did for themselves. Kept apart on purpose: the
     * question an auditor asks about a staff account is who created it, and one action name covering
     * both would make that unanswerable.
     */
    public static final String USER_CREATED = "USER_CREATED";
    public static final String USER_UPDATED = "USER_UPDATED";
    public static final String USER_BLOCKED = "USER_BLOCKED";
    public static final String USER_UNBLOCKED = "USER_UNBLOCKED";
    public static final String USER_PASSWORD_RESET_REQUESTED = "USER_PASSWORD_RESET_REQUESTED";
    public static final String USER_PASSWORD_CHANGED = "USER_PASSWORD_CHANGED";
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
    /** An access paused reversibly, and lifted again (CONTRACT.md v0.15). */
    public static final String MEMBERSHIP_SUSPENDED = "MEMBERSHIP_SUSPENDED";
    public static final String MEMBERSHIP_REACTIVATED = "MEMBERSHIP_REACTIVATED";
    /** The sectors a member of staff covers were replaced. */
    public static final String MEMBERSHIP_ZONES_ASSIGNED = "MEMBERSHIP_ZONES_ASSIGNED";
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
    /** A bay taken out of service, put back, or moved to another zone (CONTRACT.md v0.16). */
    public static final String PARKING_SPACE_UPDATED = "PARKING_SPACE_UPDATED";
    /**
     * A bay repainted with another number (CONTRACT.md v0.25). Recorded apart from
     * {@link #PARKING_SPACE_UPDATED} because it is the one change that alters how the bay is named
     * on the street, and the entry carries both codes so the old number stays findable.
     */
    public static final String PARKING_SPACE_RENAMED = "PARKING_SPACE_RENAMED";

    /**
     * A municipal administrator looked a person up in the platform-wide directory by their exact
     * email or identity document, in order to give them a post (CONTRACT.md v0.26).
     *
     * <p>Recorded on every attempt, found or not, for two reasons. It is the only reach a tenant
     * portal has outside its own municipality, so it has to be accountable; and the rate limit that
     * stops the endpoint from becoming a way to enumerate the national register is <em>counted from
     * these very rows</em>. The entry never carries the term that was searched — that is a full
     * personal identifier (SECURITY.md §11) — only whether it was an email or a document, and the id
     * of whoever was found.</p>
     */
    public static final String USER_DIRECTORY_LOOKUP = "USER_DIRECTORY_LOOKUP";

    // --- staff invitations (CONTRACT.md v0.27) ----------------------------------------------------
    /** A post offered to an address with no account yet. Also recorded when the link is re-sent. */
    public static final String STAFF_INVITATION_SENT = "STAFF_INVITATION_SENT";
    /** Called back before it was used. */
    public static final String STAFF_INVITATION_REVOKED = "STAFF_INVITATION_REVOKED";
    /**
     * Somebody opened an account with an invitation. The actor is the invited person, not the
     * administrator who invited them — this is the moment they act for the first time, and the
     * invitation row says who offered it.
     */
    public static final String STAFF_INVITATION_ACCEPTED = "STAFF_INVITATION_ACCEPTED";

    // --- plate exemptions (CONTRACT.md v0.28) -----------------------------------------------------
    /**
     * A plate this municipality decided not to fine for non-payment.
     *
     * <p>Audited with the plate itself, unlike most administrative entries: "why was this car never
     * fined" is a question somebody eventually asks, and the answer has to outlive whoever made the
     * decision. A plate is not a personal identifier — it is what is painted on a vehicle in public.</p>
     */
    public static final String PLATE_EXEMPTION_GRANTED = "PLATE_EXEMPTION_GRANTED";
    public static final String PLATE_EXEMPTION_AMENDED = "PLATE_EXEMPTION_AMENDED";
    public static final String PLATE_EXEMPTION_REVOKED = "PLATE_EXEMPTION_REVOKED";

    // --- account, locales and municipal operation (CONTRACT.md "v0.3") --------------------------
    public static final String USER_EMAIL_CHANGE_REQUESTED = "USER_EMAIL_CHANGE_REQUESTED";
    public static final String USER_EMAIL_CHANGED = "USER_EMAIL_CHANGED";
    public static final String TENANT_LOCALES_UPDATED = "TENANT_LOCALES_UPDATED";
    public static final String TENANT_BRANDING_UPDATED = "TENANT_BRANDING_UPDATED";
    public static final String PARKING_SPACE_FORMAT_UPDATED = "PARKING_SPACE_FORMAT_UPDATED";
    public static final String PARKING_SCHEDULE_UPDATED = "PARKING_SCHEDULE_UPDATED";

    // --- enforcement (CONTRACT.md "v0.7"): every act on a citation is traceable, and the citation
    // also keeps its own history in citation_events, which is part of the act and not a log -------
    public static final String CITATION_DRAFTED = "CITATION_DRAFTED";
    public static final String CITATION_ISSUED = "CITATION_ISSUED";
    public static final String CITATION_EVIDENCE_ATTACHED = "CITATION_EVIDENCE_ATTACHED";
    public static final String CITATION_STATUS_CHANGED = "CITATION_STATUS_CHANGED";
    public static final String CITATION_CANCELLED = "CITATION_CANCELLED";
    public static final String INFRACTION_TYPES_UPDATED = "INFRACTION_TYPES_UPDATED";

    // --- appeals, notices and wallet top-ups (CONTRACT.md "v0.8") -------------------------------
    public static final String CITATION_APPEAL_FILED = "CITATION_APPEAL_FILED";
    public static final String CITATION_APPEAL_RESOLVED = "CITATION_APPEAL_RESOLVED";
    public static final String APPEAL_NOTICE_PUBLISHED = "APPEAL_NOTICE_PUBLISHED";
    public static final String ENFORCEMENT_SETTINGS_UPDATED = "ENFORCEMENT_SETTINGS_UPDATED";
    public static final String WALLET_TOPUP_RECORDED = "WALLET_TOPUP_RECORDED";
    public static final String WALLET_TOPUP_CODE_ROTATED = "WALLET_TOPUP_CODE_ROTATED";
    public static final String WALLET_TOPUP_CODE_RESOLVED = "WALLET_TOPUP_CODE_RESOLVED";
}
