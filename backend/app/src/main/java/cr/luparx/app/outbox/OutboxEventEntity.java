package cr.luparx.app.outbox;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Persistent form of {@link cr.luparx.core.outbox.OutboxEvent} (ADR 0012).
 *
 * <p>Rows are inserted in the same transaction as the state change they describe and published
 * later by a relay, which is what keeps "the change happened" and "the world was told" consistent
 * without distributed transactions. {@code published_at} being null is the queue.</p>
 */
@Entity
@Table(name = "outbox_events")
public class OutboxEventEntity {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "aggregate_type", nullable = false, length = 64)
    private String aggregateType;

    @Column(name = "aggregate_id", nullable = false, length = 64)
    private String aggregateId;

    @Column(name = "tenant_id")
    private UUID tenantId;

    @Column(name = "type", nullable = false, length = 96)
    private String type;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> payload;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(name = "attempts", nullable = false)
    private int attempts;

    /**
     * When the relay may try again. New rows are due immediately; a failure pushes it out.
     *
     * <p>Ordering the queue by this instead of by {@code created_at} is what stops one address the
     * mail server keeps rejecting from being retried ahead of everything else, forever.</p>
     */
    @Column(name = "next_attempt_at", nullable = false)
    private Instant nextAttemptAt;

    @Column(name = "last_error", length = 500)
    private String lastError;

    /**
     * The retries ran out. Deliberately not {@code published_at}: marking something published that
     * never left would be lying to whoever later asks why the message never arrived. The row stays,
     * with its last error, so that question has an answer.
     */
    @Column(name = "failed_at")
    private Instant failedAt;

    protected OutboxEventEntity() {
        // for JPA
    }

    public OutboxEventEntity(UUID id, String aggregateType, String aggregateId, UUID tenantId, String type,
                             Map<String, Object> payload, Instant createdAt) {
        this.id = id;
        this.aggregateType = aggregateType;
        this.aggregateId = aggregateId;
        this.tenantId = tenantId;
        this.type = type;
        this.payload = payload;
        this.createdAt = createdAt;
        this.nextAttemptAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public String getAggregateType() {
        return aggregateType;
    }

    public String getAggregateId() {
        return aggregateId;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public String getType() {
        return type;
    }

    public Map<String, Object> getPayload() {
        return payload;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getPublishedAt() {
        return publishedAt;
    }

    public int getAttempts() {
        return attempts;
    }

    public Instant getNextAttemptAt() {
        return nextAttemptAt;
    }

    public String getLastError() {
        return lastError;
    }

    public Instant getFailedAt() {
        return failedAt;
    }

    public void markPublished(Instant now) {
        this.publishedAt = now;
    }

    /**
     * Records a failed attempt and schedules the next one, or gives up.
     *
     * <p>Exponential backoff with a ceiling: the first retry is a minute away, so a mail server that
     * blinked costs a minute, and the tenth is an hour away, so one that has been down all morning is
     * not being asked every sixty seconds by every replica. The cap matters more than the curve —
     * unbounded doubling would eventually schedule a retry next year.</p>
     *
     * @param maxAttempts after this many, the row leaves the queue as failed rather than pretending
     */
    public void markAttemptFailed(Instant now, String error, int maxAttempts, Duration ceiling) {
        this.attempts = this.attempts + 1;
        this.lastError = error == null ? null : error.substring(0, Math.min(error.length(), 500));
        if (this.attempts >= maxAttempts) {
            this.failedAt = now;
            return;
        }
        long minutes = Math.min(1L << Math.min(this.attempts - 1, 20), Math.max(1L, ceiling.toMinutes()));
        this.nextAttemptAt = now.plus(Duration.ofMinutes(minutes));
    }
}
