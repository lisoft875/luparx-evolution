package cr.luparx.enforcement.entity;

import cr.luparx.core.id.TenantId;
import cr.luparx.enforcement.model.ExemptionStatus;
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
 * A plate this municipality does not fine for non-payment ({@code plate_exemptions}, V27_0).
 *
 * <p>It hangs off the <b>plate</b>, not off a person and not off a registered vehicle, because the
 * plate is what the officer looks up and what is painted on the car. The cases that actually matter
 * — an ambulance, the council's own fleet, a diplomatic vehicle — almost never have an account in
 * the app and never will; requiring a registered vehicle would exclude exactly the vehicles that
 * cannot be fined.</p>
 *
 * <p>The trade-off is accepted rather than hidden: an exempt plate stays exempt even if the car is
 * sold, so the reason and the validity window are mandatory reading on screen, and revoking is one
 * click with its own audit entry.</p>
 *
 * <p>This says "do not fine", never "charge zero". The parking domain charges exactly as before and
 * does not know this class exists; an exempt vehicle simply never starts a stay.</p>
 */
@Entity
@Table(name = "plate_exemptions")
public class PlateExemption {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    /** Normalised: upper case, no separators — the same form the plate lookup compares. */
    @Column(name = "plate", nullable = false, length = 16)
    private String plate;

    @Column(name = "plate_raw", nullable = false, length = 32)
    private String plateRaw;

    @Column(name = "reason", nullable = false, length = 300)
    private String reason;

    @Column(name = "document_ref", length = 120)
    private String documentRef;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private ExemptionStatus status;

    @Column(name = "valid_from", nullable = false)
    private Instant validFrom;

    /** Null means no expiry, which the screen says in those words rather than leaving a blank cell. */
    @Column(name = "valid_to")
    private Instant validTo;

    @Column(name = "granted_by")
    private UUID grantedBy;

    @Column(name = "granted_at", nullable = false)
    private Instant grantedAt;

    @Column(name = "revoked_by")
    private UUID revokedBy;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "revoke_reason", length = 300)
    private String revokeReason;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected PlateExemption() {
        // for JPA
    }

    public PlateExemption(UUID id, UUID tenantId, String plate, String plateRaw, String reason,
                          String documentRef, Instant validFrom, Instant validTo, UUID grantedBy,
                          Instant grantedAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.plate = plate;
        this.plateRaw = plateRaw;
        this.reason = reason;
        this.documentRef = documentRef;
        this.status = ExemptionStatus.ACTIVE;
        this.validFrom = validFrom;
        this.validTo = validTo;
        this.grantedBy = grantedBy;
        this.grantedAt = grantedAt;
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

    public String getPlate() {
        return plate;
    }

    public String getPlateRaw() {
        return plateRaw;
    }

    public String getReason() {
        return reason;
    }

    public String getDocumentRef() {
        return documentRef;
    }

    public ExemptionStatus getStatus() {
        return status;
    }

    public Instant getValidFrom() {
        return validFrom;
    }

    public Instant getValidTo() {
        return validTo;
    }

    public UUID getGrantedBy() {
        return grantedBy;
    }

    public Instant getGrantedAt() {
        return grantedAt;
    }

    public UUID getRevokedBy() {
        return revokedBy;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    public String getRevokeReason() {
        return revokeReason;
    }

    public long getVersion() {
        return version;
    }

    /**
     * Whether this exempts the plate <em>at this instant</em>: registered, not called back, and
     * inside its window.
     *
     * <p>Computed, never stored. An exemption that ran out an hour ago is still {@code ACTIVE} in the
     * column and exempts nobody, and that is on purpose — see {@link ExemptionStatus}.</p>
     */
    public boolean isInForceAt(Instant now) {
        if (status != ExemptionStatus.ACTIVE) {
            return false;
        }
        if (now.isBefore(validFrom)) {
            return false;
        }
        return validTo == null || now.isBefore(validTo);
    }

    /** True when it is registered and simply has not started yet — a exemption granted in advance. */
    public boolean isPendingAt(Instant now) {
        return status == ExemptionStatus.ACTIVE && now.isBefore(validFrom);
    }

    /** True when it is registered and its window has closed. The only "expired" there is. */
    public boolean isExpiredAt(Instant now) {
        return status == ExemptionStatus.ACTIVE && validTo != null && !now.isBefore(validTo);
    }

    /**
     * Called back before its window ended.
     *
     * <p>The reason is required by the service, not by this method: the entity's job is to record
     * what happened, and refusing here would put the same rule in two places.</p>
     */
    public void revoke(UUID actor, String reason, Instant now) {
        this.status = ExemptionStatus.REVOKED;
        this.revokedBy = actor;
        this.revokeReason = reason;
        this.revokedAt = now;
    }

    /** Corrects the window or the paperwork of a live exemption, without changing which plate it is. */
    public void amend(String reason, String documentRef, Instant validFrom, Instant validTo) {
        this.reason = reason;
        this.documentRef = documentRef;
        this.validFrom = validFrom;
        this.validTo = validTo;
    }
}
