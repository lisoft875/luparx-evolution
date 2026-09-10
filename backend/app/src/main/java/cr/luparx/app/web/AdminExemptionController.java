package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.web.dto.EnforcementDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContext;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.enforcement.entity.ExemptionDocument;
import cr.luparx.enforcement.entity.ExemptionPlate;
import cr.luparx.enforcement.entity.ExemptionType;
import cr.luparx.enforcement.entity.PlateExemption;
import cr.luparx.enforcement.model.ExemptionStatus;
import cr.luparx.enforcement.port.EvidenceStorage;
import cr.luparx.enforcement.service.ExemptionDocumentService;
import cr.luparx.enforcement.service.ExemptionTypeService;
import cr.luparx.enforcement.service.PlateExemptionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Permits and exemptions: the register of vehicles this municipality does not fine for non-payment
 * (CONTRACT.md v0.30).
 *
 * <p>Behind {@code ENFORCEMENT_MANAGE}, the permission that already governs <em>what may be fined</em>
 * — the infraction catalogue. Deciding that a vehicle is never fined is the same kind of decision seen
 * from the other side, and putting it behind the general {@code TENANT_MANAGE} would let whoever
 * configures tariffs quietly exempt a plate.</p>
 *
 * <h2>Requested, then decided</h2>
 *
 * <p>Registering a permit and granting it are two calls, and the audit trail names both people. The
 * platform does <b>not</b> refuse a permit whose requester and approver are the same person: a
 * municipality with one administrator would then do this work on paper, where nobody can audit it at
 * all. What it does instead is write {@code selfApproved} on the entry, so the fact is visible
 * without anyone comparing two names.</p>
 *
 * <p>Every act here is audited with the plate, because "why was this car not fined" is a question
 * somebody eventually asks, and the answer has to survive the person who made the decision.</p>
 */
@RestController
@RequestMapping("/api/v1/admin/enforcement/exemptions")
@Tag(name = "Admin · Exemptions", description = "Permits under which a vehicle is not fined for non-payment.")
public class AdminExemptionController {

    private final PlateExemptionService exemptionService;
    private final ExemptionTypeService typeService;
    private final ExemptionDocumentService documentService;
    private final EnforcementMapper mapper;
    private final AuditRecorder auditRecorder;

    public AdminExemptionController(PlateExemptionService exemptionService,
                                    ExemptionTypeService typeService,
                                    ExemptionDocumentService documentService,
                                    EnforcementMapper mapper,
                                    AuditRecorder auditRecorder) {
        this.exemptionService = exemptionService;
        this.typeService = typeService;
        this.documentService = documentService;
        this.mapper = mapper;
        this.auditRecorder = auditRecorder;
    }

    // --- the register -----------------------------------------------------------------------------

    @GetMapping
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Permits of this municipality (paginated)")
    public PageResponse<EnforcementDtos.PlateExemptionResponse> list(
            @RequestParam(required = false) ExemptionStatus status,
            @RequestParam(required = false) UUID exemptionTypeId,
            @RequestParam(required = false) String plate,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        PageRequest request = PageRequest.parse(page, size, null);
        PageResponse<PlateExemption> found = exemptionService.list(tenantId, status, exemptionTypeId, plate, request);
        // Mapped as a page and not row by row: categories, plates, document counts and names are
        // resolved once for the whole page — see EnforcementMapper.toExemptions.
        List<EnforcementDtos.PlateExemptionResponse> items = mapper.toExemptions(tenantId, found.items());
        return PageResponse.of(items, found.page(), found.size(), found.totalElements());
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "One permit, with its plates and its decision")
    public EnforcementDtos.PlateExemptionResponse get(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        return mapper.toExemption(tenantId, exemptionService.requireInScope(tenantId, id));
    }

    /**
     * Registers a request. It is PENDING and it exempts nobody until somebody grants it.
     *
     * <p>A body carrying the deprecated {@code plate} and no {@code plates} is the v0.28 shape, and it
     * is answered with the v0.28 <b>behaviour</b>: registered and granted in one act, by the same
     * person, recorded as such. Quietly turning an old client's "exempt this plate" into "ask somebody
     * to exempt this plate" would leave a vehicle being fined that its operator believes is exempt,
     * which is a far worse outcome than an honest legacy branch that disappears in the contraction
     * (ADR 0010).</p>
     */
    @PostMapping
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Register a permit request (PENDING until it is decided)")
    public ResponseEntity<EnforcementDtos.PlateExemptionResponse> request(
            @Valid @RequestBody EnforcementDtos.RequestExemptionRequest body) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        boolean legacy = (body.plates() == null || body.plates().isEmpty()) && body.plate() != null
                && !body.plate().isBlank();
        List<String> plates = legacy ? List.of(body.plate()) : body.plates();
        UUID typeId = body.exemptionTypeId() == null ? defaultTypeId(tenantId) : body.exemptionTypeId();

