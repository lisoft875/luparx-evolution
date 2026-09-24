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


    // --- geometry (CONTRACT.md v0.40, ADR 0024) -------------------------------------------------
    /**
     * The geometry is not a usable Polygon or MultiPolygon: a Feature instead of a geometry, an
     * unclosed ring, a coordinate out of range, or a polygon PostGIS refuses as invalid. One code
     * for all of it, with the offending field or PostGIS's own reason in the body — the client's
     * next action is the same in every case, which is to fix the drawing.
     */
    public static final String INVALID_GEOMETRY = "INVALID_GEOMETRY";
    /** Well formed and valid, but larger than this deployment serves (`luparx.geo.max-zone-vertices`). */
    public static final String GEOMETRY_TOO_COMPLEX = "GEOMETRY_TOO_COMPLEX";

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
    /**
     * Somebody tried to end their own post in this municipality.
     *
     * <p>Its own code and not a plain 403 because the caller is not doing something they lack
     * permission for — they have exactly the permission this needs. The refusal is about the target
     * being themselves, and the panel has to be able to say that instead of "no tiene permiso",
     * which would be a lie.</p>
     *
     * <p>Why it is refused at all: revoking your own post takes away, in the same request, the
     * permission needed to undo it. The panel then refreshes a list it may no longer read, keeps
     * showing the stale row, and the next reload lands on "no municipalities". An administrator
     * cannot lock themselves out with one click of a button that gives no warning.</p>
     */
    public static final String MEMBERSHIP_SELF_MODIFICATION_DENIED = "MEMBERSHIP_SELF_MODIFICATION_DENIED";

    // --- staff invitations (CONTRACT.md v0.27) ----------------------------------------------------
    /**
     * No usable invitation behind that link. Deliberately also the answer for a <em>revoked</em>
     * one: a municipality that called an invitation back owes the holder of the link no account of
     * why, and distinguishing the two would confirm that the address had been invited at all.
     */
    public static final String INVITATION_NOT_FOUND = "INVITATION_NOT_FOUND";
    /**
     * The link ran out of time. Told apart from {@link #INVITATION_NOT_FOUND} because the person can
     * do something about it — ask for it to be sent again — and a bare "not found" would send them
     * looking for a mistake they did not make.
     */
    public static final String INVITATION_EXPIRED = "INVITATION_EXPIRED";
    /** Already used. Usually the same person clicking the old mail after signing up; say so plainly. */
    public static final String INVITATION_ALREADY_ACCEPTED = "INVITATION_ALREADY_ACCEPTED";
    /** Re-sending or revoking something that is no longer live. */
    public static final String INVITATION_NOT_PENDING = "INVITATION_NOT_PENDING";

    // --- plate exemptions (CONTRACT.md v0.28) -----------------------------------------------------
    public static final String EXEMPTION_NOT_FOUND = "EXEMPTION_NOT_FOUND";
    /**
     * The plate already carries a live exemption in this municipality. Refused rather than given a
     * second one: two live rows mean revoking the one an operator can see leaves the other exempting,
     * and nobody complains about a fine that was never issued.
     */
    public static final String EXEMPTION_ALREADY_EXISTS = "EXEMPTION_ALREADY_EXISTS";
    /** Amending something already called back. Revoked is the end of the row, not a state to edit. */
    public static final String EXEMPTION_NOT_ACTIVE = "EXEMPTION_NOT_ACTIVE";

    // --- permits: categories, decisions, documents (CONTRACT.md v0.30) ----------------------------
    /** The category asked for does not belong to this municipality, or does not exist at all. */
    public static final String EXEMPTION_TYPE_NOT_FOUND = "EXEMPTION_TYPE_NOT_FOUND";
    /**
     * The category was retired. Told apart from "not found" so the screen can refresh its catalogue
     * instead of showing the operator a dead end on a category they can still see in old permits.
     */
    public static final String EXEMPTION_TYPE_INACTIVE = "EXEMPTION_TYPE_INACTIVE";
    /** Two categories of one municipality cannot share a code; it is what a future rule would match. */
    public static final String EXEMPTION_TYPE_CODE_TAKEN = "EXEMPTION_TYPE_CODE_TAKEN";
    /**
     * Deciding something that is not waiting for a decision — approving twice, rejecting what was
     * already revoked. Said with its own code because the honest answer is "somebody got there first".
     */
    public static final String EXEMPTION_NOT_PENDING = "EXEMPTION_NOT_PENDING";
    /** Adding or removing a plate on a permit that is closed. A refusal or a revocation is not edited. */
    public static final String EXEMPTION_NOT_EDITABLE = "EXEMPTION_NOT_EDITABLE";
    /** A permit has to cover at least one plate; the last one is not removable. */
    public static final String EXEMPTION_LAST_PLATE = "EXEMPTION_LAST_PLATE";
    /** As many plates as one permit may cover. A permit for a whole fleet is a policy, not a permit. */
    public static final String EXEMPTION_PLATE_LIMIT = "EXEMPTION_PLATE_LIMIT";
    public static final String EXEMPTION_DOCUMENT_NOT_FOUND = "EXEMPTION_DOCUMENT_NOT_FOUND";
    /** As many backing documents as one permit may carry. */
    public static final String EXEMPTION_DOCUMENT_LIMIT = "EXEMPTION_DOCUMENT_LIMIT";
    public static final String TENANT_SETTING_INVALID = "TENANT_SETTING_INVALID";
    /**
     * The municipality does not admit citizens on request, so switching to it could not create the
     * membership that would have been needed. Distinct from {@link #MEMBERSHIP_NOT_ACTIVE}, which is
     * about a membership this person already has, and from a bare {@link #ACCESS_DENIED}, which would
     * tell them nothing about what to do next.
     */
    public static final String TENANT_NOT_OPEN_TO_CITIZENS = "TENANT_NOT_OPEN_TO_CITIZENS";

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
    /**
     * A stay is already running on this plate in this municipality, and one of the two was opened
     * with a plate typed on the spot (CONTRACT.md v0.11) — so it is the same physical car, and
     * paying twice for it is a mistake rather than a coincidence of two citizens sharing a plate.
     */
    public static final String SESSION_ALREADY_ACTIVE_FOR_PLATE = "SESSION_ALREADY_ACTIVE_FOR_PLATE";

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
    /** Another zone of this municipality already answers to that code (CONTRACT.md v0.16). */
    public static final String PARKING_ZONE_CODE_TAKEN = "PARKING_ZONE_CODE_TAKEN";
    /**
     * The whole requested stay falls outside the municipality's charging hours. The next band is
     * readable from {@code GET /citizen/parking/schedule}.
     */
    public static final String OUTSIDE_CHARGING_HOURS = "OUTSIDE_CHARGING_HOURS";

    // --- enforcement (CONTRACT.md "v0.7 — Fiscalización") ---------------------------------------
    /** No citation with that identifier in the caller's municipality. Also the answer for one that
     * exists in another municipality: confirming it would leak that it exists. */
    /**
     * The officer's post does not cover the sector the act was raised in (CONTRACT.md v0.15). An
     * officer with no sectors assigned covers the whole municipality and never sees this.
     */
    public static final String ZONE_NOT_ASSIGNED = "ZONE_NOT_ASSIGNED";
    public static final String CITATION_NOT_FOUND = "CITATION_NOT_FOUND";
    /** The citation cannot move from the state it is in to the one asked for (CitationStatus). */
    public static final String CITATION_INVALID_TRANSITION = "CITATION_INVALID_TRANSITION";
    /** The infraction type demands a photograph and the citation has none, so it cannot be issued. */
    public static final String CITATION_EVIDENCE_REQUIRED = "CITATION_EVIDENCE_REQUIRED";
    /** The citation is closed: nothing may be attached to it or changed on it any more. */
    public static final String CITATION_NOT_EDITABLE = "CITATION_NOT_EDITABLE";
    /** This kind of infraction does not admit a defence, by the municipality's own configuration. */
    public static final String CITATION_APPEAL_NOT_ALLOWED = "CITATION_APPEAL_NOT_ALLOWED";

    /**
     * The citation was raised in another system and this platform is only mirroring it
     * (CONTRACT.md v0.34).
     *
     * <p>Its own code and not a generic conflict, because the answer a person needs is specific and
     * actionable: this is not "you may not", it is "not here — the municipality manages this one in
     * its other system". A client that cannot tell those apart sends the citizen to argue with the
     * wrong window.</p>
     */
    public static final String CITATION_NOT_MANAGED_HERE = "CITATION_NOT_MANAGED_HERE";
    /**
     * The citation is not in a state that can be paid (v0.41).
     *
     * <p>Already paid, annulled, or voided by an accepted appeal. Told apart from a validation error
     * because nothing about the request is wrong: the world moved, usually while the screen was open.
     */
    public static final String CITATION_NOT_PAYABLE = "CITATION_NOT_PAYABLE";
    /**
     * Somebody else filed the appeal that is still waiting on this citation (v0.41).
     *
     * <p>Two citizens may each have registered the same plate (CONTRACT.md v0.2, rule 2), so both see
     * the citation. Paying withdraws the appeal, and withdrawing <b>somebody else's</b> defence is not
     * something a payment may do quietly. The payment is refused instead.</p>
     */
    public static final String APPEAL_BY_ANOTHER_CITIZEN = "APPEAL_BY_ANOTHER_CITIZEN";

    /** An ingest tried to rewrite the act itself — plate, causal, place or moment (v0.34). */
    public static final String CITATION_EXTERNAL_IMMUTABLE = "CITATION_EXTERNAL_IMMUTABLE";

    // --- payments and reconciliation (CONTRACT.md v0.35) -----------------------------------------
    public static final String PAYMENT_NOT_FOUND = "PAYMENT_NOT_FOUND";
    /** The attempt cannot move that way — capturing a failure, failing a capture. */
    public static final String PAYMENT_INVALID_TRANSITION = "PAYMENT_INVALID_TRANSITION";
    public static final String SETTLEMENT_NOT_FOUND = "SETTLEMENT_NOT_FOUND";
    /**
     * That statement is already here.
     *
     * <p>Refused rather than merged: a provider that corrects a statement issues another one, and
     * overwriting the first would erase the evidence that it was corrected.</p>
     */
    public static final String SETTLEMENT_ALREADY_IMPORTED = "SETTLEMENT_ALREADY_IMPORTED";
    public static final String INFRACTION_TYPE_NOT_FOUND = "INFRACTION_TYPE_NOT_FOUND";
    /** The kind exists but the municipality retired it, so no new citation may be written under it. */
    public static final String INFRACTION_TYPE_INACTIVE = "INFRACTION_TYPE_INACTIVE";
    public static final String EVIDENCE_NOT_FOUND = "EVIDENCE_NOT_FOUND";
    public static final String EVIDENCE_TOO_LARGE = "EVIDENCE_TOO_LARGE";
    /** The file is not one of the image types the platform accepts, judged by its own header. */
    public static final String EVIDENCE_TYPE_NOT_ALLOWED = "EVIDENCE_TYPE_NOT_ALLOWED";
    public static final String EVIDENCE_LIMIT_REACHED = "EVIDENCE_LIMIT_REACHED";

    // --- notifications (CONTRACT.md "v0.38") ----------------------------------------------------
    /**
     * No such notice for this person in this municipality.
     *
     * <p>The same answer whether the row does not exist or belongs to somebody else. Telling those
     * two apart would turn the id into an oracle for "does this notification exist", which is the
     * shape of every BOLA finding (SECURITY.md §4).</p>
     */
    public static final String NOTIFICATION_NOT_FOUND = "NOTIFICATION_NOT_FOUND";

    // --- appeals and wallet top-ups (CONTRACT.md "v0.8") ----------------------------------------
    /** The municipality has published no legal notice, so it cannot accept defences yet. */
    public static final String APPEAL_NOTICE_NOT_FOUND = "APPEAL_NOTICE_NOT_FOUND";
    /**
     * The citizen accepted a version of the notice that is no longer the one in force. Recording it
     * as consent would make the notice worthless the day it matters, so the client re-displays the
     * current wording instead.
     */
    public static final String APPEAL_NOTICE_OUTDATED = "APPEAL_NOTICE_OUTDATED";
    public static final String APPEAL_NOT_FOUND = "APPEAL_NOT_FOUND";
    public static final String APPEAL_ALREADY_FILED = "APPEAL_ALREADY_FILED";
    public static final String APPEAL_ALREADY_RESOLVED = "APPEAL_ALREADY_RESOLVED";
    /** The citation is settled or past its date: the channel is now the counter, not the app. */
    public static final String APPEAL_WINDOW_CLOSED = "APPEAL_WINDOW_CLOSED";
    /** What was typed is not a well-formed top-up code — the check character did not match. */
    public static final String TOPUP_CODE_INVALID = "TOPUP_CODE_INVALID";
    /** A well-formed code that belongs to nobody in this municipality. */
    public static final String TOPUP_CODE_NOT_FOUND = "TOPUP_CODE_NOT_FOUND";
    /** A payment with this external reference was already credited; the retry added nothing. */
    public static final String TOPUP_REFERENCE_ALREADY_USED = "TOPUP_REFERENCE_ALREADY_USED";
}
