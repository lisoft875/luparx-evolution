package cr.luparx.tenancy.entity;

import cr.luparx.core.domain.Portal;
import cr.luparx.core.domain.Role;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.tenancy.model.MembershipStatus;
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
 * The link between a global user and a municipality (CONTRACT.md §5 {@code tenant_memberships}).
 * This is the authorization source of truth: a role name alone never grants anything, only an
 * ACTIVE membership for the requested tenant and portal does (SECURITY.md §3).
 *
 * <p>The user is referenced by raw id on purpose: module-tenancy must not depend on module-identity
 * at compile time (the database still enforces the foreign key), so tenancy can be extracted as a
 * service without a rewrite.</p>
 */
@Entity
@Table(name = "tenant_memberships")
public class TenantMembership {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    /**
     * Null only for platform back-office memberships: a PLATFORM_ADMIN belongs to the operator of
     * the product, not to a municipality (CONTRACT.md §0). A database CHECK keeps every non-platform
     * membership tenant-bound, and a partial unique index keeps platform memberships unique per user.
     */
    @Column(name = "tenant_id")
    private UUID tenantId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "portal", nullable = false, length = 16)
    private Portal portal;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 32)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private MembershipStatus status;

    @Column(name = "approved_by")
    private UUID approvedBy;

    @Column(name = "approved_at")
    private Instant approvedAt;

    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "status_reason", length = 500)
    private String statusReason;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected TenantMembership() {
        // for JPA
    }

    public TenantMembership(UUID id, UUID tenantId, UUID userId, Portal portal, Role role, MembershipStatus status,
                            Instant requestedAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.userId = userId;
        this.portal = portal;
        this.role = role;
        this.status = status;
        this.requestedAt = requestedAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public TenantId tenantId() {
        return TenantId.ofNullable(tenantId);
    }

    public boolean isPlatformScoped() {
        return tenantId == null;
    }

    public UUID getUserId() {
        return userId;
    }

    public UserId userId() {
        return UserId.of(userId);
    }

    public Portal getPortal() {
        return portal;
    }

    public Role getRole() {
        return role;
    }

    public MembershipStatus getStatus() {
        return status;
    }

    public UUID getApprovedBy() {
        return approvedBy;
    }

    public Instant getApprovedAt() {
        return approvedAt;
    }

    public Instant getRequestedAt() {
        return requestedAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    public String getStatusReason() {
        return statusReason;
    }

    public long getVersion() {
        return version;
    }

    public boolean isActive() {
        return status == MembershipStatus.ACTIVE;
    }

    public void approve(UUID approver, Instant now) {
        this.status = MembershipStatus.ACTIVE;
        this.approvedBy = approver;
        this.approvedAt = now;
        this.revokedAt = null;
        this.statusReason = null;
    }

    public void reject(UUID approver, Instant now, String reason) {
        this.status = MembershipStatus.REJECTED;
        this.approvedBy = approver;
        this.approvedAt = now;
        this.statusReason = reason;
    }

    public void revoke(Instant now, String reason) {
        this.status = MembershipStatus.REVOKED;
        this.revokedAt = now;
        this.statusReason = reason;
    }

    public void changeRole(Role role) {
        this.role = role;
    }

    public void changeStatus(MembershipStatus status, Instant now) {
        this.status = status;
        if (status == MembershipStatus.ACTIVE) {
            this.approvedAt = now;
            this.revokedAt = null;
        } else if (status == MembershipStatus.REVOKED) {
            this.revokedAt = now;
        }
    }
}
