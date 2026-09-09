package cr.luparx.enforcement.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/**
 * What one municipality decides about enforcement, beyond its infraction catalogue
 * ({@code enforcement_settings}, V18_0).
 *
 * <p>One column today, and a row rather than a constant because "how many photographs a defence may
 * carry" belongs to the municipality that reads them, not to whoever deploys the platform. The hard
 * size limit per image is the opposite kind of decision — it protects the deployment's disk and
 * bandwidth — so it stays in {@code luparx.enforcement.*} configuration.</p>
 *
 * <p>A municipality with no row uses the platform default; the row is created the first time an
 * administrator changes something, so nothing has to be seeded for a new tenant to work.</p>
 */
@Entity
@Table(name = "enforcement_settings")
public class EnforcementSettings {

    /** Sensible default: enough to photograph a windscreen, a bay and a street sign, and no more. */
    public static final int DEFAULT_APPEAL_MAX_IMAGES = 4;

    @Id
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "appeal_max_images", nullable = false)
    private int appealMaxImages;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected EnforcementSettings() {
        // for JPA
    }

    public EnforcementSettings(UUID tenantId, int appealMaxImages, Instant now) {
        this.tenantId = tenantId;
        this.appealMaxImages = appealMaxImages;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void update(int appealMaxImages, Instant now) {
        this.appealMaxImages = appealMaxImages;
        this.updatedAt = now;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public int getAppealMaxImages() {
        return appealMaxImages;
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
}
