package cr.luparx.app.web;

import cr.luparx.app.audit.AuditEventEntity;
import cr.luparx.app.audit.AuditEventRepository;
import cr.luparx.app.web.dto.AdminDtos;
import cr.luparx.app.web.dto.PlatformDtos;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.identity.service.UserReportService;
import cr.luparx.tenancy.service.RegisteredUsersReport;
import cr.luparx.tenancy.service.TenantReportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
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
 * Platform-wide audit trail, reports and system endpoints (CONTRACT.md §4).
 *
 * <p>The registered-users report exists at two levels by design (CONTRACT.md §1): grouped by tenant
 * it is computed from memberships, grouped by country or month it is computed from the global user
 * table. Neither path can leak one municipality's figures into another's, because the tenant-level
 * report never reads {@code users} and this one never filters by a caller-supplied tenant.</p>
 */
@RestController
@RequestMapping("/api/v1/platform")
@Tag(name = "Platform · Audit, reports & system", description = "Cross-tenant audit trail, aggregate "
        + "reports, feature flags and job status.")
public class PlatformOperationsController {

    private static final int DEFAULT_REPORT_WINDOW_DAYS = 365;

    private final AuditEventRepository auditEventRepository;
    private final TenantReportService tenantReportService;
    private final UserReportService userReportService;
    private final ResponseMapper mapper;

    public PlatformOperationsController(AuditEventRepository auditEventRepository,
                                        TenantReportService tenantReportService,
                                        UserReportService userReportService,
                                        ResponseMapper mapper) {
        this.auditEventRepository = auditEventRepository;
        this.tenantReportService = tenantReportService;
        this.userReportService = userReportService;
        this.mapper = mapper;
    }

    @GetMapping("/audit-events")
    @PreAuthorize("hasAuthority('PERM_AUDIT_READ')")
    @Operation(summary = "Audit trail across every municipality (paginated, newest first)")
    public PageResponse<AdminDtos.AuditEventResponse> auditEvents(
            @RequestParam(required = false) UUID tenantId,
            @RequestParam(required = false) UUID actor,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        PageRequest request = PageRequest.parse(page, size, null);
        Instant start = from == null ? Instant.now().minus(DEFAULT_REPORT_WINDOW_DAYS, ChronoUnit.DAYS) : from;
        Instant end = to == null ? Instant.now() : to;
        Pageable pageable = org.springframework.data.domain.PageRequest.of(request.page(), request.size());
        Page<AuditEventEntity> result = auditEventRepository.searchGlobal(tenantId, actor, action, start, end,
                pageable);
        return PageResponse.of(result.getContent().stream().map(mapper::toAuditEvent).toList(),
                request.page(), request.size(), result.getTotalElements());
    }

    @GetMapping("/reports/registered-users")
    @PreAuthorize("hasAuthority('PERM_AUDIT_READ')")
    @Operation(summary = "Registered users grouped by tenant, country, portal or month")
    public AdminDtos.RegisteredUsersReportResponse registeredUsers(
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(defaultValue = "tenant") String groupBy) {
        Instant start = from == null ? Instant.now().minus(DEFAULT_REPORT_WINDOW_DAYS, ChronoUnit.DAYS) : from;
        Instant end = to == null ? Instant.now() : to;

        return switch (groupBy) {
            case "tenant" -> toResponse(tenantReportService.byTenant(start, end));
            case "country" -> new AdminDtos.RegisteredUsersReportResponse("country",
                    userReportService.countByCountry(start, end).stream()
                            .map(row -> new AdminDtos.RegisteredUsersRow(row.group(), row.count()))
                            .toList());
            case "month" -> new AdminDtos.RegisteredUsersReportResponse("month",
                    userReportService.countByMonth(start, end).stream()
                            .map(row -> new AdminDtos.RegisteredUsersRow(row.group(), row.count()))
                            .toList());
            case "portal" -> throw new cr.luparx.core.error.NotImplementedException(
                    "error.notImplemented.reportGrouping");
            default -> throw new ValidationException("groupBy", ErrorCode.VALIDATION_FAILED,
                    "error.report.groupBy.invalid");
        };
    }

    @GetMapping("/system/health")
    @PreAuthorize("hasAuthority('PERM_PLATFORM_MANAGE')")
    @Operation(summary = "Operational summary for the back-office dashboard")
    public Map<String, Object> systemHealth() {
        // Deliberately thin: the authoritative probes are /actuator/health (liveness/readiness), which
        // the orchestrator uses. This endpoint exists so the back-office can show a status without
        // exposing the actuator to browsers.
        return Map.of("status", "UP");
    }

    @GetMapping("/system/feature-flags")
    @PreAuthorize("hasAuthority('PERM_PLATFORM_MANAGE')")
    @Operation(summary = "Feature flags currently in effect")
    public PlatformDtos.FeatureFlagsResponse featureFlags() {
        // v0.1 ships no dynamic flags; the endpoint exists so clients can depend on its shape from
        // day one (CONTRACT.md §4 "preparado, no cerrado").
        return new PlatformDtos.FeatureFlagsResponse(Map.of());
    }

    @GetMapping("/system/jobs")
    @PreAuthorize("hasAuthority('PERM_PLATFORM_MANAGE')")
    @Operation(summary = "Background job status")
    public PlatformDtos.JobsResponse jobs() {
        return new PlatformDtos.JobsResponse(List.of());
    }

    private AdminDtos.RegisteredUsersReportResponse toResponse(RegisteredUsersReport report) {
        List<AdminDtos.RegisteredUsersRow> rows = new ArrayList<>(report.rows().size());
        for (RegisteredUsersReport.Row row : report.rows()) {
            rows.add(new AdminDtos.RegisteredUsersRow(row.group(), row.count()));
        }
        return new AdminDtos.RegisteredUsersReportResponse(report.groupBy(), rows);
    }
}
