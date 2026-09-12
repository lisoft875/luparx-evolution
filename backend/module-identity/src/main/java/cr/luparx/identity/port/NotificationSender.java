package cr.luparx.identity.port;

import java.util.Locale;
import java.util.Map;

/**
 * Output port for transactional messages (email today, push/SMS later). The domain passes an i18n
 * template key and its model — never a rendered body — so the same event can be delivered in the
 * recipient's language through any channel (CONTRACT.md §7).
 *
 * <p>The SMTP adapter lives in the {@code app} module.</p>
 */
public interface NotificationSender {

    /**
     * @param recipientEmail destination address
     * @param locale         the recipient's resolved locale
     * @param templateKey    i18n key of the message template, e.g. {@code email.verifyEmail}
     * @param model          template variables (never secrets beyond the one-time token itself)
     */
    void send(String recipientEmail, Locale locale, String templateKey, Map<String, Object> model);

    /**
     * The same message, but a delivery failure reaches the caller.
     *
     * <p>{@link #send} swallows failures on purpose — a mail outage must not roll back a completed
     * registration, and the person can ask for the message again. That is the right trade for a
     * message somebody is waiting for with a screen open.</p>
     *
     * <p>It is the wrong trade for a message nobody asked for and nobody is waiting on: a stay that
     * ran out is not re-triggerable, so a swallowed failure there is a notice that silently never
     * existed. A caller with a retry queue behind it uses this one and decides for itself (v0.38).</p>
     */
    void sendOrThrow(String recipientEmail, Locale locale, String templateKey, Map<String, Object> model);
}
