package cr.luparx.enforcement.entity;

import cr.luparx.core.domain.Portal;
import cr.luparx.enforcement.model.CitationAction;
import cr.luparx.enforcement.model.CitationStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * One thing that happened to a citation ({@code citation_events}, V17_0).
 *
 * <p><b>This is part of the citation, not a log.</b> {@code audit_events} exists and every action
 * here is written there too, but that table is the platform's security trail: it is filtered by
 * permission, retained on the platform's own schedule and read by operators. The person who
 * challenges a citation has the right to see what happened to it — issued when, annulled by whom and
 * why, appeal resolved on what date — and that history travels with the act itself, in the same
 * response as the citation, for as long as the citation exists.</p>
 *
 * <p>Rows are append-only: there is no update and no delete. The actor is stored as an identifier,
 * never as a copy of their name, and the IP is stored hashed with the platform's pepper, exactly as
 * the audit trail does — enough to correlate, not enough to profile.</p>
 */
@Entity
@Table(name = "citation_events")
public class CitationEvent {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "citation_id", nullable = false)
    private UUID citationId;

    @Enumerated(EnumType.STRING)
    @Column(name = "action", nullable = false, length = 32)
    private CitationAction action;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", length = 32)
    private CitationStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", nullable = false, length = 32)
    private CitationStatus toStatus;

    @Column(name = "actor_user_id")
    private UUID actorUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "actor_portal", length = 16)
    private Portal actorPortal;

    @Column(name = "reason", length = 500)
    private String reason;

    @Column(name = "actor_ip_hash", length = 64)
    private String actorIpHash;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    protected CitationEvent() {
        // for JPA
    }

    public CitationEvent(UUID id, UUID tenantId, UUID citationId, CitationAction action, CitationStatus fromStatus,
                         CitationStatus toStatus, UUID actorUserId, Portal actorPortal, String reason,
                         String actorIpHash, Instant occurredAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.citationId = citationId;
        this.action = action;
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
        this.actorUserId = actorUserId;
        this.actorPortal = actorPortal;
        this.reason = reason;
        this.actorIpHash = actorIpHash;
        this.occurredAt = occurredAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public UUID getCitationId() {
        return citationId;
    }

    public CitationAction getAction() {
        return action;
    }

    public CitationStatus getFromStatus() {
        return fromStatus;
    }

    public CitationStatus getToStatus() {
        return toStatus;
    }

    public UUID getActorUserId() {
        return actorUserId;
    }

    public Portal getActorPortal() {
        return actorPortal;
    }

    public String getReason() {
        return reason;
    }

    public String getActorIpHash() {
        return actorIpHash;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }
}