        PlateExemption exemption = exemptionService.request(tenantId,
                new PlateExemptionService.Draft(typeId, plates, body.beneficiaryKind(), body.beneficiaryName(),
                        body.beneficiaryDocument(), body.reason(), body.documentRef(), body.validFrom(),
                        body.validTo()),
                actor());
        auditRecorder.record(AuditAction.PLATE_EXEMPTION_REQUESTED, "plate-exemption",
                exemption.getId().toString(),
                details(exemption, Map.of("legacyShape", Boolean.toString(legacy))));

        if (legacy) {
            exemption = exemptionService.approve(tenantId, exemption.getId(), actor());
            auditRecorder.record(AuditAction.PLATE_EXEMPTION_APPROVED, "plate-exemption",
                    exemption.getId().toString(),
                    details(exemption, Map.of("selfApproved", "true", "legacyShape", "true")));
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(mapper.toExemption(tenantId, exemption));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Correct the category, beneficiary, window or paperwork of a permit")
    public EnforcementDtos.PlateExemptionResponse amend(
            @PathVariable UUID id,
            @Valid @RequestBody EnforcementDtos.AmendExemptionRequest body) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        PlateExemption current = exemptionService.requireInScope(tenantId, id);
        UUID typeId = body.exemptionTypeId() == null ? current.getExemptionTypeId() : body.exemptionTypeId();
        PlateExemption exemption = exemptionService.amend(tenantId, id,
                new PlateExemptionService.Draft(typeId, null, body.beneficiaryKind(), body.beneficiaryName(),
                        body.beneficiaryDocument(), body.reason(), body.documentRef(), body.validFrom(),
                        body.validTo()));
        auditRecorder.record(AuditAction.PLATE_EXEMPTION_AMENDED, "plate-exemption", id.toString(),
                details(exemption, Map.of()));
        return mapper.toExemption(tenantId, exemption);
    }

    // --- the decision -----------------------------------------------------------------------------

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Grant a permit; self-approval is allowed and recorded as such")
    public EnforcementDtos.PlateExemptionResponse approve(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        PlateExemption exemption = exemptionService.approve(tenantId, id, actor());
        auditRecorder.record(AuditAction.PLATE_EXEMPTION_APPROVED, "plate-exemption", id.toString(),
                details(exemption, Map.of("selfApproved", Boolean.toString(
                        exemption.getRequestedBy() != null
                                && exemption.getRequestedBy().equals(exemption.getDecidedBy())))));
        return mapper.toExemption(tenantId, exemption);
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Refuse a permit, with a reason; the row is kept")
    public EnforcementDtos.PlateExemptionResponse reject(
            @PathVariable UUID id,
            @Valid @RequestBody EnforcementDtos.RejectExemptionRequest body) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        PlateExemption exemption = exemptionService.reject(tenantId, id, body.reason(), actor());
        auditRecorder.record(AuditAction.PLATE_EXEMPTION_REJECTED, "plate-exemption", id.toString(),
                details(exemption, Map.of()));
        return mapper.toExemption(tenantId, exemption);
    }

