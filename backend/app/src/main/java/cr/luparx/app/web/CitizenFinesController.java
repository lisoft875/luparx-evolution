package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.web.dto.EnforcementDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.error.NotImplementedException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.enforcement.entity.Citation;
import cr.luparx.enforcement.entity.CitationAppeal;
import cr.luparx.enforcement.entity.CitationEvidence;
import cr.luparx.enforcement.entity.InfractionType;
import cr.luparx.enforcement.model.CitationStatus;
import cr.luparx.enforcement.model.EnforcementActor;
import cr.luparx.enforcement.port.EvidenceStorage;
import cr.luparx.enforcement.service.AppealNoticeService;
import cr.luparx.enforcement.service.AppealService;
import cr.luparx.app.billing.FinePaymentService;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.UserId;
import cr.luparx.enforcement.service.CitationService;
import cr.luparx.enforcement.service.EvidenceService;
import cr.luparx.enforcement.service.InfractionTypeService;
import cr.luparx.parking.entity.Vehicle;
import cr.luparx.parking.service.VehicleService;
import cr.luparx.tenancy.service.EffectiveLocaleService;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The citizen's fines in the municipality they are currently in.
 *
 * <h2>Why fines are matched by vehicle and not by plate</h2>
 *
 * <p>A plate on this platform is unique <em>per citizen</em>, never globally: anybody may register any
 * plate, because that is what makes a shared family car and a company car work. Listing "every
 * citation whose plate matches one I typed into my garage" would therefore hand one person another
 * person's fines — a leak anybody could trigger deliberately by registering a plate they do not own.
 * So the listing is narrowed to citations <b>linked to one of the caller's own vehicles</b>, and that
 * link is only made at issue time when the plate resolves to exactly one registered vehicle on the
 * platform.</p>
 *
 * <p>The consequence is stated rather than hidden: when two citizens registered the same plate, the
 * citation is linked to neither, and neither sees it in the app. That is the safe failure — the
 * municipality still delivers it the way it delivered citations before this platform existed, and the
 * administration can link it from the back office. Showing it to both would be the unsafe one.</p>
 */
@RestController
@RequestMapping("/api/v1/citizen/fines")
@Tag(name = "Citizen · Fines", description = "Citations against the citizen's own vehicles.")
public class CitizenFinesController {

    private final CitationService citationService;
    private final EvidenceService evidenceService;
    private final InfractionTypeService infractionTypeService;
    private final AppealService appealService;
    private final AppealNoticeService noticeService;
    private final EffectiveLocaleService localeService;
    private final VehicleService vehicleService;
    private final EnforcementMapper mapper;
    private final AuditRecorder auditRecorder;
    private final FinePaymentService finePaymentService;

    public CitizenFinesController(CitationService citationService,
                                  EvidenceService evidenceService,
                                  InfractionTypeService infractionTypeService,
                                  AppealService appealService,
                                  AppealNoticeService noticeService,
                                  EffectiveLocaleService localeService,
                                  VehicleService vehicleService,
                                  EnforcementMapper mapper,
                                  AuditRecorder auditRecorder,
                                  FinePaymentService finePaymentService) {
        this.citationService = citationService;
        this.evidenceService = evidenceService;
        this.infractionTypeService = infractionTypeService;
        this.appealService = appealService;
        this.noticeService = noticeService;
        this.localeService = localeService;
        this.vehicleService = vehicleService;
        this.mapper = mapper;
        this.auditRecorder = auditRecorder;
        this.finePaymentService = finePaymentService;
    }

