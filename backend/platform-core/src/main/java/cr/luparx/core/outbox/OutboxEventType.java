package cr.luparx.core.outbox;

/** Canonical outbox {@code type} values (aggregate-scoped, past tense). */
public final class OutboxEventType {

    private OutboxEventType() {
    }

    public static final String USER_REGISTERED = "identity.user.registered";
    public static final String USER_EMAIL_VERIFIED = "identity.user.email-verified";
    public static final String USER_BLOCKED = "identity.user.blocked";
    public static final String MEMBERSHIP_APPROVED = "tenancy.membership.approved";
    public static final String MEMBERSHIP_REVOKED = "tenancy.membership.revoked";
    public static final String TENANT_CREATED = "tenancy.tenant.created";
    public static final String TENANT_STATUS_CHANGED = "tenancy.tenant.status-changed";
}
