package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.web.dto.EnforcementDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContext;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.enforcement.entity.PlateExemption;
import cr.luparx.enforcement.model.ExemptionStatus;
import cr.luparx.enforcement.service.PlateExemptionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.util.Map;
import java.util.UUID;

/**
 * The register of plates this municipality does not fine for non-payment (CONTRACT.md v0.28).
 *
 * <p>Behind {@code ENFORCEMENT_MANAGE}, the permission that already governs <em>what may be fined</em>
 * — the infraction catalogue. Deciding that a vehicle is never fined is the same kind of decision
 * seen from the other side, and putting it behind the general {@code TENANT_MANAGE} would let whoever
 * configures tariffs quietly exempt a plate.</p>
 *
 * <p>Every act here is audited with the plate, because "why was this car not fined" is a question
 * somebody eventually asks, and the answer has to survive the person who made the decision.</p>
 */
@RestController
@RequestMapping("/api/v1/admin/enforcement/exemptions")
@Tag(name = "Admin · Exemptions", description = "Plates this municipality does not fine for non-payment.")
public class AdminExemptionController {

    private final PlateExemptionService exemptionService;
    private final AuditRecorder auditRecorder;
    private final Clock clock;

    public AdminExemptionController(PlateExemptionService exemptionService, AuditRecorder auditRecorder,
                                    Clock clock) {
        this.exemptionService = exemptionService;
        this.auditRecorder = auditRecorder;
        this.clock = clock;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Exemptions of this municipality (paginated)")
    public PageResponse<EnforcementDtos.PlateExemptionResponse> list(
            @RequestParam(required = false) ExemptionStatus status,
            @RequestParam(required = false) String plate,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        PageRequest request = PageRequest.parse(page, size, null);
        return exemptionService.list(tenantId, status, plate, request).map(this::toResponse);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Exempt a plate from being fined for non-payment")
    public ResponseEntity<EnforcementDtos.PlateExemptionResponse> grant(
            @Valid @RequestBody EnforcementDtos.GrantExemptionRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        PlateExemption exemption = exemptionService.grant(tenantId, request.plate(), request.reason(),
                request.documentRef(), request.validFrom(), request.validTo(), actor());
        auditRecorder.record(AuditAction.PLATE_EXEMPTION_GRANTED, "plate-exemption",
                exemption.getId().toString(),
                Map.of("plate", exemption.getPlate(),
                        "validTo", exemption.getValidTo() == null ? "none" : exemption.getValidTo().toString()));
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(exemption));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Correct the window or the paperwork of a live exemption")
    public EnforcementDtos.PlateExemptionResponse amend(
            @PathVariable UUID id,
            @Valid @RequestBody EnforcementDtos.AmendExemptionRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        PlateExemption exemption = exemptionService.amend(tenantId, id, request.reason(),
                request.documentRef(), request.validFrom(), request.validTo());
        auditRecorder.record(AuditAction.PLATE_EXEMPTION_AMENDED, "plate-exemption", id.toString(),
                Map.of("plate", exemption.getPlate()));
        return toResponse(exemption);
    }

    /**
     * Calls an exemption back, with a reason.
     *
     * <p>A POST and not a DELETE: nothing is deleted. The row is what explains why this car was not
     * fined last March, and it has to outlive the decision it recorded.</p>
     */
    @PostMapping("/{id}/revoke")
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Revoke an exemption; the row is kept")
    public EnforcementDtos.PlateExemptionResponse revoke(
            @PathVariable UUID id,
            @Valid @RequestBody EnforcementDtos.RevokeExemptionRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        PlateExemption exemption = exemptionService.revoke(tenantId, id, request.reason(), actor());
        auditRecorder.record(AuditAction.PLATE_EXEMPTION_REVOKED, "plate-exemption", id.toString(),
                Map.of("plate", exemption.getPlate()));
        return toResponse(exemption);
    }

    private static UserId actor() {
        return TenantContextHolder.current().map(TenantContext::userId).orElse(null);
    }

    private EnforcementDtos.PlateExemptionResponse toResponse(PlateExemption exemption) {
        return new EnforcementDtos.PlateExemptionResponse(
                exemption.getId(),
                exemption.getPlate(),
                exemption.getPlateRaw(),
                exemption.getReason(),
                exemption.getDocumentRef(),
                exemption.getStatus(),
                exemption.getValidFrom(),
                exemption.getValidTo(),
                // All three computed against now, never stored: running out is a fact about the clock
                // and a column would need a job to stay true (see ExemptionStatus).
                exemption.isInForceAt(clock.instant()),
                exemption.isPendingAt(clock.instant()),
                exemption.isExpiredAt(clock.instant()),
                exemption.getGrantedAt(),
                exemption.getRevokedAt(),
                exemption.getRevokeReason());
    }
}
