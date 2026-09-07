package cr.luparx.identity.entity;

import cr.luparx.core.domain.Portal;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * Opaque refresh token (CONTRACT.md §5, ADR 0005). Only the hash is stored, so a database dump does
 * not yield usable tokens.
 *
 * <p>Rotation: every use issues a successor and marks this row {@code replaced_by}. Presenting an
 * already-replaced token means the token leaked, so the whole {@code family_id} chain is revoked at
 * once instead of just failing the call.</p>
 */
@Entity
@Table(name = "refresh_tokens")
public class RefreshToken {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "portal", nullable = false, length = 16)
    private Portal portal;

    /** Active tenant of the session; null for platform sessions and for tenant-less citizens. */
    @Column(name = "tenant_id")
    private UUID tenantId;

    @Column(name = "token_hash", nullable = false, length = 128)
    private String tokenHash;

    /** Shared by every token derived from the same login; the unit of revocation on reuse. */
    @Column(name = "family_id", nullable = false)
    private UUID familyId;

    @Column(name = "issued_at", nullable = false)
    private Instant issuedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "replaced_by")
    private UUID replacedBy;

    @Column(name = "user_agent", length = 400)
    private String userAgent;

    /** Hashed client IP: enough to spot abuse patterns without retaining addresses (SECURITY.md §11). */
    @Column(name = "ip_hash", length = 64)
    private String ipHash;

    protected RefreshToken() {
        // for JPA
    }

    public RefreshToken(UUID id, UUID userId, Portal portal, UUID tenantId, String tokenHash, UUID familyId,
                        Instant issuedAt, Instant expiresAt, String userAgent, String ipHash) {
        this.id = id;
        this.userId = userId;
        this.portal = portal;
        this.tenantId = tenantId;
        this.tokenHash = tokenHash;
        this.familyId = familyId;
        this.issuedAt = issuedAt;
        this.expiresAt = expiresAt;
        this.userAgent = userAgent;
        this.ipHash = ipHash;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public Portal getPortal() {
        return portal;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public UUID getFamilyId() {
        return familyId;
    }

    public Instant getIssuedAt() {
        return issuedAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    public UUID getReplacedBy() {
        return replacedBy;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public String getIpHash() {
        return ipHash;
    }

    public boolean isRevoked() {
        return revokedAt != null;
    }

    public boolean isExpired(Instant now) {
        return !now.isBefore(expiresAt);
    }

    public boolean isUsable(Instant now) {
        return !isRevoked() && replacedBy == null && !isExpired(now);
    }

    public void rotateTo(UUID successorId, Instant now) {
        this.replacedBy = successorId;
        this.revokedAt = now;
    }

    public void revoke(Instant now) {
        if (this.revokedAt == null) {
            this.revokedAt = now;
        }
    }
}
