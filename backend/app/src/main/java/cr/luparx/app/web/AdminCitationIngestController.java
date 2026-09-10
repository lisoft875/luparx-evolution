package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.web.dto.EnforcementDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.enforcement.entity.ExternalInfractionMapping;
import cr.luparx.enforcement.model.CitationStatus;
import cr.luparx.enforcement.service.CitationIngestService;
import cr.luparx.enforcement.service.InfractionTypeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * Where another system pushes the citations it raised (CONTRACT.md v0.34).
 *
 * <h2>Por qué vive bajo el portal de administración</h2>
 *
 * <p>The caller is a machine, but it is a machine acting for one municipality, and every guarantee
 * that matters here — the tenant of the request context, the audience of the token, the audit trail —
 * already hangs off that portal. A separate top-level route would have meant a second way to
 * establish which municipality is speaking, and two ways to answer that question is how a
 * multi-tenant platform ends up serving one council's citations to another.</p>
 *
 * <p>What keeps it separate is the <b>capability</b>, not the path: {@code CITATION_INGEST}, held by
 * the {@code TENANT_INTEGRATION} role and by an administrator, and by nobody else. It is deliberately
 * not {@code CITATION_ISSUE} — mirroring an act somebody else raised is not the same authority as
 * raising one in this municipality's name, and a misconfigured integration holding the officer's
 * capability could put real citations on real plates.</p>
 */
@RestController
@RequestMapping("/api/v1/admin/enforcement/ingest")
@Tag(name = "Admin · Citation ingest",
        description = "Mirror citations raised in another system, and map their causals to the catalogue.")
public class AdminCitationIngestController {

    /**
     * How many existing citations one mapping call relinks.
     *
     * <p>Switching the mirror on imports a municipality's whole open ledger, so a single foreign code
     * can sit on thousands of rows. The caller repeats until the answer is zero, which is also what
     * makes the operation safe to retry after a timeout.</p>
     */
    private static final int BACKFILL_BATCH = 200;

    private final CitationIngestService ingestService;
    private final InfractionTypeService infractionTypeService;
    private final EnforcementMapper mapper;
    private final AuditRecorder auditRecorder;

    public AdminCitationIngestController(CitationIngestService ingestService,
                                         InfractionTypeService infractionTypeService,
                                         EnforcementMapper mapper,
                                         AuditRecorder auditRecorder) {
        this.ingestService = ingestService;
        this.infractionTypeService = infractionTypeService;
        this.mapper = mapper;
        this.auditRecorder = auditRecorder;
    }

    /**
     * Mirrors one citation.
     *
     * <p>201 the first time this external identifier is seen, 200 every time after — and the body
     * says which, so the integrator can tell a delivery from a repeat without inferring it from a
     * status code they may not see through their own client. A repeat is the ordinary case, not an
     * error: the other system will resend after a timeout it never saw the answer to, and many of
     * them simply re-push their whole open ledger every night.</p>
     *
     * <p>{@code discrepancies} lists the fields that arrived different from what is written, among
     * the ones a re-ingest may not change. They are reported and not applied: two systems disagreeing
     * about which plate was fined is something a person resolves, not something to merge.</p>
     */
    @PostMapping("/citations")
    @PreAuthorize("hasAuthority('PERM_CITATION_INGEST')")
    @Operation(summary = "Mirror a citation raised in another system (idempotent by external id)")
    public ResponseEntity<EnforcementDtos.CitationIngestResponse> ingest(
            @Valid @RequestBody EnforcementDtos.CitationIngestRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        CitationStatus status = CitationStatus.parse(request.status())
                .orElseThrow(() -> new ValidationException("status", ErrorCode.VALIDATION_FAILED,
                        "error.enforcement.ingest.status"));

        CitationIngestService.Result result = ingestService.ingest(tenantId, new CitationIngestService.Command(
                request.sourceSystem(), request.externalId(), request.number(), request.plate(),
                request.infractionCode(), request.infractionName(), request.fineAmountMinor(),
                request.currencyCode(), request.occurredAt(), request.issuedAt(), request.dueAt(),
                request.zoneCode(), request.spaceCode(), request.latitude(), request.longitude(),
                request.addressText(), request.inspectorExternalRef(), request.inspectorName(),
                status, request.externalStatus(), request.notes()));

        // Audited on both outcomes. "The other system re-sent this one four hundred times" is a real
        // finding, and a trail that only recorded first deliveries could not show it.
        auditRecorder.record(AuditAction.CITATION_INGESTED, "citation", result.citation().getId().toString(),
                Map.of("sourceSystem", request.sourceSystem(),
                        "externalId", request.externalId(),
                        "outcome", result.outcome().name(),
                        "status", result.citation().getStatus().name(),
                        "discrepancies", String.join(",", result.discrepancies())));

        EnforcementDtos.CitationIngestResponse body = new EnforcementDtos.CitationIngestResponse(
                mapper.toCitation(result.citation(), mapper.zonesOf(tenantId.value()), 0),
                result.outcome().name(),
                result.discrepancies());
        return result.outcome() == CitationIngestService.Outcome.CREATED
                ? ResponseEntity.status(201).body(body)
                : ResponseEntity.ok(body);
    }

