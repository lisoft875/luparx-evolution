package cr.luparx.parking.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/**
 * The code a citizen dictates at a till so a cashier can credit their wallet
 * ({@code wallet_topup_codes}, V18_0).
 *
 * <p>One per (municipality, person), because a wallet is per municipality and so is the money that
 * goes into it. It holds nothing personal and is derived from nothing personal — see
 * {@code TopupCodeFormat} for the alphabet, the length and the check character.</p>
 *
 * <p>Rotating replaces the code in place rather than keeping a history: a citizen rotates precisely
 * because they believe somebody overheard the old one, and a code that still works after being
 * rotated would defeat the only reason the button exists. {@code rotated_at} records that it
 * happened.</p>
 */
@Entity
@Table(name = "wallet_topup_codes")
public class WalletTopupCode {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "code", nullable = false, length = 16)
    private String code;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "rotated_at")
    private Instant rotatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected WalletTopupCode() {
        // for JPA
    }

    public WalletTopupCode(UUID id, UUID tenantId, UUID userId, String code, Instant now) {
        this.id = id;
        this.tenantId = tenantId;
        this.userId = userId;
        this.code = code;
        this.createdAt = now;
    }

    public void rotate(String code, Instant now) {
        this.code = code;
        this.rotatedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getCode() {
        return code;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getRotatedAt() {
        return rotatedAt;
    }

    public long getVersion() {
        return version;
    }
}
