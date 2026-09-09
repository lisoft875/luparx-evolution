package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.web.dto.EnforcementDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.enforcement.entity.Citation;
import cr.luparx.enforcement.entity.CitationEvidence;
import cr.luparx.enforcement.entity.InfractionType;
import cr.luparx.enforcement.model.CitationAction;
import cr.luparx.enforcement.model.CitationStatus;
import cr.luparx.enforcement.model.EnforcementActor;
import cr.luparx.enforcement.port.EvidenceStorage;
import cr.luparx.enforcement.service.CitationService;
import cr.luparx.enforcement.service.EvidenceService;
import cr.luparx.enforcement.service.InfractionTypeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
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

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The municipality's own view of enforcement: what its officers wrote, and the catalogue they write
 * under.
 *
 * <p>Two capabilities are kept apart on purpose. {@code PERM_CITATION_READ} is held by finance and
 * support, because collecting on citations and answering the telephone about them are their jobs;
 * {@code PERM_CITATION_VOID} annuls an act and is held by the administrator and the inspection lead.
 * The officer who wrote a citation cannot annul it — separation of duties is not decoration here, it
 * is the first question a municipal auditor asks.</p>
 *
 * <p>Everything is scoped to the municipality in the token. There is no tenant parameter on this
 * controller, and the search below cannot be made to cross a municipality by omitting a filter.</p>
 */
@RestController
@RequestMapping("/api/v1/admin/enforcement")
@Tag(name = "Admin · Enforcement",
        description = "Citations of the municipality, their annulment, and the infraction catalogue.")
public class AdminEnforcementController {

    private final CitationService citationService;
    private final EvidenceService evidenceService;
    private final InfractionTypeService infractionTypeService;
    private final EnforcementMapper mapper;
    private final AuditRecorder auditRecorder;

    public AdminEnforcementController(CitationService citationService,
                                      EvidenceService evidenceService,
                                      InfractionTypeService infractionTypeService,
                                      EnforcementMapper mapper,
                                      AuditRecorder auditRecorder) {
        this.citationService = citationService;
        this.evidenceService = evidenceService;
        this.infractionTypeService = infractionTypeService;
        this.mapper = mapper;
        this.auditRecorder = auditRecorder;
    }

    // --- citations ---------------------------------------------------------------------------------

