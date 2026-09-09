package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.idempotency.IdempotencyFilter;
import cr.luparx.app.web.dto.EnforcementDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.enforcement.entity.Citation;
import cr.luparx.enforcement.entity.CitationEvidence;
import cr.luparx.enforcement.entity.InfractionType;
import cr.luparx.enforcement.model.EnforcementActor;
import cr.luparx.enforcement.model.PlateStatus;
import cr.luparx.enforcement.port.EvidenceStorage;
import cr.luparx.enforcement.service.CitationService;
import cr.luparx.enforcement.service.EvidenceService;
import cr.luparx.enforcement.service.InfractionTypeService;
import cr.luparx.enforcement.service.PlateStatusService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The inspector's portal: look a plate up, write a citation, attach what you photographed.
 *
 * <p>Everything here is scoped to the municipality in the officer's token and to the officer
 * themselves. There is no parameter anywhere on this controller that selects a tenant, and the
 * listing is of the officer's own work — an inspector of Cartago cannot reach a citation of San José
 * because the query that would allow it does not exist in the repository.</p>
 *
 * <p><b>Built for a street with no signal.</b> Writing a citation requires an
 * {@code Idempotency-Key} (enforced by {@link IdempotencyFilter}, which replays the stored response
 * for a repeated key) and accepts a {@code deviceCitationId} generated on the device. The two protect
 * different things: the header protects the <em>request</em>, so a double tap replays; the device
 * identifier protects the <em>act</em>, so a queue flushed twice — or an app reinstalled mid-shift,
 * with brand-new keys — still produces one citation and not two.</p>
 */
@RestController
@RequestMapping("/api/v1/inspector")
@Tag(name = "Inspector · Enforcement",
        description = "Plate lookup, citations and evidence, inside the officer's municipality.")
public class InspectorEnforcementController {

    /**
     * The infraction catalogue is configuration a municipality changes a few times a year, and the
     * officer's device asks for it at the start of a shift. Five minutes is short enough that a
     * corrected amount reaches the street the same morning.
     */
    private static final Duration CATALOGUE_CACHE_TTL = Duration.ofMinutes(5);

    private final PlateStatusService plateStatusService;
    private final CitationService citationService;
    private final EvidenceService evidenceService;
    private final InfractionTypeService infractionTypeService;
    private final EnforcementMapper mapper;
    private final AuditRecorder auditRecorder;

    public InspectorEnforcementController(PlateStatusService plateStatusService,
                                          CitationService citationService,
                                          EvidenceService evidenceService,
                                          InfractionTypeService infractionTypeService,
                                          EnforcementMapper mapper,
                                          AuditRecorder auditRecorder) {
        this.plateStatusService = plateStatusService;
        this.citationService = citationService;
        this.evidenceService = evidenceService;
        this.infractionTypeService = infractionTypeService;
        this.mapper = mapper;
        this.auditRecorder = auditRecorder;
    }

