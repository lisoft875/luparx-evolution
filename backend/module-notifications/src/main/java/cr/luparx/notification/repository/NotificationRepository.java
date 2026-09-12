package cr.luparx.notification.repository;

import cr.luparx.notification.entity.Notification;
import cr.luparx.notification.model.NotificationType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * The citizen's inbox. Every read carries {@code userId} <b>and</b> {@code tenantId}
 * (docs/ARCHITECTURE.md §4): a person belongs to several municipalities and the bell is read inside
 * the active one, so a query narrowed only by user would show them another municipality's business.
 */
public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    Page<Notification> findByUserIdAndTenantIdOrderByCreatedAtDesc(UUID userId, UUID tenantId, Pageable pageable);

    /** The number on the bell. Answered by the partial index — read rows are never scanned. */
    long countByUserIdAndTenantIdAndReadAtIsNull(UUID userId, UUID tenantId);

    /**
     * Whether this person has already been told this exact thing.
     *
     * <p>Not tenant-scoped, and matching {@code uq_notifications_subject}: the subject identifier is
     * already unique across the platform, and scoping the check by tenant while the index is not
     * would make the check pass and the insert fail.</p>
     */
    boolean existsByUserIdAndTypeAndSubjectId(UUID userId, NotificationType type, UUID subjectId);

    /** By id AND owner: reading somebody else's notification is the IDOR this signature prevents. */
    Optional<Notification> findByIdAndUserIdAndTenantId(UUID id, UUID userId, UUID tenantId);

    /**
     * "Mark everything read" as one statement rather than a loop of loads and saves.
     *
     * <p>Bounded by the same partial index the count uses, so it touches only unread rows: a citizen
     * with two years of history pays for what is unread, not for what they have.</p>
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update Notification n set n.readAt = :now
            where n.userId = :userId and n.tenantId = :tenantId and n.readAt is null
            """)
    int markAllRead(@Param("userId") UUID userId, @Param("tenantId") UUID tenantId, @Param("now") Instant now);
}
