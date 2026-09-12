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
    /**
     * Retired in v0.39 with identity federation (ADR 0022). Nothing writes it any more.
     *
     * <p>The constant stays because the audit trail is a vocabulary, not a code path: rows written
     * before the retirement are still readable and still filterable by
     * {@code GET /admin/audit-events?action=}, and {@code audit_events} is a table this platform
     * refuses to rewrite — there are database triggers to make sure of it (v0.32).</p>
     */
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
    /**
     * The perimeter of a zone was drawn or redrawn (CONTRACT.md v0.40).
     *
     * <p>Its own action and not a flavour of {@link #PARKING_ZONE_UPDATED} because the question an
     * auditor asks is different: renaming a zone is cosmetic, moving its perimeter changes which
     * street is being charged for, and those two must be answerable apart.</p>
     */
    public static final String PARKING_ZONE_GEOMETRY_UPDATED = "PARKING_ZONE_GEOMETRY_UPDATED";
    public static final String PARKING_ZONE_GEOMETRY_CLEARED = "PARKING_ZONE_GEOMETRY_CLEARED";
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

    // --- permits: requested, then decided (CONTRACT.md v0.30) -------------------------------------
    /** Somebody asked. It exempts nobody yet: a permit grants nothing until it is granted. */
    public static final String PLATE_EXEMPTION_REQUESTED = "PLATE_EXEMPTION_REQUESTED";
    /**
     * Somebody granted it — the entry that answers "who authorised that this car did not pay".
     *
     * <p>Carries {@code selfApproved} when the person who decided is the person who asked. That is
     * permitted, because a small municipality may have nobody else and refusing would push the work
     * off the platform and out of the record entirely; what it must not be is invisible.</p>
     */
    public static final String PLATE_EXEMPTION_APPROVED = "PLATE_EXEMPTION_APPROVED";
    /** Refused, with a reason. Audited like a grant: a refusal is a decision somebody may contest. */
    public static final String PLATE_EXEMPTION_REJECTED = "PLATE_EXEMPTION_REJECTED";
    public static final String PLATE_EXEMPTION_PLATE_ADDED = "PLATE_EXEMPTION_PLATE_ADDED";
    public static final String PLATE_EXEMPTION_PLATE_REMOVED = "PLATE_EXEMPTION_PLATE_REMOVED";
    /** A backing document was attached. Never removed, so there is no entry for the opposite. */
    public static final String PLATE_EXEMPTION_DOCUMENT_ATTACHED = "PLATE_EXEMPTION_DOCUMENT_ATTACHED";
    public static final String EXEMPTION_TYPE_CREATED = "EXEMPTION_TYPE_CREATED";
    /** Includes retiring one: a category is never deleted, because granted permits point at it. */
    public static final String EXEMPTION_TYPE_UPDATED = "EXEMPTION_TYPE_UPDATED";

    /**
     * The retention purge ran (CONTRACT.md v0.29, ADR 0013).
     *
     * <p>Written with no tenant and no actor: the platform acting on its own retention policy, not a
     * municipality and not a person. The entry says which cutoff was applied and how many rows went,
     * because a deletion that leaves no trace is indistinguishable from data loss.</p>
     */
    public static final String RETENTION_PURGE_RAN = "RETENTION_PURGE_RAN";

    /**
     * Somebody checked an address against the trail (CONTRACT.md v0.33).
     *
     * <p>Audited because it is a lookup about a person even though it reads nobody's record: it turns
     * "I suspect this address" into a yes or a no. The entry carries the fingerprint and the number of
     * matches, and deliberately never the address — recording it here would put in the permanent table
     * exactly the value the whole hashing design exists to keep out of it.</p>
     *
     * <p>It is also the counter that bounds the probe, the same way {@code USER_DIRECTORY_LOOKUP}
     * bounds the person lookup.</p>
     */
    public static final String AUDIT_ORIGIN_PROBED = "AUDIT_ORIGIN_PROBED";

    // --- account, locales and municipal operation (CONTRACT.md "v0.3") --------------------------
    public static final String USER_EMAIL_CHANGE_REQUESTED = "USER_EMAIL_CHANGE_REQUESTED";
    public static final String USER_EMAIL_CHANGED = "USER_EMAIL_CHANGED";
    public static final String TENANT_LOCALES_UPDATED = "TENANT_LOCALES_UPDATED";
    public static final String TENANT_BRANDING_UPDATED = "TENANT_BRANDING_UPDATED";
    public static final String PARKING_SPACE_FORMAT_UPDATED = "PARKING_SPACE_FORMAT_UPDATED";
    public static final String PARKING_SCHEDULE_UPDATED = "PARKING_SCHEDULE_UPDATED";
    /**
     * A zone was given rules of its own, or put back to following the municipality (v0.31).
     *
     * <p>Audited apart from the municipality's policy because it answers a different question: "why
     * did this zone charge until ten when the rest of the canton stopped at six" is asked about one
     * zone, and the entry names it.</p>
     */
    public static final String PARKING_ZONE_RULES_UPDATED = "PARKING_ZONE_RULES_UPDATED";

    // --- enforcement (CONTRACT.md "v0.7"): every act on a citation is traceable, and the citation
    // also keeps its own history in citation_events, which is part of the act and not a log -------
    public static final String CITATION_DRAFTED = "CITATION_DRAFTED";
    public static final String CITATION_ISSUED = "CITATION_ISSUED";
    public static final String CITATION_EVIDENCE_ATTACHED = "CITATION_EVIDENCE_ATTACHED";
    public static final String CITATION_STATUS_CHANGED = "CITATION_STATUS_CHANGED";
    public static final String CITATION_CANCELLED = "CITATION_CANCELLED";
    /**
     * The citizen paid a citation from their wallet (CONTRACT.md v0.41).
     *
     * <p>Its own action rather than a {@code CITATION_STATUS_CHANGED}: this is the one transition a
     * citizen performs on an administrative act, and "who moved this to PAID, and was an appeal
     * closed by it" is the question somebody asks months later.</p>
     */
    public static final String CITATION_PAID = "CITATION_PAID";
    public static final String INFRACTION_TYPES_UPDATED = "INFRACTION_TYPES_UPDATED";

    /**
     * A citation raised in another system was mirrored here (CONTRACT.md v0.34).
     *
     * <p>Recorded on a repeat as well as on a first delivery. "The other system re-sent this one four
     * hundred times" is a real finding about an integration, and a trail that only wrote down first
     * deliveries could not show it.</p>
     */
    public static final String CITATION_INGESTED = "CITATION_INGESTED";

    /** A foreign causal was pointed at one of the municipality's own (v0.34). */
    public static final String EXTERNAL_CAUSAL_MAPPED = "EXTERNAL_CAUSAL_MAPPED";

    // --- payments and reconciliation (CONTRACT.md v0.35) -----------------------------------------
    /**
     * A provider's statement was imported and matched (v0.35).
     *
     * <p>The entry carries the <b>findings</b> and not only the fact that somebody imported
     * something: "who imported the statement where forty payments went missing" is a question asked
     * three months later, and it has to be answerable without re-running the reconciliation.</p>
     */
    public static final String SETTLEMENT_IMPORTED = "SETTLEMENT_IMPORTED";

    /** The municipality is claiming against a statement, so it stops counting as settled income. */
    public static final String SETTLEMENT_DISPUTED = "SETTLEMENT_DISPUTED";

    // --- appeals, notices and wallet top-ups (CONTRACT.md "v0.8") -------------------------------
    public static final String CITATION_APPEAL_FILED = "CITATION_APPEAL_FILED";
    public static final String CITATION_APPEAL_RESOLVED = "CITATION_APPEAL_RESOLVED";
    public static final String APPEAL_NOTICE_PUBLISHED = "APPEAL_NOTICE_PUBLISHED";
    public static final String ENFORCEMENT_SETTINGS_UPDATED = "ENFORCEMENT_SETTINGS_UPDATED";
    public static final String WALLET_TOPUP_RECORDED = "WALLET_TOPUP_RECORDED";
    public static final String WALLET_TOPUP_CODE_ROTATED = "WALLET_TOPUP_CODE_ROTATED";
    public static final String WALLET_TOPUP_CODE_RESOLVED = "WALLET_TOPUP_CODE_RESOLVED";
}