    /**
     * Has this plate paid, on this bay, right now?
     *
     * <p>The bay is optional in the signature and decisive in the answer: without it the verdict is
     * {@code AMBIGUOUS} whenever any session matches, because plates repeat between citizens and the
     * platform will not guess which car in the street is the one that paid. See {@code PlateVerdict}
     * for the whole rule — it is the resolution of the open question the parking module left.</p>
     *
     * <p>Never cached. A citizen who pays while the officer is walking up to the car must be covered
     * by the time the officer looks, and a cached "not covered" from thirty seconds ago is how an
     * unjust citation gets written.</p>
     */
    @GetMapping("/plates/{plate}/status")
    @PreAuthorize("hasAuthority('PERM_CITATION_READ')")
    @Operation(summary = "Whether a plate has a running parking session on the bay being inspected")
    public ResponseEntity<EnforcementDtos.PlateStatusResponse> plateStatus(
            @PathVariable String plate,
            @RequestParam(required = false) UUID zoneId,
            @RequestParam(required = false) String spaceCode) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        PlateStatus status = plateStatusService.lookup(tenantId, plate, zoneId, spaceCode);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(mapper.toPlateStatus(status));
    }

    /** What this municipality fines, for the officer's picker. Only the kinds still in force. */
    @GetMapping("/enforcement/infraction-types")
    @PreAuthorize("hasAuthority('PERM_CITATION_ISSUE')")
    @Operation(summary = "Infraction types in force in this municipality")
    public ResponseEntity<List<EnforcementDtos.InfractionTypeResponse>> infractionTypes() {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        List<InfractionType> types = infractionTypeService.listActive(tenantId);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(CATALOGUE_CACHE_TTL).cachePrivate())
                .body(mapper.toInfractionTypes(types));
    }

    /** The officer's own citations, newest first. Always paginated: a shift writes many. */
    @GetMapping("/citations")
    @PreAuthorize("hasAuthority('PERM_CITATION_READ')")
    @Operation(summary = "Citations I wrote in this municipality")
    public PageResponse<EnforcementDtos.CitationResponse> citations(
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        PageRequest request = PageRequest.parse(page, size, null);
        PageResponse<Citation> citations = citationService.listForInspector(tenantId,
                TenantContextHolder.requireUserId().value(), request);
        return new PageResponse<>(mapper.toCitations(citations.items(), tenantId.value()), citations.page(),
                citations.size(), citations.totalElements(), citations.totalPages());
    }

    /** One of my citations, with its evidence and its history. */
    @GetMapping("/citations/{id}")
    @PreAuthorize("hasAuthority('PERM_CITATION_READ')")
    @Operation(summary = "One citation of this municipality, with evidence and history")
    public EnforcementDtos.CitationDetailResponse citation(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        Citation citation = citationService.requireCurrent(tenantId, actor(), id);
        return detail(tenantId, citation);
    }

    /**
     * Write a citation. Requires {@code Idempotency-Key}.
     *
     * <p>Answers {@code 201} when this call created the act and {@code 200} when it recognised a
     * resend by its {@code deviceCitationId} and returned the citation that already existed. The
     * distinction is deliberate: a device flushing a queue needs to know it did not create a second
     * ticket, and a silent 201 for a duplicate would tell it the opposite.</p>
     *
     * <p>A citation whose infraction type demands a photograph comes back as {@code DRAFT} with no
     * number: the act is captured, and {@code POST /citations/{id}/issue} closes it once the upload
     * lands. Everything else is issued immediately.</p>
     */
    @PostMapping("/citations")
    @PreAuthorize("hasAuthority('PERM_CITATION_ISSUE')")
    @Operation(summary = "Write a citation. Requires Idempotency-Key; idempotent by deviceCitationId too.")
    public ResponseEntity<EnforcementDtos.CitationDetailResponse> create(
            @RequestHeader(value = IdempotencyFilter.HEADER, required = false) String idempotencyKey,
            @Valid @RequestBody EnforcementDtos.CreateCitationRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        EnforcementActor actor = actor();
        CitationService.Captured captured = citationService.capture(tenantId, actor,
                new CitationService.Capture(request.infractionTypeId(), request.plate(), request.zoneId(),
                        request.spaceId(), request.spaceCode(), request.latitude(), request.longitude(),
                        request.locationAccuracyM(), request.addressText(), request.occurredAt(),
                        request.deviceCitationId(), request.parkingSessionId(), request.notes()));
        Citation citation = captured.citation();
        if (captured.created()) {
            audit(citation.getStatus().isDraft() ? AuditAction.CITATION_DRAFTED : AuditAction.CITATION_ISSUED,
                    citation, Map.of("plate", citation.getPlateNormalized(),
                            "infractionCode", citation.getInfractionCode(),
                            "amountMinor", String.valueOf(citation.getFineAmountMinor()),
                            "deviceCitationId", citation.getDeviceCitationId() == null
                                    ? "-" : citation.getDeviceCitationId()));
        }
        return ResponseEntity.status(captured.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(detail(tenantId, citation));
    }

    /** Close a draft: take the number, start the clock on the deadlines. */
    @PostMapping("/citations/{id}/issue")
    @PreAuthorize("hasAuthority('PERM_CITATION_ISSUE')")
    @Operation(summary = "Issue a captured draft once its evidence is attached")
    public EnforcementDtos.CitationDetailResponse issue(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        Citation citation = citationService.issue(tenantId, actor(), id);
        audit(AuditAction.CITATION_ISSUED, citation, Map.of("number", citation.getNumber()));
        return detail(tenantId, citation);
    }

    /**
     * Attach a photograph.
     *
     * <p>{@code multipart/form-data}, because the alternative — a base64 field inside JSON — costs a
     * third more bytes over exactly the connection this module cannot rely on. The type is decided by
     * reading the file's own header, never by its name or the type the device declared.</p>
     */
    @PostMapping(value = "/citations/{id}/evidence", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAuthority('PERM_CITATION_ISSUE')")
    @Operation(summary = "Attach a photograph to a citation")
    public EnforcementDtos.EvidenceResponse uploadEvidence(
            @PathVariable UUID id,
            @RequestPart("file") MultipartFile file,
            @RequestPart(value = "capturedAt", required = false) String capturedAt,
            @RequestPart(value = "latitude", required = false) String latitude,
            @RequestPart(value = "longitude", required = false) String longitude) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        CitationEvidence evidence = evidenceService.attachPhoto(tenantId, actor(), id, bytesOf(file),
                file.getOriginalFilename(), parseInstant(capturedAt), parseDecimal(latitude),
                parseDecimal(longitude));
        auditEvidence(id, evidence);
        return mapper.toEvidence(evidence, evidenceUrl(id, evidence.getId()));
    }

    /** Attach a written note. Same table as a photograph: legally it is the same thing. */
    @PostMapping(value = "/citations/{id}/evidence", consumes = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasAuthority('PERM_CITATION_ISSUE')")
    @Operation(summary = "Attach a written note to a citation")
    public EnforcementDtos.EvidenceResponse addNote(@PathVariable UUID id,
                                                    @Valid @RequestBody EnforcementDtos.CitationNoteRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        CitationEvidence evidence = evidenceService.attachNote(tenantId, actor(), id, request.note());
        auditEvidence(id, evidence);
        return mapper.toEvidence(evidence, null);
    }

    /** The bytes of one photograph. Never cached publicly: it is evidence about a private person. */
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

    // --- helpers ---------------------------------------------------------------------------------

    private EnforcementDtos.CitationDetailResponse detail(TenantId tenantId, Citation citation) {
        List<CitationEvidence> evidence = evidenceService.list(tenantId, citation.getId());
        return new EnforcementDtos.CitationDetailResponse(
                mapper.toCitation(citation, mapper.zonesOf(tenantId.value()), evidence.size()),
                mapper.toEvidenceList(evidence, "/api/v1/inspector/citations/" + citation.getId() + "/evidence"),
                mapper.toHistory(citationService.history(tenantId, citation.getId())));
    }

    private String evidenceUrl(UUID citationId, UUID evidenceId) {
        return "/api/v1/inspector/citations/" + citationId + "/evidence/" + evidenceId;
    }

    /**
     * Who is acting, as the domain records them. The IP arrives hashed with the platform pepper, the
     * same value the audit trail stores, so the citation's own history and the security trail can be
     * correlated without either keeping a raw address.
     */
    private EnforcementActor actor() {
        return EnforcementActor.of(TenantContextHolder.requireUserId(),
                TenantContextHolder.require().portal(), auditRecorder.currentIpHash());
    }

    private void audit(String action, Citation citation, Map<String, Object> metadata) {
        auditRecorder.record(action, "citation", citation.getId().toString(), metadata);
    }

    private void auditEvidence(UUID citationId, CitationEvidence evidence) {
        auditRecorder.record(AuditAction.CITATION_EVIDENCE_ATTACHED, "citation", citationId.toString(),
                Map.of("evidenceId", evidence.getId().toString(),
                        "kind", evidence.getKind().name(),
                        "sha256", evidence.getSha256() == null ? "-" : evidence.getSha256()));
    }

    private byte[] bytesOf(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException failure) {
            throw new UncheckedIOException("Could not read the uploaded evidence", failure);
        }
    }

    /**
     * Multipart parts arrive as text. Both parsers are lenient by design — a device that sends a
     * malformed coordinate should still get its citation, with the field simply absent, rather than a
     * refusal in the middle of a street.
     */
    private Instant parseInstant(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(value.trim());
        } catch (RuntimeException malformed) {
            return null;
        }
    }

    private BigDecimal parseDecimal(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return new BigDecimal(value.trim());
        } catch (NumberFormatException malformed) {
            return null;
        }
    }
}
