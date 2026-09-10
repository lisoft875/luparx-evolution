package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.web.dto.EnforcementDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.enforcement.entity.ExemptionType;
import cr.luparx.enforcement.service.ExemptionTypeService;
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

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The categories this municipality grants permits under (CONTRACT.md v0.30).
 *
 * <p>Configuration and not an enumeration, which is the whole point: what one country exempts is not
 * what another does, so a fixed list in the code would be Costa Rican law compiled into the platform.
 * Four are seeded — disability, institutional vehicle, courtesy, special permit — in the
 * municipality's own language, and it renames them, retires them or adds its own from here.</p>
 *
 * <p>A category is <b>never deleted</b>. Permits granted under it are years old and explain why
 * vehicles were not fined; a category that disappeared would leave them explaining nothing. Retiring
 * one takes it off the list of what new permits may be registered under, which is what the
 * administrator actually wanted.</p>
 */
@RestController
@RequestMapping("/api/v1/admin/enforcement/exemption-types")
@Tag(name = "Admin · Exemption types", description = "Permit categories of this municipality.")
public class AdminExemptionTypeController {

    private final ExemptionTypeService typeService;
    private final EnforcementMapper mapper;
    private final AuditRecorder auditRecorder;

    public AdminExemptionTypeController(ExemptionTypeService typeService, EnforcementMapper mapper,
                                        AuditRecorder auditRecorder) {
        this.typeService = typeService;
        this.mapper = mapper;
        this.auditRecorder = auditRecorder;
    }

    /**
     * @param activeOnly what a form registering a new permit asks for; the administration screen wants
     *                   the whole catalogue, retired categories included
     */
    @GetMapping
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Permit categories of this municipality")
    public List<EnforcementDtos.ExemptionTypeResponse> list(
            @RequestParam(required = false, defaultValue = "false") boolean activeOnly) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        List<ExemptionType> types = activeOnly ? typeService.listActive(tenantId) : typeService.list(tenantId);
        return types.stream().map(mapper::toExemptionType).toList();
    }

    @PostMapping
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Add a permit category")
    public ResponseEntity<EnforcementDtos.ExemptionTypeResponse> create(
            @Valid @RequestBody EnforcementDtos.SaveExemptionTypeRequest body) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        ExemptionType type = typeService.create(tenantId, body.code(), body.name(), body.description(),
                body.requiresBeneficiary());
        auditRecorder.record(AuditAction.EXEMPTION_TYPE_CREATED, "exemption-type", type.getId().toString(),
                Map.of("code", type.getCode()));
        return ResponseEntity.status(HttpStatus.CREATED).body(mapper.toExemptionType(type));
    }

    /** The code is not editable: it is what a future rule would match, and renaming it silently would
     *  change which permits that rule covers. */
    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Rename a category, change what it demands, or retire it")
    public EnforcementDtos.ExemptionTypeResponse update(
            @PathVariable UUID id,
            @Valid @RequestBody EnforcementDtos.SaveExemptionTypeRequest body) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        boolean active = body.active() == null || body.active();
        ExemptionType type = typeService.update(tenantId, id, body.name(), body.description(),
                body.requiresBeneficiary(), active);
        auditRecorder.record(AuditAction.EXEMPTION_TYPE_UPDATED, "exemption-type", id.toString(),
                Map.of("code", type.getCode(), "active", Boolean.toString(type.isActive())));
        return mapper.toExemptionType(type);
    }
}
