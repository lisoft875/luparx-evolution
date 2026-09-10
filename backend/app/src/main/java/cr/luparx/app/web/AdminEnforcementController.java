package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.web.dto.EnforcementDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.enforcement.entity.AppealNotice;
import cr.luparx.enforcement.entity.Citation;
import cr.luparx.enforcement.entity.CitationAppeal;
import cr.luparx.enforcement.entity.CitationEvidence;
import cr.luparx.enforcement.entity.InfractionType;
import cr.luparx.enforcement.model.AppealStatus;
import cr.luparx.enforcement.model.CitationAction;
import cr.luparx.enforcement.model.CitationStatus;
import cr.luparx.enforcement.model.EnforcementActor;
import cr.luparx.enforcement.port.EvidenceStorage;
import cr.luparx.enforcement.service.AppealNoticeService;
import cr.luparx.enforcement.service.AppealService;
import cr.luparx.enforcement.entity.EnforcementCheck;
import cr.luparx.enforcement.model.PlateVerdict;
import cr.luparx.enforcement.service.CitationService;
import cr.luparx.enforcement.service.EnforcementCheckService;
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

import java.time.Clock;
import java.time.Duration;
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

    /** Default span of the activity screen when the caller names no dates. */
    private static final Duration DEFAULT_CHECK_WINDOW = Duration.ofDays(30);

    private final CitationService citationService;
    private final EnforcementCheckService checkService;
    private final Clock clock;
    private final EvidenceService evidenceService;
    private final InfractionTypeService infractionTypeService;
    private final AppealService appealService;
    private final AppealNoticeService noticeService;
    private final EnforcementMapper mapper;
    private final AuditRecorder auditRecorder;

    public AdminEnforcementController(CitationService citationService,
                                      EnforcementCheckService checkService,
                                      Clock clock,
                                      EvidenceService evidenceService,
                                      InfractionTypeService infractionTypeService,
                                      AppealService appealService,
                                      AppealNoticeService noticeService,
                                      EnforcementMapper mapper,
                                      AuditRecorder auditRecorder) {
        this.citationService = citationService;
        this.checkService = checkService;
        this.clock = clock;
        this.evidenceService = evidenceService;
        this.infractionTypeService = infractionTypeService;
        this.appealService = appealService;
        this.noticeService = noticeService;
        this.mapper = mapper;
        this.auditRecorder = auditRecorder;
    }

    /**
     * The fiscalisation log: what each officer consulted, where, with what result, and whether a
     * citation came out of it (CONTRACT.md v0.29).
     *
     * <p>This is the screen somebody opens when a citizen says "they fined me without coming to look
     * at my car", and the one a supervisor opens to see a shift. Until v0.29 neither question had an
     * answer: the citation was recorded three ways over and the <em>consultation</em> was recorded
     * nowhere.</p>
     *
     * <p>Behind {@code ENFORCEMENT_MANAGE} rather than the broader {@code CITATION_READ}. These rows
     * carry an officer's movements through a shift — where they were and when — which is personal
     * data about an employee, and the people who need it are the ones who run enforcement, not
     * everyone who may read a citation.</p>
     *
     * <p>The window is mandatory and bounded by the server. This is the largest table the platform
     * has, and "everything, newest first" is a query that gets slower every day the municipality
     * operates.</p>
     */
    @GetMapping("/checks")
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Plate lookups made by this municipality's officers (paginated)")
    public PageResponse<EnforcementDtos.EnforcementCheckResponse> checks(
            @RequestParam(required = false) UUID inspectorUserId,
            @RequestParam(required = false) UUID zoneId,
            @RequestParam(required = false) String plate,
            @RequestParam(required = false) PlateVerdict verdict,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        PageRequest request = PageRequest.parse(page, size, null);
        Instant end = to == null ? clock.instant() : to;
        // A month back by default: long enough for the appeal window that prompts most of these
        // queries, short enough that opening the screen is never an accidental full scan.
        Instant start = from == null ? end.minus(DEFAULT_CHECK_WINDOW) : from;
        PageResponse<EnforcementCheck> checks = checkService.search(tenantId, inspectorUserId, zoneId,
                plate, verdict, start, end, request);
        return PageResponse.of(mapper.toChecks(tenantId, checks.items()), request.page(), request.size(),
                checks.totalElements());
    }

    private String appealBasePath(UUID citationId) {
        return "/api/v1/admin/enforcement/citations/" + citationId + "/evidence";
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

    // --- appeals ------------------------------------------------------------------------------------

    /**
     * The moderation queue: defences waiting for a decision, oldest first.
     *
     * <p>Oldest first and not newest: a queue that shows the most recent at the top is a queue where
     * the oldest case is never reached.</p>
     */
    @GetMapping("/appeals")
    @PreAuthorize("hasAuthority('PERM_CITATION_READ')")
    @Operation(summary = "Defences filed against this municipality's citations")
    public PageResponse<EnforcementDtos.AppealResponse> appeals(
            @RequestParam(required = false, defaultValue = "SUBMITTED") String status,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        PageRequest request = PageRequest.parse(page, size, null);
        AppealStatus filter = "ALL".equalsIgnoreCase(status) ? null : AppealStatus.parse(status).orElse(null);
        PageResponse<CitationAppeal> appeals = appealService.list(tenantId, filter, request);
        int maxImages = appealService.appealMaxImages(tenantId);
        List<EnforcementDtos.AppealResponse> items = new ArrayList<>(appeals.items().size());
        for (CitationAppeal appeal : appeals.items()) {
            items.add(mapper.toAppeal(appeal, evidenceService.listForAppeal(tenantId, appeal.getId()), maxImages,
                    appealBasePath(appeal.getCitationId())));
        }
        return new PageResponse<>(items, appeals.page(), appeals.size(), appeals.totalElements(),
                appeals.totalPages());
    }

    /**
     * Decides a defence: accept it and the citation is void, reject it and the citation stands.
     *
     * <p>One endpoint for both outcomes because they are one decision, and it replaces the separate
     * {@code /appeal}, {@code /uphold} and {@code /dismiss} routes of v0.7: those could move a
     * citation without there being a defence to answer, which left the citizen reading a resolution
     * to something they never filed. The reason is mandatory in both directions, it lands on the
     * defence and in the citation's own history, and the whole thing is audited.</p>
     */
    @PostMapping("/citations/{id}/appeal/resolve")
    @PreAuthorize("hasAuthority('PERM_CITATION_VOID')")
    @Operation(summary = "Accept or reject the defence filed against a citation, with a reason")
    public EnforcementDtos.CitationDetailResponse resolveAppeal(
            @PathVariable UUID id,
            @Valid @RequestBody EnforcementDtos.ResolveAppealRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        CitationAppeal appeal = appealService.resolve(tenantId, actor(), id, request.accept(), request.reason());
        auditRecorder.record(AuditAction.CITATION_APPEAL_RESOLVED, "citation-appeal", appeal.getId().toString(),
                Map.of("citationId", id.toString(),
                        "outcome", appeal.getStatus().name(),
                        "reason", request.reason()));
        return detail(tenantId, citationService.require(tenantId, id));
    }

    // --- the legal notice, and what a defence may carry -----------------------------------------------

    /**
     * The notice currently in force here, with the version number a client must send back.
     *
     * <p>Falls back to the country default, which is what a municipality that has not written its own
     * is actually showing its citizens.</p>
     */
    @GetMapping("/appeal-notice")
    @PreAuthorize("hasAuthority('PERM_CITATION_READ')")
    @Operation(summary = "The legal notice shown to a citizen before writing a defence")
    public EnforcementDtos.AppealNoticeResponse appealNotice(@RequestParam(required = false) String locale) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        return mapper.toNotice(noticeService.require(tenantId, locale));
    }

    /** Every version this municipality has published, newest first. Nothing is ever removed. */
    @GetMapping("/appeal-notice/versions")
    @PreAuthorize("hasAuthority('PERM_CITATION_READ')")
    @Operation(summary = "Published versions of this municipality's legal notice")
    public List<EnforcementDtos.AppealNoticeResponse> appealNoticeVersions(
            @RequestParam(required = false) String locale) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        List<EnforcementDtos.AppealNoticeResponse> body = new ArrayList<>();
        for (AppealNotice notice : noticeService.history(tenantId, locale)) {
            body.add(mapper.toNotice(notice));
        }
        return body;
    }

    /**
     * Publishes a new version of the notice.
     *
     * <p>{@code PUT} that <b>inserts</b>, deliberately: editing the text in place would rewrite what
     * citizens accepted in the past, and {@code citation_appeals} points at the exact version each of
     * them read. An {@code effectiveFrom} in the future is allowed and is how a municipality prepares
     * a change without it appearing on screens today.</p>
     *
     * <p><b>The seeded Costa Rican wording is a starting point, not legal advice.</b> This endpoint
     * exists so the client's lawyer can replace it without a deployment, and it should be reviewed by
     * them before production.</p>
     */
    @PutMapping("/appeal-notice")
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Publish a new version of the legal notice shown before a defence")
    public EnforcementDtos.AppealNoticeResponse publishAppealNotice(
            @Valid @RequestBody EnforcementDtos.PublishAppealNoticeRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        AppealNotice notice = noticeService.publish(tenantId, request.locale(), request.body(),
                request.effectiveFrom(), TenantContextHolder.requireUserId());
        auditRecorder.record(AuditAction.APPEAL_NOTICE_PUBLISHED, "appeal-notice", notice.getId().toString(),
                Map.of("version", String.valueOf(notice.getVersion()), "locale", notice.getLocale()));
        return mapper.toNotice(notice);
    }

    @GetMapping("/settings")
    @PreAuthorize("hasAuthority('PERM_CITATION_READ')")
    @Operation(summary = "Enforcement settings of this municipality")
    public EnforcementDtos.EnforcementSettingsResponse settings() {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        return new EnforcementDtos.EnforcementSettingsResponse(appealService.appealMaxImages(tenantId));
    }

    /** How many photographs a defence may carry here. Zero is legal and means "text only". */
    @PutMapping("/settings")
    @PreAuthorize("hasAuthority('PERM_ENFORCEMENT_MANAGE')")
    @Operation(summary = "Change how many images a defence may carry in this municipality")
    public EnforcementDtos.EnforcementSettingsResponse updateSettings(
            @Valid @RequestBody EnforcementDtos.UpdateEnforcementSettingsRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        appealService.updateSettings(tenantId, request.appealMaxImages().intValue());
        auditRecorder.record(AuditAction.ENFORCEMENT_SETTINGS_UPDATED, "enforcement-settings",
                tenantId.value().toString(), Map.of("appealMaxImages", String.valueOf(request.appealMaxImages())));
        return new EnforcementDtos.EnforcementSettingsResponse(appealService.appealMaxImages(tenantId));
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
                mapper.toEvidenceList(evidence, appealBasePath(citation.getId())),
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
