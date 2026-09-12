package cr.luparx.notification.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.outbox.OutboxEvent;
import cr.luparx.core.outbox.OutboxEventPublisher;
import cr.luparx.core.outbox.OutboxEventType;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.notification.entity.Notification;
import cr.luparx.notification.model.NotificationType;
import cr.luparx.notification.repository.NotificationRepository;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Telling a citizen something, once.
 *
 * <h2>Idempotente por diseño, no por disciplina</h2>
 *
 * <p>{@link #record} is safe to call as often as anything likes for the same fact. The scheduled jobs
 * depend on that completely: "every stay running out in the next fifteen minutes" is a query that
 * answers the same rows every minute for fifteen minutes, and a job that had to remember whom it had
 * already told would be keeping state a second replica cannot see (docs/ARCHITECTURE.md §7). The
 * memory is {@code uq_notifications_subject}, in the database, where every replica shares it.</p>
 *
 * <h2>La campana en la transacción, el correo por el outbox</h2>
 *
 * <p>The row is written in the caller's transaction, so a stay and the notice about it are one fact:
 * neither can exist without the other. The email is the part that leaves this database, so it is
 * queued as an outbox event (ADR 0012) carrying <b>only the notification's id</b> — the relay reads
 * everything else from the row, which keeps one copy of the truth and keeps addresses out of a
 * queue table.</p>
 */
@Service
public class NotificationService {

    private final NotificationRepository repository;
    private final NotificationPreferenceService preferences;
    private final OutboxEventPublisher outbox;
    private final Clock clock;

    public NotificationService(NotificationRepository repository, NotificationPreferenceService preferences,
                               OutboxEventPublisher outbox, Clock clock) {
        this.repository = repository;
        this.preferences = preferences;
        this.outbox = outbox;
        this.clock = clock;
    }

    /**
     * Records the notice, unless this person has already had it.
     *
     * @param subjectId what it is about — the stay, the citation, the movement. Together with the
     *                  type it is the identity of the fact, which is what makes repeats free.
     * @param params    only what the sentence needs: a plate, a time, an amount. Never a full
     *                  personal identifier and never a secret (SECURITY.md §11).
     * @return the row, or empty when this exact notice already existed
     */
    @Transactional
    public Optional<Notification> record(TenantId tenantId, UserId userId, NotificationType type,
                                         UUID subjectId, Map<String, Object> params) {
        if (repository.existsByUserIdAndTypeAndSubjectId(userId.value(), type, subjectId)) {
            return Optional.empty();
        }
        Instant now = clock.instant();
        Notification notification = repository.save(
                new Notification(Uuid7.generate(), tenantId, userId, type, subjectId, params, now));

        if (preferences.sendsByEmail(userId, type.category())) {
            // Only the id travels. Everything the message says is read back from the row at send
            // time, so a queued event can never disagree with what the bell shows.
            outbox.publish(new OutboxEvent(Uuid7.generate(), "notification",
                    notification.getId().toString(), tenantId, OutboxEventType.NOTIFICATION_EMAIL_REQUESTED,
                    Map.of("notificationId", notification.getId().toString()), now, null));
        }
        return Optional.of(notification);
    }

    /** Paginated because an inbox only grows: an unbounded read here is a table scan that ages badly. */
    @Transactional(readOnly = true)
    public PageResponse<Notification> page(TenantId tenantId, UserId userId, PageRequest request) {
        Page<Notification> found = repository.findByUserIdAndTenantIdOrderByCreatedAtDesc(
                userId.value(), tenantId.value(),
                org.springframework.data.domain.PageRequest.of(request.page(), request.size()));
        return PageResponse.of(found.getContent(), request.page(), request.size(), found.getTotalElements());
    }

    @Transactional(readOnly = true)
    public long unreadCount(TenantId tenantId, UserId userId) {
        return repository.countByUserIdAndTenantIdAndReadAtIsNull(userId.value(), tenantId.value());
    }

    @Transactional(readOnly = true)
    public Notification require(TenantId tenantId, UserId userId, UUID notificationId) {
        return repository.findByIdAndUserIdAndTenantId(notificationId, userId.value(), tenantId.value())
                .orElseThrow(() -> NotFoundException.of(ErrorCode.NOTIFICATION_NOT_FOUND, "error.notification.notFound"));
    }

    /** Marking read is the reader's own act, so it is scoped to them and never to an administrator. */
    @Transactional
    public Notification markRead(TenantId tenantId, UserId userId, UUID notificationId) {
        Notification notification = require(tenantId, userId, notificationId);
        notification.markRead(clock.instant());
        return repository.save(notification);
    }

    /** @return how many were still unread, so the caller can say nothing happened when nothing did */
    @Transactional
    public int markAllRead(TenantId tenantId, UserId userId) {
        return repository.markAllRead(userId.value(), tenantId.value(), clock.instant());
    }
}
