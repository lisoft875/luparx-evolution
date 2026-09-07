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
 * One authentication attempt (CONTRACT.md §5 {@code auth_attempts}).
 *
 * <p>Persisted rather than counted in memory precisely so that rate limiting keeps working with any
 * number of backend instances behind a load balancer (docs/ARCHITECTURE.md §7). Neither the email
 * nor the IP is stored in the clear.</p>
 */
@Entity
@Table(name = "auth_attempts")
public class AuthAttempt {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    /** SHA-256 of the lower-cased email; enough to count attempts, useless as a mailing list. */
    @Column(name = "email_hash", nullable = false, length = 64)
    private String emailHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "portal", nullable = false, length = 16)
    private Portal portal;

    @Column(name = "ip_hash", nullable = false, length = 64)
    private String ipHash;

    @Column(name = "success", nullable = false)
    private boolean success;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    protected AuthAttempt() {
        // for JPA
    }

    public AuthAttempt(UUID id, String emailHash, Portal portal, String ipHash, boolean success, Instant occurredAt) {
        this.id = id;
        this.emailHash = emailHash;
        this.portal = portal;
        this.ipHash = ipHash;
        this.success = success;
        this.occurredAt = occurredAt;
    }

    public UUID getId() {
        return id;
    }

    public String getEmailHash() {
        return emailHash;
    }

    public Portal getPortal() {
        return portal;
    }

    public String getIpHash() {
        return ipHash;
    }

    public boolean isSuccess() {
        return success;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }
}
