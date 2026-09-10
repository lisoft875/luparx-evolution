package cr.luparx.app.audit;

import cr.luparx.core.audit.AuditChange;
import cr.luparx.core.domain.Portal;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Persistent form of {@link cr.luparx.core.audit.AuditEvent} (ADR 0013).
 *
 * <p>The table is append-only: there is no update or delete path in the application. {@code tenant_id}
 * is null only for platform-scoped actions, which is itself the marker that an operator crossed a
 * tenant boundary (SECURITY.md §3).</p>
 */
@Entity
@Table(name = "audit_events")
public class AuditEventEntity {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id")
    private UUID tenantId;

    @Column(name = "actor_user_id")
    private UUID actorUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "actor_portal", length = 16)
    private Portal actorPortal;

    @Column(name = "action", nullable = false, length = 64)
    private String action;

    @Column(name = "resource_type", nullable = false, length = 64)
    private String resourceType;

    @Column(name = "resource_id", length = 128)
    private String resourceId;

    @Column(name = "ip_hash", length = 64)
    private String ipHash;

    @Column(name = "user_agent", length = 400)
    private String userAgent;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metadata", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> metadata;

    /**
     * What changed, field by field (V31_0 — CONTRACT.md v0.32).
     *
     * <p>A JSON array and not a child table: an audit entry is read whole or not at all, and
     * splitting it in two would force a join in the one screen that uses it — and would make the
     * seal chain have to cover both tables to mean anything.</p>
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "changes", nullable = false, columnDefinition = "jsonb")
    private List<AuditChange> changes;

    @Column(name = "trace_id", length = 64)
    private String traceId;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    protected AuditEventEntity() {
        // for JPA
    }

    public AuditEventEntity(UUID id, UUID tenantId, UUID actorUserId, Portal actorPortal, String action,
                            String resourceType, String resourceId, String ipHash, String userAgent,
                            Map<String, Object> metadata, List<AuditChange> changes, String traceId,
                            Instant occurredAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.actorUserId = actorUserId;
        this.actorPortal = actorPortal;
        this.action = action;
        this.resourceType = resourceType;
        this.resourceId = resourceId;
        this.ipHash = ipHash;
        this.userAgent = userAgent;
        this.metadata = metadata;
        this.changes = changes == null ? List.of() : List.copyOf(changes);
        this.traceId = traceId;
        this.occurredAt = occurredAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public UUID getActorUserId() {
        return actorUserId;
    }

    public Portal getActorPortal() {
        return actorPortal;
    }

    public String getAction() {
        return action;
    }

    public String getResourceType() {
        return resourceType;
    }

    public String getResourceId() {
        return resourceId;
    }

    public String getIpHash() {
        return ipHash;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public Map<String, Object> getMetadata() {
        return metadata;
    }

    public List<AuditChange> getChanges() {
        return changes == null ? List.of() : changes;
    }

    public String getTraceId() {
        return traceId;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }
}
