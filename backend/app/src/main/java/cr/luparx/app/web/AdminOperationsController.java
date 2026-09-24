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

    /**
     * Cuántas entradas trae el historial de un registro.
     *
     * <p>Cincuenta y no «todas»: el panel lateral de una tarifa no es el lugar donde se lee una
     * historia de trescientos cambios, y una consulta sin techo contra la tabla más grande de la
     * plataforma es la que un día tumba la pantalla. Quien necesite más tiene la auditoría general,
     * que ahora filtra por módulo y por usuario.</p>
     */
    private static final int RESOURCE_HISTORY_LIMIT = 50;

    /** How many links of the chain the verification hands back. Enough to keep; not an export. */
    private static final int RECENT_SEALS = 20;

    private final AuditEventRepository auditEventRepository;
    private final TenantReportService tenantReportService;
    private final AuditRecorder auditRecorder;
    private final cr.luparx.app.audit.AuditSealService sealService;
    private final cr.luparx.app.audit.AuditActorResolver actorResolver;
    private final cr.luparx.app.security.DirectoryLookupRateLimiter probeRateLimiter;
    private final cr.luparx.app.config.SecurityProperties securityProperties;
    private final ResponseMapper mapper;

    public AdminOperationsController(AuditEventRepository auditEventRepository,
                                     TenantReportService tenantReportService,
                                     AuditRecorder auditRecorder,
                                     cr.luparx.app.audit.AuditSealService sealService,
                                     cr.luparx.app.audit.AuditActorResolver actorResolver,
                                     cr.luparx.app.security.DirectoryLookupRateLimiter probeRateLimiter,
                                     cr.luparx.app.config.SecurityProperties securityProperties,
                                     ResponseMapper mapper) {
        this.auditEventRepository = auditEventRepository;
        this.tenantReportService = tenantReportService;
        this.auditRecorder = auditRecorder;
        this.sealService = sealService;
        this.actorResolver = actorResolver;
        this.probeRateLimiter = probeRateLimiter;
        this.securityProperties = securityProperties;
        this.mapper = mapper;
    }

    @GetMapping("/audit-events")
    @PreAuthorize("hasAuthority('PERM_AUDIT_READ')")
    @Operation(summary = "Audit trail of the active municipality (paginated, newest first)")
    public PageResponse<AdminDtos.AuditEventResponse> auditEvents(
            @RequestParam(required = false) UUID actor,
            @RequestParam(required = false) String action,
            /**
             * The module, which in this trail is the {@code resourceType} already written with every
             * entry: {@code parking-rate}, {@code parking-zone}, {@code citation}, {@code user}…
             *
             * <p>The §4 of the functional guide asks to filter by module. No new concept was needed —
             * the column has been there since the trail existed, and grouping actions into invented
             * "modules" on top of it would have produced a second taxonomy that drifts from the one
             * the writes actually use.</p>
             */
            @RequestParam(required = false) String resourceType,
            @RequestParam(required = false) String ipHash,
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
                tenantId.value(), actor, action, blankToNull(resourceType), blankToNull(ipHash), start, end, pageable);
        // One lookup for the whole page, before the mapping loop rather than inside it (v0.33).
        Map<UUID, cr.luparx.app.audit.AuditActorResolver.Actor> actors =
                actorResolver.resolve(result.getContent());
        return PageResponse.of(
                result.getContent().stream().map(event -> mapper.toAuditEvent(event, actors)).toList(),
                request.page(), request.size(), result.getTotalElements());
    }

    /**
     * The trail of ONE record: who changed it, when, and from what to what.
     *
     * <p>Answers the §4 of the functional guide (24-09-2026) from the side a person actually asks it:
     * standing in front of a tariff, not in front of a date range. Nothing is recorded that was not
     * recorded before — this reads what the writes in {@code AdminParkingController} and its
     * neighbours have always written.</p>
     *
     * <p>Capped at {@link #RESOURCE_HISTORY_LIMIT} entries. A record with more than fifty changes is
     * a record whose story is told in the general trail with its filters, not in a side panel.</p>
     */
    @GetMapping("/audit-events/by-resource")
    @PreAuthorize("hasAuthority('PERM_AUDIT_READ')")
    @Operation(summary = "Audit trail of a single record, newest first")
    public List<AdminDtos.AuditEventResponse> auditEventsByResource(
            @RequestParam String resourceType,
            @RequestParam String resourceId) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        // Spring ya rechaza el parámetro ausente; esto cubre el que llega vacío, que no es lo mismo
        // y que consultaría la tabla entera de un tipo de recurso.
        if (blankToNull(resourceType) == null) {
            throw new ValidationException("resourceType", ErrorCode.VALIDATION_FAILED, "error.audit.resource.required");
        }
        if (blankToNull(resourceId) == null) {
            throw new ValidationException("resourceId", ErrorCode.VALIDATION_FAILED, "error.audit.resource.required");
        }
        List<cr.luparx.app.audit.AuditEventEntity> events = auditEventRepository.historyOfResource(
                tenantId.value(), resourceType, resourceId,
                org.springframework.data.domain.PageRequest.of(0, RESOURCE_HISTORY_LIMIT));
        Map<UUID, cr.luparx.app.audit.AuditActorResolver.Actor> actors = actorResolver.resolve(events);
        return events.stream().map(event -> mapper.toAuditEvent(event, actors)).toList();
    }

    /**
     * Turns an address into the fingerprint this trail would have written for it (CONTRACT.md v0.33).
     *
     * <h2>Why this exists</h2>
     *
     * <p>The platform stores hashed addresses and shows fingerprints, which is right and which makes
     * the column useless on its own the day a municipality has an actual question: <em>this complaint
     * says the lookups came from this address — was it?</em> Without an answer, the pressure is to
     * start storing raw addresses, and the trail becomes a list of where people were. This answers it
     * without the platform ever keeping one: the caller supplies the address they already suspect,
     * the platform hashes it with the same pepper, and says how many entries match.</p>
     *
     * <h2>What it gives away</h2>
     *
     * <p>Only what the caller already had. It confirms or denies an address the asker brought with
     * them and can never produce one, which is the same shape as the exact-match person lookup of
     * v0.26 — and it is bounded the same way and for the same reason, by the same per-actor ceiling,
     * so that it cannot be fed a list. The probe is itself audited, with the fingerprint and never the
     * address, so "who has been checking addresses" is as answerable as everything else here.</p>
     *
     * <p>A POST because an address is personal data and personal data does not go in a URL
     * (SECURITY.md §11). It changes nothing, which would ordinarily make it a GET; the privacy rule
     * wins over the verb.</p>
     */
    @PostMapping("/audit-events/ip-fingerprint")
    @PreAuthorize("hasAuthority('PERM_AUDIT_READ')")
    @Operation(summary = "Check an address against this municipality's trail without storing it")
    public AdminDtos.AuditIpProbeResponse auditIpFingerprint(
            @Valid @RequestBody AdminDtos.AuditIpProbeRequest body,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        probeRateLimiter.checkAllowed(TenantContextHolder.current()
                        .map(cr.luparx.core.tenant.TenantContext::userId).orElse(null),
                AuditAction.AUDIT_ORIGIN_PROBED, "error.audit.originProbe.rateLimited");

        String address = body.ip().trim();
        if (address.isEmpty()) {
            throw new ValidationException("ip", ErrorCode.VALIDATION_FAILED, "error.audit.originProbe.address");
        }
        String hash = cr.luparx.identity.service.Hashing.ipHash(address, securityProperties.ipHashPepper());
        Instant start = from == null ? Instant.now().minus(DEFAULT_REPORT_WINDOW_DAYS, ChronoUnit.DAYS) : from;
        Instant end = to == null ? Instant.now() : to;
        long matches = auditEventRepository.countFromOrigin(tenantId.value(), hash, start, end);

        // The fingerprint, never the address. An audit entry that recorded the address would defeat
        // the entire design of the column it is about.
        auditRecorder.record(AuditAction.AUDIT_ORIGIN_PROBED, "audit", null,
                Map.of("fingerprint", String.valueOf(cr.luparx.core.audit.IpFingerprint.of(hash)),
                        "matches", String.valueOf(matches)));
        return new AdminDtos.AuditIpProbeResponse(cr.luparx.core.audit.IpFingerprint.of(hash), hash, matches);
    }

    /** A filter that was typed and then cleared is no filter; "" must not mean "entries with no origin". */
    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
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
