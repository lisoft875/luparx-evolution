package cr.luparx.notification.model;

/**
 * The facts this platform tells a citizen about.
 *
 * <p>An enum and not a free string, because every one of these has to have a translation on three
 * sides — the app, the email subject and the email body — and a typed vocabulary is what makes a
 * missing one a compile-time or startup problem rather than a citizen reading
 * {@code notification.type.WALLET_TOPUP_CREDITEED} on their phone. That defect has already happened
 * once here with {@code error.exemption.*} in v0.28.</p>
 *
 * <p>Each value carries its category (what the citizen switched on or off) and its subject type
 * (where the row navigates to). Both live on the type rather than being passed in by every caller:
 * a producer that could choose them would eventually choose them inconsistently, and the email
 * preference would silently stop matching what the person ticked.</p>
 */
public enum NotificationType {

    /** The stay runs out shortly. The one notification that is worth anything before the fact. */
    PARKING_SESSION_EXPIRING(NotificationCategory.PARKING, NotificationSubjectType.PARKING_SESSION),
    /** The clock ran out, tolerance included. */
    PARKING_SESSION_EXPIRED(NotificationCategory.PARKING, NotificationSubjectType.PARKING_SESSION),

    /** A fiscalizador issued a citation against a plate this person registered. */
    CITATION_ISSUED(NotificationCategory.FINES, NotificationSubjectType.CITATION),
    /** The municipality accepted or rejected their appeal; which one is in the parameters. */
    APPEAL_RESOLVED(NotificationCategory.FINES, NotificationSubjectType.CITATION),

    /** A counter top-up reached their wallet. */
    WALLET_TOPUP_CREDITED(NotificationCategory.WALLET, NotificationSubjectType.WALLET_TRANSACTION),
    /** Saved minutes are about to lapse. Worth saying only while they can still be spent. */
    TIME_CREDITS_EXPIRING(NotificationCategory.WALLET, NotificationSubjectType.TIME_CREDIT);

    private final NotificationCategory category;
    private final NotificationSubjectType subjectType;

    NotificationType(NotificationCategory category, NotificationSubjectType subjectType) {
        this.category = category;
        this.subjectType = subjectType;
    }

    public NotificationCategory category() {
        return category;
    }

    public NotificationSubjectType subjectType() {
        return subjectType;
    }

    /** The key the app renders the line with. */
    public String labelKey() {
        return "notification.type." + name();
    }

    /** The prefix the mail bundle resolves {@code .subject} and {@code .body} from. */
    public String emailTemplateKey() {
        return "email.notification." + name();
    }
}