    /** The causal translations this municipality has declared. */
    @GetMapping("/mappings")
    @PreAuthorize("hasAuthority('PERM_CITATION_READ')")
    @Operation(summary = "Causal translations from other systems to this municipality's catalogue")
    public List<EnforcementDtos.ExternalInfractionMappingResponse> mappings() {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        return ingestService.mappings(tenantId).stream().map(this::toMapping).toList();
    }

    /**
     * The foreign causals that have arrived and nobody has mapped, busiest first.
     *
     * <p>Ordered by how many citations are waiting on each one, because the code sitting on four
     * hundred citations is the one worth mapping first and an alphabetical list buries it.</p>
     */
    @GetMapping("/unmapped-causals")
    @PreAuthorize("hasAuthority('PERM_CITATION_READ')")
    @Operation(summary = "Causals received from other systems that are not mapped yet")
    public List<EnforcementDtos.UnmappedCausalResponse> unmapped(
            @RequestParam(required = false, defaultValue = "50") int limit) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        return ingestService.unmappedCausals(tenantId, limit).stream()
                .map(row -> new EnforcementDtos.UnmappedCausalResponse(row.sourceSystem(), row.externalCode(),
                        row.externalName(), row.citations()))
                .toList();
    }

    /**
     * Points a foreign causal at one of this municipality's, and relinks the citations already here.
     *
     * <p>Idempotent: sending the same mapping again re-declares it and relinks whatever is still
     * pending, which is exactly what a caller repeating until {@code relinked} reaches zero needs.</p>
     *
     * <p>It never rewrites what a citation says it was for. The foreign code, name and amount stay as
     * they arrived — they are the record of what the other system fined the person for — and the
     * mapping only lets the reports add them up with the equivalent causal of our own.</p>
     */
    @PutMapping("/mappings")
    @PreAuthorize("hasAuthority('PERM_CITATION_INGEST')")
    @Operation(summary = "Map a foreign causal to the catalogue and relink the citations already here")
    public EnforcementDtos.MapCausalResponse map(@Valid @RequestBody EnforcementDtos.MapCausalRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        // Checked here rather than trusted: a mapping that pointed at another municipality's causal
        // would put that council's infraction on this council's reports, and the foreign key alone
        // would happily allow it.
        // Throws NOT_FOUND when the causal belongs to another municipality or does not exist. Checked
        // rather than trusted: a mapping pointing at another council's causal would put that
        // council's infraction on this council's reports, and the foreign key alone allows it.
        infractionTypeService.require(tenantId, request.infractionTypeId());
        int relinked = ingestService.map(tenantId, request.sourceSystem(), request.externalCode(),
                request.infractionTypeId(), TenantContextHolder.requireUserId().value(), BACKFILL_BATCH);
        auditRecorder.record(AuditAction.EXTERNAL_CAUSAL_MAPPED, "infraction-type",
                request.infractionTypeId().toString(),
                Map.of("sourceSystem", request.sourceSystem(),
                        "externalCode", request.externalCode(),
                        "relinked", String.valueOf(relinked)));
        return new EnforcementDtos.MapCausalResponse(relinked, relinked == BACKFILL_BATCH);
    }

    private EnforcementDtos.ExternalInfractionMappingResponse toMapping(ExternalInfractionMapping mapping) {
        return new EnforcementDtos.ExternalInfractionMappingResponse(
                mapping.getId(), mapping.getSourceSystem(), mapping.getExternalCode(),
                mapping.getExternalName(), mapping.getInfractionTypeId(), mapping.getUpdatedAt());
    }
}
