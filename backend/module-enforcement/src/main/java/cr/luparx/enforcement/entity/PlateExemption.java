package cr.luparx.enforcement.entity;

import cr.luparx.core.id.TenantId;
import cr.luparx.enforcement.model.BeneficiaryKind;
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
 * <p>It is looked up by <b>plate</b>, not by person and not by registered vehicle, because the plate
 * is what the officer types and what is painted on the car. The cases that actually matter — an
 * ambulance, the council's own fleet, a diplomatic vehicle — almost never have an account in the app
 * and never will; requiring a registered vehicle would exclude exactly the vehicles that cannot be
 * fined.</p>
 *
 * <p>Since v0.30 a permit covers <b>several plates</b> ({@code exemption_plates}), because a
 * disability permit belongs to the person and travels with them. It also carries a category, a named
 * beneficiary, its backing documents, and a decision — because a state that can be rejected implies
 * that somebody asked first, and "who authorised that this car did not pay" is not answered by
 * whoever typed the request.</p>
 *
 * <p>The trade-off of keying on plates is accepted rather than hidden: an exempt plate stays exempt
 * even if the car is sold, so the reason and the validity window are mandatory reading on screen, and
 * revoking is one click with its own audit entry.</p>
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

    /**
     * @deprecated since v0.30 — the plates live in {@code exemption_plates}. Still written with the
     *         first of them during the expansion phase (ADR 0010) so an instance older than V29_0
     *         keeps reading something true, and dropped in the contraction.
     */
    @Deprecated(since = "0.30")
    @Column(name = "plate", length = 16)
    private String plate;

    @Deprecated(since = "0.30")
    @Column(name = "plate_raw", length = 32)
    private String plateRaw;

    /** The category, as this municipality defines it. Configuration, never an enumeration. */
    @Column(name = "exemption_type_id")
    private UUID exemptionTypeId;

    @Enumerated(EnumType.STRING)
    @Column(name = "beneficiary_kind", length = 16)
    private BeneficiaryKind beneficiaryKind;

    @Column(name = "beneficiary_name", length = 200)
    private String beneficiaryName;

    /**
     * The beneficiary's identity document, or an organisation's legal registration.
     *
     * <p>A personal identifier: read by whoever administers enforcement and never sent to the
     * officer's device, which needs to know that the vehicle is exempt and why — not who by.</p>
     */
    @Column(name = "beneficiary_document", length = 64)
    private String beneficiaryDocument;

    @Column(name = "requested_by")
    private UUID requestedBy;

    @Column(name = "requested_at")
    private Instant requestedAt;

    /**
     * Who approved or rejected it. Kept apart from {@link #requestedBy} on purpose: "who authorised
     * that this car did not pay" is a question an auditor asks, and it is not answered by naming
     * whoever typed the request.
     */
    @Column(name = "decided_by")
    private UUID decidedBy;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "decision_reason", length = 300)
    private String decisionReason;

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

    /**
     * A permit as requested: PENDING, granting nothing.
     *
     * @param primaryPlate the first of the covered plates, written into the deprecated column during
     *                     the expansion phase so an older instance still reads something true
     */
    public PlateExemption(UUID id, UUID tenantId, UUID exemptionTypeId, String primaryPlate,
                          String primaryPlateRaw, BeneficiaryKind beneficiaryKind, String beneficiaryName,
                          String beneficiaryDocument, String reason, String documentRef,
                          Instant validFrom, Instant validTo, UUID requestedBy, Instant requestedAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.exemptionTypeId = exemptionTypeId;
        this.plate = primaryPlate;
        this.plateRaw = primaryPlateRaw;
        this.beneficiaryKind = beneficiaryKind;
        this.beneficiaryName = beneficiaryName;
        this.beneficiaryDocument = beneficiaryDocument;
        this.reason = reason;
        this.documentRef = documentRef;
        // A permit grants nothing until it is granted. Nothing about the plate changes here.
        this.status = ExemptionStatus.PENDING;
        this.validFrom = validFrom;
        this.validTo = validTo;
        this.requestedBy = requestedBy;
        this.requestedAt = requestedAt;
        this.grantedAt = requestedAt;
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
        if (!status.isGranted()) {
            return false;
        }
        if (now.isBefore(validFrom)) {
            return false;
        }
        return validTo == null || now.isBefore(validTo);
    }

    /** True when it is registered and simply has not started yet — a exemption granted in advance. */
    public boolean isPendingAt(Instant now) {
        return status.isGranted() && now.isBefore(validFrom);
    }

    /** True when it is registered and its window has closed. The only "expired" there is. */
    public boolean isExpiredAt(Instant now) {
        return status.isGranted() && validTo != null && !now.isBefore(validTo);
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

    /** Corrects the window, the paperwork or the beneficiary. The plates are changed on their own. */
    public void amend(UUID exemptionTypeId, BeneficiaryKind beneficiaryKind, String beneficiaryName,
                      String beneficiaryDocument, String reason, String documentRef, Instant validFrom,
                      Instant validTo) {
        this.exemptionTypeId = exemptionTypeId;
        this.beneficiaryKind = beneficiaryKind;
        this.beneficiaryName = beneficiaryName;
        this.beneficiaryDocument = beneficiaryDocument;
        this.reason = reason;
        this.documentRef = documentRef;
        this.validFrom = validFrom;
        this.validTo = validTo;
    }

    /** Granted. From here on it exempts, subject to its window. */
    public void approve(UUID actor, Instant now) {
        this.status = ExemptionStatus.APPROVED;
        this.decidedBy = actor;
        this.decidedAt = now;
        this.decisionReason = null;
        // The deprecated v0.28 columns keep saying what they used to say, for an older reader.
        this.grantedBy = actor;
        this.grantedAt = now;
    }

    /** Refused, with a reason. The row stays: a refusal is an answer somebody is owed. */
    public void reject(UUID actor, String reason, Instant now) {
        this.status = ExemptionStatus.REJECTED;
        this.decidedBy = actor;
        this.decidedAt = now;
        this.decisionReason = reason;
    }

    public UUID getExemptionTypeId() {
        return exemptionTypeId;
    }

    public BeneficiaryKind getBeneficiaryKind() {
        return beneficiaryKind;
    }

    public String getBeneficiaryName() {
        return beneficiaryName;
    }

    public String getBeneficiaryDocument() {
        return beneficiaryDocument;
    }

    public UUID getRequestedBy() {
        return requestedBy;
    }

    public Instant getRequestedAt() {
        return requestedAt;
    }

    public UUID getDecidedBy() {
        return decidedBy;
    }

    public Instant getDecidedAt() {
        return decidedAt;
    }

    public String getDecisionReason() {
        return decisionReason;
    }

    /** Keeps the deprecated single-plate column pointing at the first covered plate (expansion). */
    public void mirrorPrimaryPlate(String plate, String plateRaw) {
        this.plate = plate;
        this.plateRaw = plateRaw;
    }
}
