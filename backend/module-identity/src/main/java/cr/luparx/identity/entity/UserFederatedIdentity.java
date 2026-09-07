package cr.luparx.identity.entity;

import cr.luparx.identity.model.FederatedProvider;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * Link between a local user and an external identity provider subject (CONTRACT.md §5).
 * {@code (provider, subject)} is unique: the same provider account can never be attached to two
 * different people.
 */
@Entity
@Table(name = "user_federated_identities")
public class UserFederatedIdentity {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "provider", nullable = false, length = 32)
    private FederatedProvider provider;

    /** Stable identifier issued by the provider ({@code sub} for OIDC). Never the email. */
    @Column(name = "subject", nullable = false, length = 255)
    private String subject;

    /** Email as asserted by the provider at link time; kept for support, not for authentication. */
    @Column(name = "email", length = 320)
    private String email;

    @Column(name = "linked_at", nullable = false)
    private Instant linkedAt;

    protected UserFederatedIdentity() {
        // for JPA
    }

    public UserFederatedIdentity(UUID id, UUID userId, FederatedProvider provider, String subject, String email,
                                 Instant linkedAt) {
        this.id = id;
        this.userId = userId;
        this.provider = provider;
        this.subject = subject;
        this.email = email;
        this.linkedAt = linkedAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public FederatedProvider getProvider() {
        return provider;
    }

    public String getSubject() {
        return subject;
    }

    public String getEmail() {
        return email;
    }

    public Instant getLinkedAt() {
        return linkedAt;
    }
}
