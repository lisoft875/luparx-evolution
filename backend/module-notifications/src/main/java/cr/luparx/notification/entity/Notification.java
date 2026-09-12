package cr.luparx.notification.entity;

import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.notification.model.NotificationCategory;
import cr.luparx.notification.model.NotificationSubjectType;
import cr.luparx.notification.model.NotificationType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * One thing the platform told one citizen ({@code notifications}, V35_0 — CONTRACT.md v0.38).
 *
 * <h2>No guarda texto</h2>
 *
 * <p>A {@link NotificationType} and its {@link #getParams() parameters}, never a sentence. The app
 * renders it from its own bundle and the email from {@code messages_*.properties}, which is the same
 * rule {@code NotificationSender} has obeyed since v0.1. The payoff is concrete: a person who
 * switches the app to English reads their whole history in English, and fixing an awkward wording
 * does not require rewriting rows nobody may edit.</p>
 *
 * <h2>Se escribe con el hecho, no después</h2>
 *
 * <p>This row is state of the same database as the stay or the citation that caused it, so it is
 * written in that transaction. The <b>email</b> is the part that leaves, and that goes through the
 * outbox (ADR 0012). Splitting them that way is what makes "the bell is always right" and "the mail
 * server was down" two independent facts instead of one.</p>
 */
@Entity
@Table(name = "notifications")
public class Notification {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 64)
    private NotificationType type;

    /**
     * Copied from the type rather than derived when read.
     *
     * <p>It is what decided whether this row also became an email, and that decision has to stay
     * legible after somebody re-categorises a type: an auditor asking "why did I get this by mail
     * when I had fines switched off" needs the answer the row was written with, not the one today's
     * code would give.</p>
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false, length = 24)
    private NotificationCategory category;

    @Enumerated(EnumType.STRING)
    @Column(name = "subject_type", nullable = false, length = 32)
    private NotificationSubjectType subjectType;

    @Column(name = "subject_id", nullable = false)
    private UUID subjectId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "params", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> params;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "read_at")
    private Instant readAt;

    protected Notification() {
        // for JPA
    }

    public Notification(UUID id, TenantId tenantId, UserId userId, NotificationType type, UUID subjectId,
                        Map<String, Object> params, Instant createdAt) {
        this.id = id;
        this.tenantId = tenantId.value();
        this.userId = userId.value();
        this.type = type;
        this.category = type.category();
        this.subjectType = type.subjectType();
        this.subjectId = subjectId;
        this.params = params == null ? Map.of() : Map.copyOf(params);
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public UUID getUserId() {
        return userId;
    }

    public NotificationType getType() {
        return type;
    }

    public NotificationCategory getCategory() {
        return category;
    }

    public NotificationSubjectType getSubjectType() {
        return subjectType;
    }

    public UUID getSubjectId() {
        return subjectId;
    }

    public Map<String, Object> getParams() {
        return params == null ? Map.of() : Map.copyOf(params);
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getReadAt() {
        return readAt;
    }

    public boolean isUnread() {
        return readAt == null;
    }

    /**
     * Marks it read, once.
     *
     * <p>Idempotent on purpose, and it keeps the FIRST instant rather than the latest: "when did you
     * see this" has one answer, and letting a second call overwrite it would quietly turn the field
     * into "when did you last open the list".</p>
     */
    public void markRead(Instant now) {
        if (readAt == null) {
            readAt = now;
        }
    }
}