    /**
     * Calls a permit back, with a reason.
     *
     * <p>A POST and not a DELETE: nothing is deleted. The row is what explains why this car was not
     * fined last March, and it has to outlive the decision it recorded.</p>
     */
    @PostMapping("/{id}/revoke")
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Revoke a permit; the row is kept")
    public EnforcementDtos.PlateExemptionResponse revoke(
            @PathVariable UUID id,
            @Valid @RequestBody EnforcementDtos.RevokeExemptionRequest body) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        PlateExemption exemption = exemptionService.revoke(tenantId, id, body.reason(), actor());
        auditRecorder.record(AuditAction.PLATE_EXEMPTION_REVOKED, "plate-exemption", id.toString(),
                details(exemption, Map.of()));
        return mapper.toExemption(tenantId, exemption);
    }

    // --- the plates -------------------------------------------------------------------------------

    @PostMapping("/{id}/plates")
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Add a plate to a permit")
    public EnforcementDtos.PlateExemptionResponse addPlate(
            @PathVariable UUID id,
            @Valid @RequestBody EnforcementDtos.AddExemptionPlateRequest body) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        ExemptionPlate added = exemptionService.addPlate(tenantId, id, body.plate());
        auditRecorder.record(AuditAction.PLATE_EXEMPTION_PLATE_ADDED, "plate-exemption", id.toString(),
                Map.of("plate", added.getPlate()));
        return mapper.toExemption(tenantId, exemptionService.requireInScope(tenantId, id));
    }

    /**
     * Removes a plate from a permit.
     *
     * <p>The only DELETE in this controller, and it removes a row that says which vehicles a decision
     * covers — not the decision. The last plate cannot go: a permit covering nothing is a municipality
     * having decided something about no vehicle at all, and revoking is the act that was meant.</p>
     *
     * <p>The plate travels in the path because it is not personal data — it is painted on a vehicle in
     * public — and because a DELETE has no body to put it in.</p>
     */
    @DeleteMapping("/{id}/plates/{plate}")
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Remove a plate from a permit; the last one cannot be removed")
    public EnforcementDtos.PlateExemptionResponse removePlate(@PathVariable UUID id, @PathVariable String plate) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        exemptionService.removePlate(tenantId, id, plate);
        auditRecorder.record(AuditAction.PLATE_EXEMPTION_PLATE_REMOVED, "plate-exemption", id.toString(),
                Map.of("plate", plate));
        return mapper.toExemption(tenantId, exemptionService.requireInScope(tenantId, id));
    }

    // --- the paperwork ----------------------------------------------------------------------------

    @GetMapping("/{id}/documents")
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Documents backing a permit")
    public List<EnforcementDtos.ExemptionDocumentResponse> documents(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        exemptionService.requireInScope(tenantId, id);
        return mapper.toExemptionDocuments(documentService.list(tenantId, id));
    }

    /**
     * Attaches a document.
     *
     * <p>The type is read from the file's own header and never from its name or the {@code
     * Content-Type} the browser declared: both are chosen by whoever is uploading, and believing them
     * is how something that is not a document at all ends up stored and handed back years later.</p>
     */
    @PostMapping(value = "/{id}/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Attach a backing document to a permit (PDF or image, server-verified)")
    public ResponseEntity<EnforcementDtos.ExemptionDocumentResponse> attach(
            @PathVariable UUID id,
            @RequestPart("title") String title,
            @RequestPart("file") MultipartFile file) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        ExemptionDocument document = documentService.attach(tenantId, id, title, bytesOf(file),
                file.getOriginalFilename(), actor());
        auditRecorder.record(AuditAction.PLATE_EXEMPTION_DOCUMENT_ATTACHED, "plate-exemption", id.toString(),
                Map.of("documentId", document.getId().toString(), "sha256", document.getSha256()));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(mapper.toExemptionDocuments(List.of(document)).get(0));
    }

    /**
     * Reads one document back.
     *
     * <p>The storage key is never taken from the request: it is read off a row already narrowed by
     * municipality and by permit. {@code Content-Disposition: attachment} and {@code nosniff} together
     * mean the browser saves the file rather than rendering it in the platform's own origin.</p>
     */
    @GetMapping("/{id}/documents/{documentId}")
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Download a backing document")
    public ResponseEntity<byte[]> document(@PathVariable UUID id, @PathVariable UUID documentId) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        ExemptionDocumentService.Download download = documentService.read(tenantId, id, documentId);
        EvidenceStorage.Content content = download.content();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(download.document().getContentType()))
                .contentLength(content.byteSize())
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + download.document().getId() + "\"")
                .header("X-Content-Type-Options", "nosniff")
                .cacheControl(CacheControl.noStore())
                .body(content.content());
    }

    // --- internals --------------------------------------------------------------------------------

    /**
     * The category a request with no category falls into.
     *
     * <p>Only the deprecated v0.28 shape reaches this: a client that names no category is one written
     * before categories existed, and the generic one is what V29_0 assigned to every row it migrated.
     * Goes with the deprecated field.</p>
     */
    private UUID defaultTypeId(TenantId tenantId) {
        return typeService.listActive(tenantId).stream()
                .filter(type -> "SPECIAL".equals(type.getCode()))
                .findFirst()
                .or(() -> typeService.listActive(tenantId).stream().findFirst())
                .map(ExemptionType::getId)
                .orElseThrow(() -> new ValidationException("exemptionTypeId", ErrorCode.VALIDATION_FAILED,
                        "error.exemption.type.notFound"));
    }

    /**
     * What an audit entry says about a permit.
     *
     * <p>The plate is in it, unlike most administrative entries: "why was this car never fined" is a
     * question somebody eventually asks, and a plate is not a personal identifier — it is painted on a
     * vehicle in public. The <b>beneficiary</b> is deliberately not: naming the person in an audit
     * entry would copy an identity document into a table that is never deleted.
     */
    private Map<String, Object> details(PlateExemption exemption, Map<String, String> extra) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("plates", String.join(",", exemptionService.platesOf(exemption.getId()).stream()
                .map(ExemptionPlate::getPlate).toList()));
        details.put("status", exemption.getStatus().name());
        details.put("validTo", exemption.getValidTo() == null ? "none" : exemption.getValidTo().toString());
        details.putAll(extra);
        return details;
    }

    private static UserId actor() {
        return TenantContextHolder.current().map(TenantContext::userId).orElse(null);
    }

    private static byte[] bytesOf(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (java.io.IOException failure) {
            throw new java.io.UncheckedIOException("Could not read the uploaded document", failure);
        }
    }
}
