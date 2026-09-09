package cr.luparx.app.web;

import cr.luparx.app.web.dto.EnforcementDtos;
import cr.luparx.core.error.NotImplementedException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.enforcement.entity.Citation;
import cr.luparx.enforcement.entity.CitationEvidence;
import cr.luparx.enforcement.entity.InfractionType;
import cr.luparx.enforcement.model.CitationStatus;
import cr.luparx.enforcement.port.EvidenceStorage;
import cr.luparx.enforcement.service.CitationService;
import cr.luparx.enforcement.service.EvidenceService;
import cr.luparx.enforcement.service.InfractionTypeService;
import cr.luparx.parking.entity.Vehicle;
import cr.luparx.parking.service.VehicleService;
import io.swagger.v3.oas.annotations.Operation;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

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
    private final VehicleService vehicleService;
    private final EnforcementMapper mapper;

    public CitizenFinesController(CitationService citationService,
                                  EvidenceService evidenceService,
                                  InfractionTypeService infractionTypeService,
                                  VehicleService vehicleService,
                                  EnforcementMapper mapper) {
        this.citationService = citationService;
        this.evidenceService = evidenceService;
        this.infractionTypeService = infractionTypeService;
        this.vehicleService = vehicleService;
        this.mapper = mapper;
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
        List<CitationEvidence> evidence = evidenceService.list(tenantId, citation.getId());
        boolean appealable = Boolean.TRUE.equals(appealableByType(tenantId).get(citation.getInfractionTypeId()))
                && citation.getStatus().isPayable();
        return new EnforcementDtos.FineDetailResponse(
                mapper.toFine(citation, mapper.zonesOf(tenantId.value()), appealable, evidence.size()),
                mapper.toEvidenceList(evidence, "/api/v1/citizen/fines/" + citation.getId() + "/evidence"),
                mapper.toHistory(citationService.history(tenantId, citation.getId())));
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

    /**
     * Paying a fine online — declared, not implemented.
     *
     * <p>The contract is fixed here so the client can be built against it and so no other module
     * claims the path: {@code POST /api/v1/citizen/fines/{id}/payments} with an
     * {@code Idempotency-Key}, a body naming the payment method, and a response carrying the citation
     * in its new state. What it will do is already modelled — {@code CitationStatus.PAID} is in the
     * transition table and the amount payable (the reduced one while the early window is open) is
     * already computed by the server on every read — so the payments batch adds the provider, the
     * receipt and the reconciliation, not a new concept.</p>
     *
     * <p>It answers {@code 501 NOT_IMPLEMENTED} rather than 404, so a client can tell "declared but
     * not built yet" from "wrong URL".</p>
     */
    @PostMapping("/{id}/payments")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Pay a fine — reserved, arrives with the payments batch")
    public void pay(@PathVariable UUID id) {
        throw new NotImplementedException("error.notImplemented.finePayment");
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
