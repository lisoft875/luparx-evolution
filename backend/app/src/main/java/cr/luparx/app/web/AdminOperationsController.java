package cr.luparx.app.web;

import cr.luparx.app.audit.AuditEventRepository;
import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.web.dto.AdminDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.tenancy.service.RegisteredUsersReport;
import cr.luparx.tenancy.service.TenantReportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Audit trail, reports and exports of the active municipality (CONTRACT.md §4).
 *
 * <p>Every read here is filtered by the tenant of the request context; there is no code path from
 * these routes to another municipality's rows.</p>
 */
@RestController
@RequestMapping("/api/v1/admin")
@Tag(name = "Admin · Audit & reports", description = "Audit trail, registered-users report and exports.")
public class AdminOperationsController {

    private static final int DEFAULT_REPORT_WINDOW_DAYS = 365;

    /** How many links of the chain the verification hands back. Enough to keep; not an export. */
    private static final int RECENT_SEALS = 20;

    private final AuditEventRepository auditEventRepository;
    private final TenantReportService tenantReportService;
    private final AuditRecorder auditRecorder;
    private final cr.luparx.app.audit.AuditSealService sealService;
    private final ResponseMapper mapper;

    public AdminOperationsController(AuditEventRepository auditEventRepository,
                                     TenantReportService tenantReportService,
                                     AuditRecorder auditRecorder,
                                     cr.luparx.app.audit.AuditSealService sealService,
                                     ResponseMapper mapper) {
        this.auditEventRepository = auditEventRepository;
        this.tenantReportService = tenantReportService;
        this.auditRecorder = auditRecorder;
        this.sealService = sealService;
        this.mapper = mapper;
    }

    @GetMapping("/audit-events")
    @PreAuthorize("hasAuthority('PERM_AUDIT_READ')")
    @Operation(summary = "Audit trail of the active municipality (paginated, newest first)")
    public PageResponse<AdminDtos.AuditEventResponse> auditEvents(
            @RequestParam(required = false) UUID actor,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        PageRequest request = PageRequest.parse(page, size, null);
        Instant start = from == null ? Instant.now().minus(DEFAULT_REPORT_WINDOW_DAYS, ChronoUnit.DAYS) : from;
        Instant end = to == null ? Instant.now() : to;
        Pageable pageable = org.springframework.data.domain.PageRequest.of(request.page(), request.size());
        Page<cr.luparx.app.audit.AuditEventEntity> result = auditEventRepository.searchInTenant(
                tenantId.value(), actor, action, start, end, pageable);
        return PageResponse.of(result.getContent().stream().map(mapper::toAuditEvent).toList(),
                request.page(), request.size(), result.getTotalElements());
    }

    /**
     * Recomputes this municipality's audit chain and reports what does not add up
     * (CONTRACT.md v0.32).
     *
     * <p>Behind {@code AUDIT_READ}, the permission that already governs reading the trail: somebody
     * who may read it may check it, and somebody who may not has no business knowing whether it is
     * intact. It is a read and it changes nothing — verification that could repair a chain would be
     * a chain that repairs itself, which proves nothing.</p>
     *
     * <p>The recent seals travel with the verdict so an auditor can take them away and compare them
     * against what the platform reports next quarter. That is what makes the proof independent of
     * whatever the platform says about itself today.</p>
     */
    @GetMapping("/audit-events/chain")
    @PreAuthorize("hasAuthority('PERM_AUDIT_READ')")
    @Operation(summary = "Verify the audit chain of this municipality and report any break")
    public AdminDtos.AuditChainResponse auditChain() {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        return mapper.toAuditChain(sealService.verify(tenantId.value()),
                sealService.recent(tenantId.value(), RECENT_SEALS));
    }

    @GetMapping("/reports/registered-users")
    @PreAuthorize("hasAuthority('PERM_AUDIT_READ')")
    @Operation(summary = "Registered users of the active municipality, grouped by portal, month or district")
    public AdminDtos.RegisteredUsersReportResponse registeredUsers(
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(defaultValue = "portal") String groupBy) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        Instant start = from == null ? Instant.now().minus(DEFAULT_REPORT_WINDOW_DAYS, ChronoUnit.DAYS) : from;
        Instant end = to == null ? Instant.now() : to;

        if ("portal".equals(groupBy)) {
            RegisteredUsersReport report = tenantReportService.byPortal(tenantId, start, end);
            return toResponse(report);
        }
        if ("month".equals(groupBy) || "district".equals(groupBy)) {
            // Declared by the contract, not yet implemented: month and district grouping need a
            // dedicated projection to stay tenant-scoped and index-friendly. See backend/README.md.
            throw new cr.luparx.core.error.NotImplementedException("error.notImplemented.reportGrouping");
        }
        throw new ValidationException("groupBy", ErrorCode.VALIDATION_FAILED, "error.report.groupBy.invalid");
    }

    @PostMapping("/exports")
    @PreAuthorize("hasAuthority('PERM_EXPORT_RUN')")
    @Operation(summary = "Request an export scoped to the active municipality")
    public AdminDtos.CreateExportResponse createExport(@Valid @RequestBody AdminDtos.CreateExportRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        auditRecorder.record(AuditAction.EXPORT_REQUESTED, "export", request.type(),
                Map.of("type", request.type(), "tenantId", tenantId.toString()));
        // v0.1 declares the contract; the synchronous CSV generator and the asynchronous job are the
        // marked extension point of CONTRACT.md §4.
        throw new cr.luparx.core.error.NotImplementedException("error.notImplemented.export");
    }

    private AdminDtos.RegisteredUsersReportResponse toResponse(RegisteredUsersReport report) {
        List<AdminDtos.RegisteredUsersRow> rows = new ArrayList<>(report.rows().size());
        for (RegisteredUsersReport.Row row : report.rows()) {
            rows.add(new AdminDtos.RegisteredUsersRow(row.group(), row.count()));
        }
        return new AdminDtos.RegisteredUsersReportResponse(report.groupBy(), rows);
    }
}
