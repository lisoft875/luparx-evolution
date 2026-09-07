package cr.luparx.identity.entity;

import cr.luparx.identity.model.TotpStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * TOTP enrolment (CONTRACT.md §5 {@code user_mfa_totp}).
 *
 * <p>The shared secret is stored encrypted with a key managed outside the database, so a database
 * dump alone does not compromise anybody's second factor (SECURITY.md §5 and §11). The secret is
 * never returned again after the setup call and never appears in logs or audit metadata.</p>
 */
@Entity
@Table(name = "user_mfa_totp")
public class UserMfaTotp {

    @Id
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** AES-GCM ciphertext, Base64 encoded, of the Base32 TOTP secret. */
    @Column(name = "secret_encrypted", nullable = false, length = 512)
    private String secretEncrypted;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private TotpStatus status;

    @Column(name = "activated_at")
    private Instant activatedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserMfaTotp() {
        // for JPA
    }

    public UserMfaTotp(UUID userId, String secretEncrypted, TotpStatus status, Instant updatedAt) {
        this.userId = userId;
        this.secretEncrypted = secretEncrypted;
        this.status = status;
        this.updatedAt = updatedAt;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getSecretEncrypted() {
        return secretEncrypted;
    }

    public TotpStatus getStatus() {
        return status;
    }

    public Instant getActivatedAt() {
        return activatedAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public boolean isActive() {
        return status == TotpStatus.ACTIVE;
    }

    public void replaceSecret(String secretEncrypted, Instant now) {
        this.secretEncrypted = secretEncrypted;
        this.status = TotpStatus.PENDING;
        this.activatedAt = null;
        this.updatedAt = now;
    }

    public void activate(Instant now) {
        this.status = TotpStatus.ACTIVE;
        this.activatedAt = now;
        this.updatedAt = now;
    }

    public void disable(Instant now) {
        this.status = TotpStatus.DISABLED;
        this.activatedAt = null;
        this.updatedAt = now;
    }
}
