package cr.luparx.notification.model;

/**
 * The facts this platform tells somebody about.
 *
 * <p>Decía «a citizen» y desde el 06-10-2026 ya no es cierto: los cinco últimos valores son para
 * quien trabaja PARA una municipalidad. La tabla, el servicio y el relay nunca fueron del ciudadano
 * —`notifications` siempre tuvo `user_id` y nada más— así que lo único que había de ciudadano era
 * este vocabulario, las categorías y el controlador.</p>
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
    TIME_CREDITS_EXPIRING(NotificationCategory.WALLET, NotificationSubjectType.TIME_CREDIT),

    // --- Lo que se le dice a quien trabaja para la municipalidad (06-10-2026) --------------------
    //
    // Cinco hechos que YA se registran y que hasta hoy no se le contaban a la persona a la que le
    // pasaron: quedaban en la bitácora de auditoría, que es para quien audita, no para quien trabaja.

    /**
     * Un supervisor anuló una boleta que esta persona levantó.
     *
     * <p>Se le dice a quien la EMITIÓ, no a quien la anuló. Es lo primero que un fiscalizador necesita
     * saber de su propio trabajo, y la separación de funciones garantiza que nunca sean la misma
     * persona: `PERM_CITATION_VOID` lo tienen el administrador y el jefe de fiscalización, y quien
     * escribió la boleta no puede anularla.</p>
     */
    CITATION_VOIDED(NotificationCategory.WORK, NotificationSubjectType.CITATION),

    /** Su puesto en esta municipalidad quedó desactivado. El motivo, si lo hubo, va en los parámetros. */
    POST_SUSPENDED(NotificationCategory.WORK, NotificationSubjectType.MEMBERSHIP),
    /** Le restablecieron el acceso: el puesto vuelve a estar activo. */
    POST_REACTIVATED(NotificationCategory.WORK, NotificationSubjectType.MEMBERSHIP),
    /** Le cambiaron el rol. El anterior y el nuevo van en los parámetros, porque la pregunta es «de qué a qué». */
    POST_ROLE_CHANGED(NotificationCategory.WORK, NotificationSubjectType.MEMBERSHIP),
    /** Le reasignaron los sectores en los que puede trabajar. */
    POST_ZONES_CHANGED(NotificationCategory.WORK, NotificationSubjectType.MEMBERSHIP);

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
