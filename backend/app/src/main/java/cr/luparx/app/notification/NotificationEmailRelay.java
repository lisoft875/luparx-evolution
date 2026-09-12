package cr.luparx.app.notification;

import cr.luparx.app.config.NotificationProperties;
import cr.luparx.app.job.PlatformJobLock;
import cr.luparx.app.outbox.OutboxEventEntity;
import cr.luparx.app.outbox.OutboxEventRepository;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.domain.Portal;
import cr.luparx.core.id.UserId;
import cr.luparx.core.outbox.OutboxEventType;
import cr.luparx.notification.entity.Notification;
import cr.luparx.notification.port.RecipientDirectory;
import cr.luparx.notification.repository.NotificationRepository;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.service.TenantService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.FormatStyle;
import java.util.Currency;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The outbox relay — and the first consumer {@code outbox_events} has ever had.
 *
 * <p>The table has existed since V1_0 and has been accumulating rows nobody published: the pattern
 * was in place, the half that delivers was not. This is that half, for one type. It claims only
 * {@link OutboxEventType#NOTIFICATION_EMAIL_REQUESTED}, deliberately — a relay that swept every row
 * would treat two years of unconsumed parking and identity events as a backlog to deliver.</p>
 *
 * <h2>Por qué el correo pasa por aquí y la campana no</h2>
 *
 * <p>The notification row is state of this database, so it is written in the transaction of the fact
 * that caused it and cannot disagree with it. The email leaves, so it gets the outbox: written in the
 * same transaction, delivered afterwards, retried when the mail server is down (ADR 0012). That split
 * is what makes "the bell is always right" independent of "SMTP was unreachable at 3am".</p>
 *
 * <h2>El mensaje se arma al enviar, no al encolar</h2>
 *
 * <p>The queued event carries one field: the notification's id. Address, language, municipality name
 * and every number in the sentence are read here, now. Somebody who changes their address or their
 * language between the stay running out and this pass gets the message the way they would expect —
 * and no address ever sits in a queue table (SECURITY.md §11).</p>
 */
@Component
public class NotificationEmailRelay {

    private static final Logger LOGGER = LoggerFactory.getLogger(NotificationEmailRelay.class);
    private static final String JOB_NAME = "notification-email-relay";

    private final OutboxEventRepository outbox;
    private final NotificationRepository notifications;
    private final RecipientDirectory recipients;
    /**
     * The concrete SMTP adapter and not the {@code NotificationSender} port, because this relay needs
     * both halves of it: the throwing send, and the portal base URL the message links to. Every other
     * caller that builds a link injects it the same way.
     */
    private final SmtpNotificationSender sender;
    private final TenantService tenantService;
    private final NotificationProperties properties;
    private final PlatformJobLock jobLock;
    private final Clock clock;

    public NotificationEmailRelay(OutboxEventRepository outbox, NotificationRepository notifications,
                                  RecipientDirectory recipients, SmtpNotificationSender sender,
                                  TenantService tenantService,
                                  NotificationProperties properties, PlatformJobLock jobLock, Clock clock) {
        this.outbox = outbox;
        this.notifications = notifications;
        this.recipients = recipients;
        this.sender = sender;
        this.tenantService = tenantService;
        this.properties = properties;
        this.jobLock = jobLock;
        this.clock = clock;
    }

    /**
     * Every minute.
     *
     * <p>A minute is the resolution a person can tell apart from "immediately" for a message that
     * arrives in an inbox, and it costs one indexed read on a quiet platform. Only one instance runs
     * it: every replica shares the schedule, and two relays taking the same batch would send the same
     * message twice — the failure mode a queue exists to prevent.</p>
     */
    @Scheduled(fixedDelayString = "PT1M", initialDelayString = "PT30S")
    public void run() {
        try {
            jobLock.runExclusively(JOB_NAME, this::deliverBatch);
        } catch (RuntimeException failure) {
            // Swallowed so the scheduler survives. Nothing is lost: rows that were not published stay
            // pending, with their attempt count, and the next pass takes them again.
            LOGGER.error("Notification email relay failed; pending rows stay queued.", failure);
        }
    }

    private int deliverBatch() {
        Instant now = clock.instant();
        List<OutboxEventEntity> due = outbox.findDue(OutboxEventType.NOTIFICATION_EMAIL_REQUESTED, now,
                PageRequest.of(0, properties.relayBatchSizeOrDefault()));
        int sent = 0;
        for (OutboxEventEntity event : due) {
            if (deliver(event, now)) {
                sent++;
            }
        }
        if (sent > 0) {
            LOGGER.info("Notification email relay: {} of {} due messages delivered.",
                    Integer.valueOf(sent), Integer.valueOf(due.size()));
        }
        return sent;
    }

    private boolean deliver(OutboxEventEntity event, Instant now) {
        Optional<Notification> found = notificationOf(event);
        if (found.isEmpty()) {
            // The notification is gone. Nothing to send and nothing to retry, so the row leaves the
            // queue as published rather than being retried eight times against a row that will never
            // come back.
            event.markPublished(now);
            return false;
        }
        Notification notification = found.get();
        Optional<RecipientDirectory.Recipient> recipient =
                recipients.find(UserId.of(notification.getUserId()));
        if (recipient.isEmpty()) {
            // No usable address is a fact about the person, not a transient failure: retrying cannot
            // change it. The bell still shows the notice, which is the part that was promised.
            event.markPublished(now);
            return false;
        }
        try {
            RecipientDirectory.Recipient to = recipient.get();
            sender.sendOrThrow(to.email(), to.locale(), notification.getType().emailTemplateKey(),
                    model(notification, to));
            event.markPublished(now);
            return true;
        } catch (RuntimeException failure) {
            // sendOrThrow exists for exactly this line: the swallowing variant would have made a mail
            // outage look like a delivered message.
            event.markAttemptFailed(now, failure.getMessage(), properties.relayMaxAttemptsOrDefault(),
                    Duration.ofMinutes(properties.relayBackoffCeilingOrDefault()));
            if (event.getFailedAt() != null) {
                LOGGER.warn("Giving up on notification email after {} attempts (recipient not logged): {}",
                        Integer.valueOf(event.getAttempts()), failure.getMessage());
            }
            return false;
        }
    }

    private Optional<Notification> notificationOf(OutboxEventEntity event) {
        Object id = event.getPayload() == null ? null : event.getPayload().get("notificationId");
        if (id == null) {
            return Optional.empty();
        }
        try {
            return notifications.findById(UUID.fromString(id.toString()));
        } catch (IllegalArgumentException malformed) {
            return Optional.empty();
        }
    }

    /**
     * The bundle's positional model.
     *
     * <p>The parameters stored on the notification are raw — a plate, an ISO instant, minor units —
     * because the app formats them with its own locale rules. Here they are formatted once more, for
     * this recipient's language and this municipality's time zone. Two formatters, one set of facts:
     * the alternative is storing a rendered string and having the email and the screen drift.</p>
     */
    private Map<String, Object> model(Notification notification, RecipientDirectory.Recipient to) {
        Tenant tenant = tenantService.require(TenantId.of(notification.getTenantId()));
        Map<String, Object> params = notification.getParams();

        Map<String, Object> model = new HashMap<>();
        model.put("name", to.displayName() == null ? "" : to.displayName());
        model.put("link", sender.portalBaseUrl(Portal.CITIZEN.slug()));
        model.put("tenant", tenant.getDisplayName() == null ? "" : tenant.getDisplayName());
        // The parameters are named for what they ARE — a plate, a citation number, an expiry — and
        // mapped onto the bundle's positional slots here. Storing them under "detail" and "when" to
        // save this method would make the rows unreadable to the screen, which needs to know which
        // number is a plate and which is a count of minutes.
        model.put("detail", text(firstOf(params, "plate", "citationNumber", "minutes")));
        model.put("when", when(firstOf(params, "expiresAt", "dueAt"), tenant.getTimeZone(), to.locale()));
        model.put("amount", amount(params.get("amountMinor"), params.get("currencyCode"), to.locale()));
        return model;
    }

    private static Object firstOf(Map<String, Object> params, String... keys) {
        for (String key : keys) {
            Object value = params.get(key);
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private static String text(Object value) {
        return value == null ? "" : value.toString();
    }

    /** An ISO instant in the municipality's own clock, which is the only one the citizen was standing in. */
    private static String when(Object value, String timeZone, Locale locale) {
        if (value == null) {
            return "";
        }
        try {
            ZoneId zone = timeZone == null || timeZone.isBlank() ? ZoneId.of("UTC") : ZoneId.of(timeZone);
            return DateTimeFormatter.ofLocalizedDateTime(FormatStyle.SHORT)
                    .withLocale(locale)
                    .withZone(zone)
                    .format(Instant.parse(value.toString()));
        } catch (RuntimeException unparseable) {
            // A parameter that is not an instant is a producer's bug, not a reason to fail delivery:
            // the rest of the sentence is still worth sending.
            return "";
        }
    }

    private static String amount(Object minor, Object currencyCode, Locale locale) {
        if (minor == null || currencyCode == null) {
            return "";
        }
        try {
            Currency currency = Currency.getInstance(currencyCode.toString());
            java.text.NumberFormat format = java.text.NumberFormat.getCurrencyInstance(locale);
            format.setCurrency(currency);
            int digits = Math.max(0, currency.getDefaultFractionDigits());
            format.setMinimumFractionDigits(digits);
            format.setMaximumFractionDigits(digits);
            return format.format(java.math.BigDecimal.valueOf(Long.parseLong(minor.toString()))
                    .movePointLeft(digits));
        } catch (RuntimeException unformattable) {
            return "";
        }
    }
}
