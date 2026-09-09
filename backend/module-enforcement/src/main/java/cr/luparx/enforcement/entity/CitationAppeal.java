package cr.luparx.enforcement.entity;

import cr.luparx.enforcement.model.AppealStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/**
 * A citizen's defence against a citation ({@code citation_appeals}, V18_0).
 *
 * <p>One per citation: a person who wants to add something does not file a second case, because two
 * open defences on one act would have two possible outcomes. The photographs live in
 * {@code citation_evidence} with {@code source = CITIZEN} and this identifier — the same table as the
 * officer's, with the same digest, because they are the same kind of proof.</p>
 *
 * <p>{@link #getNoticeId()} and {@link #getNoticeVersion()} record which exact version of the legal
 * notice was on screen when the citizen pressed send. Without that the notice is decoration: the day
 * it matters, "they were warned" has to be provable against the wording they actually read.</p>
 */
@Entity
@Table(name = "citation_appeals")
public class CitationAppeal {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "citation_id", nullable = false)
    private UUID citationId;

    /** The citizen who filed it. A reference, never a copy of their personal data. */
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "body", nullable = false, length = 4000)
    private String body;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private AppealStatus status;

    @Column(name = "submitted_at", nullable = false)
    private Instant submittedAt;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "resolved_by")
    private UUID resolvedBy;

    @Column(name = "resolution_reason", length = 1000)
    private String resolutionReason;

    @Column(name = "notice_id", nullable = false)
    private UUID noticeId;

    @Column(name = "notice_version", nullable = false)
    private int noticeVersion;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected CitationAppeal() {
        // for JPA
    }

    public CitationAppeal(UUID id, UUID tenantId, UUID citationId, UUID userId, String body, AppealNotice notice,
                          Instant now) {
        this.id = id;
        this.tenantId = tenantId;
        this.citationId = citationId;
        this.userId = userId;
        this.body = body;
        this.status = AppealStatus.SUBMITTED;
        this.submittedAt = now;
        this.noticeId = notice.getId();
        this.noticeVersion = notice.getVersion();
        this.createdAt = now;
        this.updatedAt = now;
    }

    /**
     * Records the municipality's decision. The reason is required by the database as well as by the
     * service: a resolution without one is not a resolution, it is a shrug the citizen cannot appeal
     * further.
     */
    public void resolve(AppealStatus outcome, UUID resolvedBy, String reason, Instant now) {
        this.status = outcome;
        this.resolvedBy = resolvedBy;
        this.resolutionReason = reason;
        this.resolvedAt = now;
        this.updatedAt = now;
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

    public UUID getUserId() {
        return userId;
    }

    public String getBody() {
        return body;
    }

    public AppealStatus getStatus() {
        return status;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }

    public Instant getResolvedAt() {
        return resolvedAt;
    }

    public UUID getResolvedBy() {
        return resolvedBy;
    }

    public String getResolutionReason() {
        return resolutionReason;
    }

    public UUID getNoticeId() {
        return noticeId;
    }

    public int getNoticeVersion() {
        return noticeVersion;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public long getVersion() {
        return version;
    }
}
