package cr.luparx.app.job;

import cr.luparx.app.config.NotificationProperties;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.notification.model.NotificationType;
import cr.luparx.notification.service.NotificationService;
import cr.luparx.parking.entity.ParkingTimeCreditEntry;
import cr.luparx.parking.repository.ParkingTimeCreditEntryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * "The minutes you saved lapse on Thursday" (CONTRACT.md v0.38).
 *
 * <p>Saved minutes are the one balance on this platform that can disappear without anybody spending
 * it. A citizen who finished a stay early was promised the remainder back, and a promise that quietly
 * runs out is worse than not having made it — this is the message that lets them decide to use it.</p>
 *
 * <p>Per <b>lot</b> and not per balance: {@code ParkingTimeCreditEntry} is what carries an expiry, a
 * person may hold several with different dates, and the id of the lot is what makes the notice
 * idempotent. A notice about "your balance" would have no stable subject and would either repeat
 * daily or need the job to remember something.</p>
 *
 * <p>Daily, not per minute. A date three days out does not move, and a person who is told about it
 * every hour learns to ignore the sender.</p>
 */
@Component
public class TimeCreditExpiryNotificationJob {

    private static final Logger LOGGER = LoggerFactory.getLogger(TimeCreditExpiryNotificationJob.class);
    private static final String JOB_NAME = "time-credit-expiry-notifications";
    private static final int BATCH = 200;

    private final ParkingTimeCreditEntryRepository entries;
    private final NotificationService notifications;
    private final NotificationProperties properties;
    private final PlatformJobLock jobLock;
    private final Clock clock;

    public TimeCreditExpiryNotificationJob(ParkingTimeCreditEntryRepository entries,
                                           NotificationService notifications,
                                           NotificationProperties properties, PlatformJobLock jobLock,
                                           Clock clock) {
        this.entries = entries;
        this.notifications = notifications;
        this.properties = properties;
        this.jobLock = jobLock;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "PT12H", initialDelayString = "PT5M")
    public void run() {
        try {
            jobLock.runExclusively(JOB_NAME, this::sweep);
        } catch (RuntimeException failure) {
            LOGGER.error("Time-credit expiry notifications failed; the next pass covers the same window.",
                    failure);
        }
    }

    private int sweep() {
        Instant now = clock.instant();
        Instant to = now.plus(Duration.ofDays(properties.timeCreditsExpiringBeforeOrDefault()));
        List<ParkingTimeCreditEntry> expiring = entries.findExpiringLots(now, to, PageRequest.of(0, BATCH));

        int written = 0;
        for (ParkingTimeCreditEntry entry : expiring) {
            boolean recorded = notifications.record(
                    TenantId.of(entry.getTenantId()),
                    UserId.of(entry.getUserId()),
                    NotificationType.TIME_CREDITS_EXPIRING,
                    entry.getId(),
                    Map.of("minutes", Integer.valueOf(entry.getRemainingMinutes()),
                            "expiresAt", entry.getExpiresAt().toString())).isPresent();
            if (recorded) {
                written++;
            }
        }
        if (written > 0) {
            LOGGER.info("Time-credit expiry notifications: {} written from {} lapsing lots.",
                    Integer.valueOf(written), Integer.valueOf(expiring.size()));
        }
        return written;
    }
}
