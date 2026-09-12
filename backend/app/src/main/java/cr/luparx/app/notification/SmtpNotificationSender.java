package cr.luparx.app.notification;

import cr.luparx.app.config.MailProperties;
import cr.luparx.identity.port.NotificationSender;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * SMTP adapter for {@link NotificationSender}.
 *
 * <p>Subject and body are resolved from the message bundle with the recipient's locale — the domain
 * only ever passes a template key and a model (CONTRACT.md §7). A delivery failure is logged and
 * swallowed on purpose: a mail outage must not roll back a completed registration or password reset,
 * and the user can always request the message again.</p>
 *
 * <p>Only plain text is produced in v0.1; an HTML template engine is an extension point that does
 * not change this port.</p>
 */
@Component
public class SmtpNotificationSender implements NotificationSender {

    private static final Logger LOGGER = LoggerFactory.getLogger(SmtpNotificationSender.class);

    private final JavaMailSender mailSender;
    private final MessageSource messageSource;
    private final MailProperties mailProperties;

    public SmtpNotificationSender(JavaMailSender mailSender, MessageSource messageSource,
                                  MailProperties mailProperties) {
        this.mailSender = mailSender;
        this.messageSource = messageSource;
        this.mailProperties = mailProperties;
    }

    @Override
    public void send(String recipientEmail, Locale locale, String templateKey, Map<String, Object> model) {
        try {
            sendOrThrow(recipientEmail, locale, templateKey, model);
        } catch (MailException exception) {
            LOGGER.warn("Unable to deliver notification template={} to recipient (address not logged)",
                    templateKey, exception);
        }
    }

    @Override
    public void sendOrThrow(String recipientEmail, Locale locale, String templateKey, Map<String, Object> model) {
        Object[] arguments = orderedArguments(model);
        String subject = messageSource.getMessage(templateKey + ".subject", arguments, locale);
        String body = messageSource.getMessage(templateKey + ".body", arguments, locale);

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(mailProperties.fromAddress());
        message.setTo(recipientEmail);
        message.setSubject(subject);
        message.setText(body);
        mailSender.send(message);
    }

    /**
     * Message bundle placeholders are positional ({@code {0}}, {@code {1}}...). The model uses the
     * fixed keys below so the ordering is explicit and stable across languages.
     */
    private Object[] orderedArguments(Map<String, Object> model) {
        List<Object> arguments = new ArrayList<>();
        arguments.add(model.getOrDefault("name", ""));
        arguments.add(model.getOrDefault("link", ""));
        arguments.add(model.getOrDefault("tenant", ""));
        // Three more since v0.38, appended and never reordered: a notification message needs to name
        // the thing ({3} — a plate, a citation number), when ({4}) and how much ({5}). Existing
        // templates address {0}..{2} and are untouched by slots they do not mention.
        arguments.add(model.getOrDefault("detail", ""));
        arguments.add(model.getOrDefault("when", ""));
        arguments.add(model.getOrDefault("amount", ""));
        return arguments.toArray();
    }

    /** Front-end base URL of the portal the message belongs to, used to build the links inside it. */
    public String portalBaseUrl(String portalSlug) {
        Map<String, String> urls = mailProperties.baseUrls();
        if (urls == null) {
            return "";
        }
        return urls.getOrDefault(portalSlug, "");
    }
}
