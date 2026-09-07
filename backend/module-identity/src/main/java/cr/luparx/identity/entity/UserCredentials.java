package cr.luparx.identity.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * Local password of a user (CONTRACT.md §5 {@code user_credentials}). Kept in its own table so that
 * reading a user profile never brings the password hash along, and so that a federated-only account
 * simply has no row here.
 */
@Entity
@Table(name = "user_credentials")
public class UserCredentials {

    @Id
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** Encoded Argon2id hash, including its parameters and salt. */
    @Column(name = "password_hash", nullable = false, length = 512)
    private String passwordHash;

    /** Algorithm identifier, e.g. {@code argon2id}. Stored so hashes can be migrated in place later. */
    @Column(name = "algorithm", nullable = false, length = 32)
    private String algorithm;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** Set by an administrative reset: the user must choose a new password on next login. */
    @Column(name = "must_change", nullable = false)
    private boolean mustChange;

    protected UserCredentials() {
        // for JPA
    }

    public UserCredentials(UUID userId, String passwordHash, String algorithm, Instant updatedAt, boolean mustChange) {
        this.userId = userId;
        this.passwordHash = passwordHash;
        this.algorithm = algorithm;
        this.updatedAt = updatedAt;
        this.mustChange = mustChange;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getAlgorithm() {
        return algorithm;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public boolean isMustChange() {
        return mustChange;
    }

    public void replace(String passwordHash, String algorithm, Instant updatedAt) {
        this.passwordHash = passwordHash;
        this.algorithm = algorithm;
        this.updatedAt = updatedAt;
        this.mustChange = false;
    }

    public void requireChange(Instant updatedAt) {
        this.mustChange = true;
        this.updatedAt = updatedAt;
    }
}
