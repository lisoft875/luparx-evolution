package cr.luparx.enforcement.entity;

import cr.luparx.enforcement.model.ExemptionStatus;
import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * One plate covered by a permit ({@code exemption_plates}, V29_0).
 *
 * <p>A permit can cover several, because a disability permit belongs to the person and travels with
 * them: sometimes in their own car, sometimes in the car of whoever drives them. With one plate per
 * permit the same permit has to be registered twice, and the day one is revoked the other keeps
 * exempting.</p>
 *
 * <p>{@link #getStatus()} is a copy of the parent's, and it is the only denormalisation in v0.30. It
 * exists so the <em>database</em> can hold "one approved permit per plate per municipality":
 * PostgreSQL cannot put a partial index on a condition living in another table, and the alternatives
 * were a trigger — business logic hidden where nobody reads it — or leaving the invariant to the
 * service alone, which is not what this schema does anywhere else. It is written in the same
 * transaction as the parent, from one place.</p>
 */
@Entity
@Table(name = "exemption_plates")
public class ExemptionPlate {

    @EmbeddedId
    private Id id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "plate_raw", nullable = false, length = 32)
    private String plateRaw;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private ExemptionStatus status;

    @Column(name = "added_at", nullable = false)
    private Instant addedAt;

    protected ExemptionPlate() {
        // for JPA
    }

    public ExemptionPlate(UUID exemptionId, UUID tenantId, String plate, String plateRaw,
                          ExemptionStatus status, Instant addedAt) {
        this.id = new Id(exemptionId, plate);
        this.tenantId = tenantId;
        this.plateRaw = plateRaw;
        this.status = status;
        this.addedAt = addedAt;
    }

    public UUID getExemptionId() {
        return id.exemptionId();
    }

    public String getPlate() {
        return id.plate();
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public String getPlateRaw() {
        return plateRaw;
    }

    public ExemptionStatus getStatus() {
        return status;
    }

    public Instant getAddedAt() {
        return addedAt;
    }

    /** Mirrors the parent's state. Called only from the service that changes the parent, in the same
     *  transaction — see the class comment for why this copy exists at all. */
    public void mirrorStatus(ExemptionStatus status) {
        this.status = status;
    }

    /** The composite key: a permit covers a plate at most once. */
    @jakarta.persistence.Embeddable
    public static class Id implements Serializable {

        private static final long serialVersionUID = 1L;

        @Column(name = "exemption_id", nullable = false)
        private UUID exemptionId;

        @Column(name = "plate", nullable = false, length = 16)
        private String plate;

        protected Id() {
            // for JPA
        }

        Id(UUID exemptionId, String plate) {
            this.exemptionId = exemptionId;
            this.plate = plate;
        }

        UUID exemptionId() {
            return exemptionId;
        }

        String plate() {
            return plate;
        }

        @Override
        public boolean equals(Object other) {
            if (this == other) {
                return true;
            }
            if (!(other instanceof Id that)) {
                return false;
            }
            return Objects.equals(exemptionId, that.exemptionId) && Objects.equals(plate, that.plate);
        }

        @Override
        public int hashCode() {
            return Objects.hash(exemptionId, plate);
        }
    }
}
