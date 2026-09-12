package cr.luparx.notification.model;

/**
 * What a notification is <em>about</em>, at the grain the citizen chooses by.
 *
 * <p>This is the unit of the email preference and nothing else. It is deliberately coarse: a person
 * deciding what reaches their inbox is answering "do I want to hear about my fines", not "do I want
 * `CITATION_ISSUED` but not `APPEAL_RESOLVED`". A preference screen with one switch per event type
 * is a screen nobody finishes reading, and the switches nobody read are the ones that end up wrong.</p>
 *
 * <p>Adding a category is a row in {@code notification_email_categories} and a translation, never a
 * migration — which is the reason that table exists instead of three boolean columns.</p>
 */
public enum NotificationCategory {

    /** Stays: about to run out, ran out. */
    PARKING,
    /** Citations and the appeals against them. */
    FINES,
    /** Money and saved minutes. */
    WALLET;

    /** The i18n key both the app and the email bundle resolve this by. */
    public String labelKey() {
        return "notification.category." + name();
    }
}
