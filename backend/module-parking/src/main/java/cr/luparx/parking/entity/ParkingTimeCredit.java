package cr.luparx.parking.entity;

import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/**
 * Minutes a citizen has to their favour in ONE municipality ({@code parking_time_credits}, V11_0).
 *
 * <p>Minutes are not money (CONTRACT.md v0.2, rule 5): they are earned by finishing a session early,
 * they are spent first on the next session in the same municipality, they expire, and they are never
 * converted back into a wallet balance. The per-tenant key is what makes "what one municipality
 * charged, another one cannot let you spend" true by construction.</p>
 */
@Entity
@Table(name = "parking_time_credits")
public class ParkingTimeCredit {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "balance_minutes", nullable = false)
    private int balanceMinutes;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected ParkingTimeCredit() {
        // for JPA
    }

    public ParkingTimeCredit(UUID id, UUID tenantId, UUID userId, Instant createdAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.userId = userId;
        this.balanceMinutes = 0;
        this.createdAt = createdAt;
        this.updatedAt = createdAt;
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

    public UUID getUserId() {
        return userId;
    }

    public UserId user() {
        return UserId.of(userId);
    }

    public int getBalanceMinutes() {
        return balanceMinutes;
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

    /** Applies a signed change. The balance is the sum of the unspent minutes of the live lots. */
    public void apply(int deltaMinutes, Instant now) {
        int updated = Math.addExact(balanceMinutes, deltaMinutes);
        if (updated < 0) {
            throw new IllegalStateException("time credit balance would go negative");
        }
        this.balanceMinutes = updated;
        this.updatedAt = now;
    }
}