    /**
     * My fines in this municipality, newest first.
     *
     * <p>Paginated like every collection that can grow, and never cached: an amount that changes the
     * day a discount window closes must not be shown from yesterday.</p>
     */
    @GetMapping
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Citations against my vehicles in the active municipality")
    public PageResponse<EnforcementDtos.FineResponse> fines(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        List<UUID> vehicleIds = ownVehicleIds(TenantContextHolder.requireUserId());
        PageRequest request = PageRequest.parse(page, size, null);
        CitationStatus filter = CitationStatus.parse(status).orElse(null);
        PageResponse<Citation> citations = citationService.listForVehicles(tenantId, vehicleIds, filter, request);
        return new PageResponse<>(mapper.toFines(citations.items(), tenantId.value(), appealableByType(tenantId)),
                citations.page(), citations.size(), citations.totalElements(), citations.totalPages());
    }

    /**
     * One of my fines, with the evidence and the history behind it.
     *
     * <p>The citizen sees the same history the office sees. That is the point of keeping it inside the
     * citation: whoever is being fined is entitled to know what happened to the act — when it was
     * issued, whether it was annulled and on what grounds — without having to ask for it.</p>
     */
    @GetMapping("/{id}")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "One of my fines, with its evidence and history")
    public EnforcementDtos.FineDetailResponse fine(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        List<UUID> vehicleIds = ownVehicleIds(TenantContextHolder.requireUserId());
        Citation citation = citationService.requireForVehicles(tenantId, vehicleIds, id);
        return detailOf(tenantId, citation);
    }

    /**
     * The citation as the detail screen reads it. Extracted in v0.41 so that paying can answer with
     * exactly the same shape the screen already knows how to render, instead of a second one.
     */
    private EnforcementDtos.FineDetailResponse detailOf(TenantId tenantId, Citation citation) {
        List<CitationEvidence> evidence = evidenceService.list(tenantId, citation.getId());
        boolean appealable = Boolean.TRUE.equals(appealableByType(tenantId).get(citation.getInfractionTypeId()))
                && citation.getStatus().isPayable();
        return new EnforcementDtos.FineDetailResponse(
                mapper.toFine(citation, mapper.zonesOf(tenantId.value()), appealable, evidence.size()),
                mapper.toEvidenceList(evidence, "/api/v1/citizen/fines/" + citation.getId() + "/evidence"),
                mapper.toHistory(citationService.history(tenantId, citation.getId())),
                appealService.findForCitation(tenantId, citation.getId())
                        .map(appeal -> mapper.toAppeal(appeal,
                                evidenceService.listForAppeal(tenantId, appeal.getId()),
                                appealService.appealMaxImages(tenantId),
                                "/api/v1/citizen/fines/" + citation.getId() + "/evidence"))
                        .orElse(null));
    }

    /**
     * The photograph the officer took, as the citizen is entitled to see it.
     *
     * <p>Reachable only through a citation that is already narrowed to the caller's own vehicles, so
     * an identifier guessed from another person's fine resolves to nothing.</p>
     */
    @GetMapping("/{id}/evidence/{evidenceId}")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "A photograph attached to one of my fines")
    public ResponseEntity<byte[]> evidenceContent(@PathVariable UUID id, @PathVariable UUID evidenceId) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        List<UUID> vehicleIds = ownVehicleIds(TenantContextHolder.requireUserId());
        citationService.requireForVehicles(tenantId, vehicleIds, id);
        EvidenceStorage.Content content = evidenceService.read(tenantId, id, evidenceId);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                // parseMediaType, not a raw header: setting it by hand makes Spring append a charset
                // to an image type, which is meaningless for bytes and confuses strict clients.
                .contentType(MediaType.parseMediaType(content.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .body(content.content());
    }

    // --- defence ---------------------------------------------------------------------------------

    /**
     * The legal notice the citizen must read before writing a defence.
     *
     * <p>A literal path segment, so it never collides with {@code /{id}}. The response carries the
     * notice's identifier, and filing a defence requires sending that identifier back: the point of
     * the whole mechanism is being able to prove afterwards which exact wording was on screen. It is
     * resolved for the caller's effective locale, falling back to the municipality's and then to the
     * country default (CONTRACT.md v0.8).</p>
     *
     * <p>Never cached. A municipality that publishes a corrected wording — because its lawyer changed
     * it — must not have citizens accepting yesterday's from a cache.</p>
     */
    @GetMapping("/appeal-notice")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "The legal notice to accept before filing a defence")
    public ResponseEntity<EnforcementDtos.AppealNoticeResponse> appealNotice() {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        // The caller's effective locale, resolved by the same deterministic rule as everything else
        // the citizen reads (CONTRACT.md v0.3): what the request asked for, then the municipality's,
        // then the platform default.
        String locale = localeService.resolveTag(null, tenantId);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(mapper.toNotice(noticeService.require(tenantId, locale)));
    }

    /**
     * Files a defence against one of my fines.
     *
     * <p>Text first, images afterwards on their own endpoint: what makes the defence exist is what
     * the person wrote, and a citizen on a bad connection must not lose it because an upload failed.
     * The citation moves to {@code APPEALED} in the same transaction, so the municipality sees the
     * case and the citizen sees the state at the same moment.</p>
     *
     * <p>{@code acceptedNoticeId} must be the notice currently in force; anything else is
     * {@code APPEAL_NOTICE_OUTDATED} (409) and the client re-displays the text.</p>
     */
    @PostMapping("/{id}/appeals")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "File a defence against one of my fines")
    public EnforcementDtos.AppealResponse fileAppeal(@PathVariable UUID id,
                                                     @Valid @RequestBody EnforcementDtos.FileAppealRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        UserId userId = TenantContextHolder.requireUserId();
        String locale = localeService.resolveTag(null, tenantId);
        CitationAppeal appeal = appealService.file(tenantId, actor(), ownVehicleIds(userId), id, request.body(),
                request.acceptedNoticeId(), locale);
        auditRecorder.record(AuditAction.CITATION_APPEAL_FILED, "citation-appeal", appeal.getId().toString(),
                Map.of("citationId", id.toString(),
                        "noticeId", appeal.getNoticeId().toString(),
                        "noticeVersion", String.valueOf(appeal.getNoticeVersion())));
        return toAppeal(tenantId, appeal);
    }

    /** My defence and where it stands, including the municipality's reason once it is decided. */
    @GetMapping("/{id}/appeal")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "The defence I filed against one of my fines")
    public EnforcementDtos.AppealResponse appeal(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        UserId userId = TenantContextHolder.requireUserId();
        CitationAppeal appeal = appealService.requireOwn(tenantId, ownVehicleIds(userId), id);
        appealService.requireAuthor(appeal, userId);
        return toAppeal(tenantId, appeal);
    }

    /**
     * Attaches a photograph to my defence.
     *
     * <p><b>The server decides, not the client.</b> The app is expected to compress before sending,
     * but the limit that counts is checked here: 1 MB per image, the type read from the file's own
     * header, and a count the municipality configures. Only while the defence is still open — adding
     * evidence to a case already decided would be editing history.</p>
     */
    @PostMapping(value = "/{id}/appeal/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Attach a photograph to my defence (1 MB per image, server-enforced)")
    public EnforcementDtos.EvidenceResponse appealImage(@PathVariable UUID id,
                                                        @RequestPart("file") MultipartFile file) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        UserId userId = TenantContextHolder.requireUserId();
        CitationAppeal appeal = appealService.requireOpenOwn(tenantId, userId, ownVehicleIds(userId), id);
        CitationEvidence evidence = evidenceService.attachAppealPhoto(tenantId, actor(), appeal,
                appealService.appealMaxImages(tenantId), bytesOf(file), file.getOriginalFilename(), null, null,
                null);
        auditRecorder.record(AuditAction.CITATION_EVIDENCE_ATTACHED, "citation-appeal", appeal.getId().toString(),
                Map.of("evidenceId", evidence.getId().toString(),
                        "source", "CITIZEN",
                        "sha256", evidence.getSha256() == null ? "-" : evidence.getSha256()));
        return mapper.toEvidence(evidence, "/api/v1/citizen/fines/" + id + "/evidence/" + evidence.getId());
    }

    /**
     * Pay a fine with the balance already in the wallet (CONTRACT.md v0.41).
     *
     * <p>Declared since v0.1 and answering {@code 501} until now; the contract it reserved is the one
     * implemented here, unchanged: an {@code Idempotency-Key}, a body naming the means, and a response
     * carrying the citation in its new state.</p>
     *
     * <p><b>The amount is never in the request.</b> What is payable today is the server's to say — it
     * is the reduced figure while the early-payment window is open and the full one after — and a body
     * that could carry a figure would be a client naming its own price.</p>
     *
     * <p>Paying <b>withdraws</b> a defence the citizen had waiting, and the response says so, because
     * they gave something up and finding that out later from a history row is finding out the wrong
     * way. A defence filed by somebody else who registered the same plate is not the payer's to
     * withdraw, and the payment is refused rather than quietly destroying it.</p>
     */
    @PostMapping("/{id}/payments")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Pay one of my fines with my wallet balance")
    public EnforcementDtos.FinePaymentResponse pay(
            @PathVariable UUID id,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody EnforcementDtos.PayFineRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        UserId userId = TenantContextHolder.requireUserId();
        if (!"WALLET".equalsIgnoreCase(request.method() == null ? "" : request.method().trim())) {
            // Named rather than ignored: a client that asks for CARD today must hear that it is not
            // available yet, not be charged to its wallet instead.
            throw new ValidationException("method", ErrorCode.VALIDATION_FAILED,
                    "error.enforcement.citation.paymentMethodUnsupported");
        }
        FinePaymentService.Result result = finePaymentService.pay(tenantId, userId, actor(),
                ownVehicleIds(userId), id, idempotencyKey);

        auditRecorder.record(AuditAction.CITATION_PAID, "citation", id.toString(),
                Map.of("number", result.citation().getNumber() == null ? "-" : result.citation().getNumber(),
                        "amountMinor", String.valueOf(result.charged().minorUnits()),
                        "appealWithdrawn", String.valueOf(result.withdrewAppeal())));
        return new EnforcementDtos.FinePaymentResponse(
                detailOf(tenantId, result.citation()),
                mapper.toMoney(result.charged()),
                result.withdrewAppeal(),
                result.movement() == null ? null : result.movement().getId());
    }

    private EnforcementDtos.AppealResponse toAppeal(TenantId tenantId, CitationAppeal appeal) {
        return mapper.toAppeal(appeal, evidenceService.listForAppeal(tenantId, appeal.getId()),
                appealService.appealMaxImages(tenantId),
                "/api/v1/citizen/fines/" + appeal.getCitationId() + "/evidence");
    }

    private EnforcementActor actor() {
        return EnforcementActor.of(TenantContextHolder.requireUserId(), TenantContextHolder.require().portal(),
                auditRecorder.currentIpHash());
    }

    private byte[] bytesOf(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (java.io.IOException failure) {
            throw new java.io.UncheckedIOException("Could not read the uploaded image", failure);
        }
    }

    private List<UUID> ownVehicleIds(UserId userId) {
        List<Vehicle> vehicles = vehicleService.listOwn(userId);
        List<UUID> ids = new ArrayList<>(vehicles.size());
        for (Vehicle vehicle : vehicles) {
            ids.add(vehicle.getId());
        }
        return ids;
    }

    /**
     * Whether each kind of infraction admits a defence, resolved once per response. The catalogue of a
     * municipality is a short list, so this is one query — not one per fine on the screen.
     */
    private Map<UUID, Boolean> appealableByType(TenantId tenantId) {
        Map<UUID, Boolean> appealable = new HashMap<>();
        for (InfractionType type : infractionTypeService.list(tenantId)) {
            appealable.put(type.getId(), type.isAllowsAppeal());
        }
        return appealable;
    }
}
