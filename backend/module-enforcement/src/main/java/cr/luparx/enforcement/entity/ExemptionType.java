package cr.luparx.enforcement.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * A category of permit, as one municipality defines it ({@code exemption_types}, V29_0).
 *
 * <p>Configuration and not an enumeration, and the argument has not changed since v0.28: what one
 * country exempts is not what another does, and a fixed list in the schema would be Costa Rican law
 * compiled into the platform. Four are seeded — disability, institutional vehicle, courtesy, special
 * permit — and a municipality renames, deactivates or adds to them without a deployment.</p>
 *
 * <p>{@link #getCode()} is what code could branch on if it ever needed to; nothing does today, and
 * that is the point. {@link #getName()} is what a person reads, in the language the municipality
 * wrote it in.</p>
 */
@Entity
@Table(name = "exemption_types")
public class ExemptionType {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "code", nullable = false, length = 32)
    private String code;

    @Column(name = "name", nullable = false, length = 120)
    private String name;

    @Column(name = "description", length = 400)
    private String description;

    /**
     * Whether this category demands a named beneficiary.
     *
     * <p>A half-hour courtesy may have none; a disability permit without a person is not a permit at
     * all. Per category rather than global, because the two are genuinely different obligations.</p>
     */
    @Column(name = "requires_beneficiary", nullable = false)
    private boolean requiresBeneficiary;

    @Column(name = "active", nullable = false)
    private boolean active;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ExemptionType() {
        // for JPA
    }

    public ExemptionType(UUID id, UUID tenantId, String code, String name, String description,
                         boolean requiresBeneficiary, Instant now) {
        this.id = id;
        this.tenantId = tenantId;
        this.code = code;
        this.name = name;
        this.description = description;
        this.requiresBeneficiary = requiresBeneficiary;
        this.active = true;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public String getCode() {
        return code;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public boolean isRequiresBeneficiary() {
        return requiresBeneficiary;
    }

    public boolean isActive() {
        return active;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    /** The code is never edited: it is what a future rule would match on, and renaming it silently
     *  would change which permits that rule covers. The label and the obligations are editable. */
    public void update(String name, String description, boolean requiresBeneficiary, boolean active,
                       Instant now) {
        this.name = name;
        this.description = description;
        this.requiresBeneficiary = requiresBeneficiary;
        this.active = active;
        this.updatedAt = now;
    }
}