    /**
     * The municipality's citations, filtered.
     *
     * <p>Every criterion is optional and every one of them is applied in the database, not after: a
     * filter that loads the collection and narrows it in memory is a table scan wearing a costume.
     * The plate is matched on its normalised form, so {@code sjp-123} finds {@code SJP123}.</p>
     */
    @GetMapping("/citations")
    @PreAuthorize("hasAuthority('PERM_CITATION_READ')")
    @Operation(summary = "Citations of this municipality, by date, zone, officer, status or plate")
    public PageResponse<EnforcementDtos.CitationResponse> citations(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) UUID zoneId,
            @RequestParam(required = false) UUID inspectorUserId,
            @RequestParam(required = false) String plate,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        PageRequest request = PageRequest.parse(page, size, null);
        CitationStatus parsed = CitationStatus.parse(status).orElse(null);
        PageResponse<Citation> citations = citationService.search(tenantId, parsed, zoneId, inspectorUserId, plate,
                from, to, request);
        return new PageResponse<>(mapper.toCitations(citations.items(), tenantId.value()), citations.page(),
                citations.size(), citations.totalElements(), citations.totalPages());
    }

    @GetMapping("/citations/{id}")
    @PreAuthorize("hasAuthority('PERM_CITATION_READ')")
    @Operation(summary = "One citation with its evidence and its full history")
    public EnforcementDtos.CitationDetailResponse citation(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        return detail(tenantId, citationService.requireCurrent(tenantId, actor(), id));
    }

    @GetMapping("/citations/{id}/evidence/{evidenceId}")
    @PreAuthorize("hasAuthority('PERM_CITATION_READ')")
    @Operation(summary = "Download one photograph attached to a citation")
    public ResponseEntity<byte[]> evidenceContent(@PathVariable UUID id, @PathVariable UUID evidenceId) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        EvidenceStorage.Content content = evidenceService.read(tenantId, id, evidenceId);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                // parseMediaType, not a raw header: setting it by hand makes Spring append a charset
                // to an image type, which is meaningless for bytes and confuses strict clients.
                .contentType(MediaType.parseMediaType(content.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .body(content.content());
    }

    /**
     * Annul a citation. The reason is mandatory and is stored on the act and in its history.
     *
     * <p>This is the <b>only</b> way an issued citation stops standing. There is no delete and no
     * edit: the row a citizen was fined by has to remain readable, including by the person who
     * challenges the annulment itself.</p>
     */
    @PostMapping("/citations/{id}/cancel")
    @PreAuthorize("hasAuthority('PERM_CITATION_VOID')")
    @Operation(summary = "Annul a citation, with a reason")
    public EnforcementDtos.CitationDetailResponse cancel(@PathVariable UUID id,
                                                        @Valid @RequestBody EnforcementDtos.CitationReasonRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        Citation citation = citationService.cancel(tenantId, actor(), id, request.reason());
        auditStatus(AuditAction.CITATION_CANCELLED, citation, request.reason());
        return detail(tenantId, citation);
    }

    /** Record that the citizen filed a defence. Refused when the infraction type admits none. */
    @PostMapping("/citations/{id}/appeal")
    @PreAuthorize("hasAuthority('PERM_CITATION_READ')")
    @Operation(summary = "Record an appeal filed against a citation")
    public EnforcementDtos.CitationDetailResponse appeal(@PathVariable UUID id,
                                                         @Valid @RequestBody EnforcementDtos.CitationReasonRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        Citation citation = citationService.transition(tenantId, actor(), id, CitationStatus.APPEALED,
                CitationAction.APPEALED, request.reason(), true);
        auditStatus(AuditAction.CITATION_STATUS_CHANGED, citation, request.reason());
        return detail(tenantId, citation);
    }

    /** Resolve an appeal against the citizen: the citation stands and is payable again. */
    @PostMapping("/citations/{id}/uphold")
    @PreAuthorize("hasAuthority('PERM_CITATION_VOID')")
    @Operation(summary = "Reject an appeal; the citation stands")
    public EnforcementDtos.CitationDetailResponse uphold(@PathVariable UUID id,
                                                         @Valid @RequestBody EnforcementDtos.CitationReasonRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        Citation citation = citationService.transition(tenantId, actor(), id, CitationStatus.UPHELD,
                CitationAction.APPEAL_UPHELD, request.reason(), true);
        auditStatus(AuditAction.CITATION_STATUS_CHANGED, citation, request.reason());
        return detail(tenantId, citation);
    }

    /** Resolve an appeal in the citizen's favour: the citation is void. */
    @PostMapping("/citations/{id}/dismiss")
    @PreAuthorize("hasAuthority('PERM_CITATION_VOID')")
    @Operation(summary = "Accept an appeal; the citation is void")
    public EnforcementDtos.CitationDetailResponse dismiss(@PathVariable UUID id,
                                                          @Valid @RequestBody EnforcementDtos.CitationReasonRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        Citation citation = citationService.transition(tenantId, actor(), id, CitationStatus.DISMISSED,
                CitationAction.APPEAL_DISMISSED, request.reason(), true);
        auditStatus(AuditAction.CITATION_STATUS_CHANGED, citation, request.reason());
        return detail(tenantId, citation);
    }

    /**
     * Record a payment taken at the counter.
     *
     * <p>Deliberately narrow: this is the municipality writing down that it was paid, not a payment
     * being processed. Online payment — the provider, the idempotency of the charge, the receipt —
     * arrives with the payments batch and will move this same status through the same transition
     * table, which is why the state machine already has {@code PAID} in it.</p>
     */
    @PostMapping("/citations/{id}/paid")
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Record that a citation was paid at the counter")
    public EnforcementDtos.CitationDetailResponse markPaid(@PathVariable UUID id,
                                                           @Valid @RequestBody EnforcementDtos.CitationReasonRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        Citation citation = citationService.transition(tenantId, actor(), id, CitationStatus.PAID,
                CitationAction.PAID, request.reason(), false);
        auditStatus(AuditAction.CITATION_STATUS_CHANGED, citation, request.reason());
        return detail(tenantId, citation);
    }

    // --- catalogue ---------------------------------------------------------------------------------

    @GetMapping("/infraction-types")
    @PreAuthorize("hasAuthority('PERM_CITATION_READ')")
    @Operation(summary = "The municipality's infraction catalogue, retired kinds included")
    public List<EnforcementDtos.InfractionTypeResponse> infractionTypes() {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        return mapper.toInfractionTypes(infractionTypeService.list(tenantId));
    }

    /**
     * Replace the catalogue.
     *
     * <p>Whole-catalogue semantics because that is what the screen edits: a table with rows added,
     * changed and removed, saved once. Removal deactivates rather than deletes — a kind that has been
     * used is referenced by citations that are years old — and the currency is the municipality's, not
     * a field on the request, so one catalogue can never end up holding two currencies.</p>
     */
    @PutMapping("/infraction-types")
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Replace the infraction catalogue of this municipality")
    public List<EnforcementDtos.InfractionTypeResponse> updateInfractionTypes(
            @Valid @RequestBody EnforcementDtos.UpdateInfractionTypesRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        List<InfractionTypeService.Draft> drafts = new ArrayList<>(request.infractionTypes().size());
        for (EnforcementDtos.InfractionTypeRequest entry : request.infractionTypes()) {
            drafts.add(new InfractionTypeService.Draft(
                    entry.id(),
                    entry.code(),
                    entry.name(),
                    entry.description(),
                    entry.fineAmountMinor(),
                    // Absent means the safe default: demand a photograph, and admit a defence.
                    entry.requiresPhoto() == null || entry.requiresPhoto(),
                    entry.allowsAppeal() == null || entry.allowsAppeal(),
                    entry.discountDays(),
                    entry.discountPercent(),
                    entry.dueDays(),
                    entry.active() == null || entry.active()));
        }
        List<InfractionType> saved = infractionTypeService.replace(tenantId, drafts);
        auditRecorder.record(AuditAction.INFRACTION_TYPES_UPDATED, "infraction-types", tenantId.value().toString(),
                Map.of("count", String.valueOf(saved.size())));
        return mapper.toInfractionTypes(saved);
    }

    // --- helpers -----------------------------------------------------------------------------------

    private EnforcementDtos.CitationDetailResponse detail(TenantId tenantId, Citation citation) {
        List<CitationEvidence> evidence = evidenceService.list(tenantId, citation.getId());
        return new EnforcementDtos.CitationDetailResponse(
                mapper.toCitation(citation, mapper.zonesOf(tenantId.value()), evidence.size()),
                mapper.toEvidenceList(evidence,
                        "/api/v1/admin/enforcement/citations/" + citation.getId() + "/evidence"),
                mapper.toHistory(citationService.history(tenantId, citation.getId())));
    }

    private EnforcementActor actor() {
        return EnforcementActor.of(TenantContextHolder.requireUserId(),
                TenantContextHolder.require().portal(), auditRecorder.currentIpHash());
    }

    private void auditStatus(String action, Citation citation, String reason) {
        auditRecorder.record(action, "citation", citation.getId().toString(),
                Map.of("number", citation.getNumber() == null ? "-" : citation.getNumber(),
                        "status", citation.getStatus().name(),
                        "reason", reason == null ? "-" : reason));
    }
}
