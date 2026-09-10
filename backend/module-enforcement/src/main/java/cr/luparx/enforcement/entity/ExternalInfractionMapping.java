package cr.luparx.enforcement.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/**
 * "Code {@code ART-142-B} of system {@code SIM} is our code {@code EST-01}"
 * ({@code external_infraction_mappings}, V32_0 — CONTRACT.md v0.34).
 *
 * <h2>Para los reportes, nunca para el registro</h2>
 *
 * <p>The citation already carries the other system's code, name and amount copied into it, because
 * those columns were snapshots from the day citations existed. So a causal that matches nothing in
 * the catalogue is already <b>fully recorded</b>: nothing is lost and nothing is guessed. What is
 * missing without a mapping is only that the reports cannot add it up with the equivalent causal of
 * our own.</p>
 *
 * <p>That is why an ingest is never rejected for a missing mapping. A municipality's citations
 * arriving at two in the morning must not depend on somebody having configured a translation table
 * first — a rejection at that hour is a citation nobody notices was lost, and the other system does
 * not know what to do with the error either.</p>
 *
 * <h2>Many to one, never one to many</h2>
 *
 * <p>One external code maps to one of ours. The reverse is deliberately open: two foreign causals
 * often land on the same one of ours, because no two systems carve the world up the same way. A
 * unique index on {@code (tenant, system, code)} says exactly that and nothing more.</p>
 */
@Entity
@Table(name = "external_infraction_mappings")
public class ExternalInfractionMapping {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "source_system", nullable = false, length = 64)
    private String sourceSystem;

    @Column(name = "external_code", nullable = false, length = 64)
    private String externalCode;

    /**
     * The name it arrived with the last time.
     *
     * <p>Decides nothing. It is here so the administrator doing the mapping can see what
     * {@code ART-142-B} actually is without having to open a citation to find out.</p>
     */
    @Column(name = "external_name", length = 160)
    private String externalName;

    @Column(name = "infraction_type_id", nullable = false)
    private UUID infractionTypeId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "created_by")
    private UUID createdBy;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected ExternalInfractionMapping() {
        // for JPA
    }

    public ExternalInfractionMapping(UUID id, UUID tenantId, String sourceSystem, String externalCode,
                                     String externalName, UUID infractionTypeId, UUID createdBy, Instant now) {
        this.id = id;
        this.tenantId = tenantId;
        this.sourceSystem = sourceSystem;
        this.externalCode = externalCode;
        this.externalName = externalName;
        this.infractionTypeId = infractionTypeId;
        this.createdBy = createdBy;
        this.createdAt = now;
        this.updatedAt = now;
    }

    /** Points the same foreign code at a different causal of ours. */
    public void retarget(UUID infractionTypeId, String externalName, Instant now) {
        this.infractionTypeId = infractionTypeId;
        if (externalName != null && !externalName.isBlank()) {
            this.externalName = externalName;
        }
        this.updatedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public String getSourceSystem() {
        return sourceSystem;
    }

    public String getExternalCode() {
        return externalCode;
    }

    public String getExternalName() {
        return externalName;
    }

    public UUID getInfractionTypeId() {
        return infractionTypeId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public UUID getCreatedBy() {
        return createdBy;
    }
}
