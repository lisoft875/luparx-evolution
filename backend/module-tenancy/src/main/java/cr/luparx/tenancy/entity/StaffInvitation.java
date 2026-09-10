package cr.luparx.tenancy.entity;

import cr.luparx.core.domain.Portal;
import cr.luparx.core.domain.Role;
import cr.luparx.core.id.TenantId;
import cr.luparx.tenancy.model.InvitationStatus;
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
 * A post offered to an email address that has no account yet ({@code staff_invitations}, V26_0).
 *
 * <p>This is not a membership. It is a promise: somebody with authority in this municipality offered
 * this role to this address. The membership is created when the invitation is accepted, and from
 * then on {@code tenant_memberships} is the authority as always — an invitation never grants
 * anything by itself, however long it sits in a mailbox.</p>
 *
 * <p>The token is stored hashed, like every other one-time token on the platform. Reading this table
 * does not let anybody accept an invitation; the link exists in the invited person's mailbox and
 * nowhere else.</p>
 */
@Entity
@Table(name = "staff_invitations")
public class StaffInvitation {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "email", nullable = false, length = 320)
    private String email;

    @Enumerated(EnumType.STRING)
    @Column(name = "portal", nullable = false, length = 16)
    private Portal portal;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 32)
    private Role role;

    @Column(name = "token_hash", nullable = false, length = 64)
    private String tokenHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private InvitationStatus status;

    @Column(name = "invited_by")
    private UUID invitedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "accepted_at")
    private Instant acceptedAt;

    @Column(name = "accepted_user_id")
    private UUID acceptedUserId;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected StaffInvitation() {
        // for JPA
    }

    public StaffInvitation(UUID id, UUID tenantId, String email, Role role, String tokenHash,
                           UUID invitedBy, Instant createdAt, Instant expiresAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.email = email;
        // The portal is the role's portal and is never a second opinion about it. It is stored so
        // the database can hold the same role/portal check the memberships table holds.
        this.portal = role.portal();
        this.role = role;
        this.tokenHash = tokenHash;
        this.status = InvitationStatus.PENDING;
        this.invitedBy = invitedBy;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public TenantId tenant() {
        return TenantId.of(tenantId);
    }

    public String getEmail() {
        return email;
    }

    public Portal getPortal() {
        return portal;
    }

    public Role getRole() {
        return role;
    }

    public InvitationStatus getStatus() {
        return status;
    }

    public UUID getInvitedBy() {
        return invitedBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getAcceptedAt() {
        return acceptedAt;
    }

    public UUID getAcceptedUserId() {
        return acceptedUserId;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    public long getVersion() {
        return version;
    }

    /** True when this invitation can still be accepted: pending, and the clock has not run out. */
    public boolean isUsableAt(Instant now) {
        return status == InvitationStatus.PENDING && now.isBefore(expiresAt);
    }

    /** True when it was offered and simply ran out of time — the only "expired" there is. */
    public boolean isExpiredAt(Instant now) {
        return status == InvitationStatus.PENDING && !now.isBefore(expiresAt);
    }

    /**
     * Re-sending: a new token and a new deadline on the <em>same</em> row.
     *
     * <p>Deliberately not a second row. Two live invitations for one address are two valid ways into
     * the same post, and revoking the one the administrator can see would leave the other working.
     * Replacing the hash also invalidates the previous link, which is the honest reading of "send it
     * again": the old mail stops working the moment the new one is sent.</p>
     */
    public void reissue(String tokenHash, Instant now, Instant expiresAt) {
        this.tokenHash = tokenHash;
        this.createdAt = now;
        this.expiresAt = expiresAt;
    }

    public void accept(UUID userId, Instant now) {
        this.status = InvitationStatus.ACCEPTED;
        this.acceptedUserId = userId;
        this.acceptedAt = now;
    }

    public void revoke(Instant now) {
        this.status = InvitationStatus.REVOKED;
        this.revokedAt = now;
    }
}
