package cr.luparx.app.job;

import cr.luparx.app.config.NotificationProperties;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.notification.model.NotificationType;
import cr.luparx.notification.service.NotificationService;
import cr.luparx.parking.entity.ParkingSession;
import cr.luparx.parking.model.ParkingSessionStatus;
import cr.luparx.parking.repository.ParkingSessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;

/**
 * "Your stay runs out in fifteen minutes", and then "it ran out" (CONTRACT.md v0.38).
 *
 * <h2>Por qué hace falta un job</h2>
 *
 * <p>Every other notification this platform sends has a request behind it: somebody issued a
 * citation, somebody paid. A stay running out has nobody. The countdown bar in the app already warns,
 * but only while the app is open and on that phone — which is precisely not where the citizen is when
 * their time is running out. Without this, the only reliable way to learn that a stay lapsed is the
 * citation on the windscreen.</p>
 *
 * <h2>Un solo barrido para las dos noticias</h2>
 *
 * <p>One window straddling now: ahead of it are the stays about to lapse, behind it the ones that
 * just did. Two jobs over the same table would double the reads to say two things about the same row,
 * and would have to agree with each other about the boundary.</p>
 *
 * <h2>Repetir es gratis</h2>
 *
 * <p>A stay expiring in fifteen minutes is in the window on this pass and on the next fourteen. The
 * job keeps no memory of whom it told; {@code uq_notifications_subject} does, in the database, where
 * every replica shares it. That is the difference between an idempotent job and a job that behaves
 * as long as it only ever runs on one instance (docs/ARCHITECTURE.md §7).</p>
 */
@Component
public class ParkingExpiryNotificationJob {

    private static final Logger LOGGER = LoggerFactory.getLogger(ParkingExpiryNotificationJob.class);
    private static final String JOB_NAME = "parking-expiry-notifications";

    /**
     * Ceiling on one pass.
     *
     * <p>Not a guess about volume: it bounds what a single transaction holds when a backend comes up
     * after being down, where the window is full rather than trickling. What does not fit is taken by
     * the next pass a minute later, still in order of expiry.</p>
     */
    private static final int BATCH = 200;

    /**
     * {@code FINISHED} is not here and that is the point: somebody who closed their stay early said
     * they were leaving. Telling them it "ran out" would be putting words in their mouth — the same
     * rule {@code recentlyExpiredStays} follows for the fiscalizador (v0.28).
     */
    private static final EnumSet<ParkingSessionStatus> WATCHED =
            EnumSet.of(ParkingSessionStatus.ACTIVE, ParkingSessionStatus.EXPIRED);

    private final ParkingSessionRepository sessions;
    private final NotificationService notifications;
    private final NotificationProperties properties;
    private final PlatformJobLock jobLock;
    private final Clock clock;

    public ParkingExpiryNotificationJob(ParkingSessionRepository sessions, NotificationService notifications,
                                        NotificationProperties properties, PlatformJobLock jobLock, Clock clock) {
        this.sessions = sessions;
        this.notifications = notifications;
        this.properties = properties;
        this.jobLock = jobLock;
        this.clock = clock;
    }

    /** Every minute: the smallest unit the sentence itself talks in. */
    @Scheduled(fixedDelayString = "PT1M", initialDelayString = "PT1M")
    public void run() {
        try {
            jobLock.runExclusively(JOB_NAME, this::sweep);
        } catch (RuntimeException failure) {
            LOGGER.error("Parking expiry notifications failed; the next pass covers the same window.", failure);
        }
    }

    private int sweep() {
        Instant now = clock.instant();
        Instant from = now.minus(Duration.ofMinutes(properties.sessionExpiredWithinOrDefault()));
        Instant to = now.plus(Duration.ofMinutes(properties.sessionExpiringBeforeOrDefault()));
        List<ParkingSession> window = sessions.findByStatusInAndExpiresAtBetweenOrderByExpiresAtAsc(
                WATCHED, from, to, PageRequest.of(0, BATCH));

        int written = 0;
        for (ParkingSession session : window) {
            NotificationType type = session.getExpiresAt().isAfter(now)
                    ? NotificationType.PARKING_SESSION_EXPIRING
                    : NotificationType.PARKING_SESSION_EXPIRED;
            // Raw values, named for what they are. The screen formats the plate and the time with the
            // citizen's own locale rules and the email does it again for the recipient's; storing a
            // rendered sentence would let the two drift.
            boolean recorded = notifications.record(
                    TenantId.of(session.getTenantId()),
                    UserId.of(session.getUserId()),
                    type,
                    session.getId(),
                    Map.of("plate", session.getPlateSnapshot(),
                            "spaceCode", session.getSpaceCodeSnapshot(),
                            "expiresAt", session.getExpiresAt().toString())).isPresent();
            if (recorded) {
                written++;
            }
        }
        if (written > 0) {
            LOGGER.info("Parking expiry notifications: {} written from a window of {}.",
                    Integer.valueOf(written), Integer.valueOf(window.size()));
        }
        return written;
    }
}
