package cr.luparx.app.idempotency;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * A recorded idempotent request (ADR 0012, CONTRACT.md §4).
 *
 * <p>{@code scope_hash} is the unique key and covers the client-supplied {@code Idempotency-Key}
 * together with the caller, the method and the path, so two different users may safely reuse the
 * same key value and a key is never valid for a different operation.</p>
 *
 * <p>{@code request_hash} lets the server detect the dangerous case: the same key replayed with a
 * <em>different</em> body, which means a client bug rather than a retry, and is answered with a
 * conflict instead of the previous response.</p>
 */
@Entity
@Table(name = "idempotency_keys")
public class IdempotencyKeyEntity {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "scope_hash", nullable = false, length = 64)
    private String scopeHash;

    @Column(name = "idempotency_key", nullable = false, length = 200)
    private String idempotencyKey;

    @Column(name = "tenant_id")
    private UUID tenantId;

    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "method", nullable = false, length = 8)
    private String method;

    @Column(name = "path", nullable = false, length = 400)
    private String path;

    @Column(name = "request_hash", nullable = false, length = 64)
    private String requestHash;

    /** Null while the original request is still running. */
    @Column(name = "response_status")
    private Integer responseStatus;

    @Column(name = "response_body")
    private String responseBody;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    protected IdempotencyKeyEntity() {
        // for JPA
    }

    public IdempotencyKeyEntity(UUID id, String scopeHash, String idempotencyKey, UUID tenantId, UUID userId,
                                String method, String path, String requestHash, Instant createdAt,
                                Instant expiresAt) {
        this.id = id;
        this.scopeHash = scopeHash;
        this.idempotencyKey = idempotencyKey;
        this.tenantId = tenantId;
        this.userId = userId;
        this.method = method;
        this.path = path;
        this.requestHash = requestHash;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
    }

    public UUID getId() {
        return id;
    }

    public String getScopeHash() {
        return scopeHash;
    }

    public String getRequestHash() {
        return requestHash;
    }

    public Integer getResponseStatus() {
        return responseStatus;
    }

    public String getResponseBody() {
        return responseBody;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public boolean isCompleted() {
        return completedAt != null;
    }

    public void complete(int status, String body, Instant now) {
        this.responseStatus = status;
        this.responseBody = body;
        this.completedAt = now;
    }
}
