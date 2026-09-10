package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.idempotency.IdempotencyFilter;
import cr.luparx.app.outbox.OutboxRecorder;
import cr.luparx.app.web.dto.ParkingDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.outbox.OutboxEventType;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.parking.entity.ParkingPolicy;
import cr.luparx.parking.entity.ParkingRate;
import cr.luparx.parking.model.ZonePriceBook;
import cr.luparx.parking.entity.ParkingScheduleException;
import cr.luparx.parking.entity.ParkingSession;
import cr.luparx.parking.entity.ParkingSessionExtension;
import cr.luparx.parking.entity.ParkingZone;
import cr.luparx.parking.model.ExtensionOption;
import cr.luparx.parking.model.ParkingQuote;
import cr.luparx.parking.model.ParkingSessionStatus;
import cr.luparx.parking.model.ParkingSpaceRange;
import cr.luparx.parking.model.PlateNormalizer;
import cr.luparx.parking.model.SessionVehicleRef;
import cr.luparx.parking.model.ZoneRules;
import cr.luparx.parking.service.ParkingCatalogService;
import cr.luparx.parking.service.ParkingPolicyService;
import cr.luparx.parking.service.ParkingQuoteService;
import cr.luparx.parking.service.ParkingScheduleService;
import cr.luparx.parking.service.ParkingSessionService;
import cr.luparx.parking.service.ParkingSpaceFormatService;
import cr.luparx.parking.service.VehicleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * The citizen parking flow (CONTRACT.md v0.2, "API").
 *
 * <p>The controller is deliberately thin. It resolves who is calling and inside which municipality
 * from {@link TenantContextHolder} — never from a parameter the client controls — hands the request
 * to the domain, and maps the answer. Every rule about increments, credit, charges and caps lives in
 * {@code module-parking}, so that a second entry point (a kiosk, a job, an operator tool) cannot get
 * a different answer than the app.</p>
 *
 * <p>Starting, extending and finishing require an {@code Idempotency-Key}; the header is enforced
 * for these paths by {@link IdempotencyFilter}, which also replays the stored response for a repeated
 * key so a double tap never charges twice (ADR 0012). The key reaches the domain only to be recorded
 * on the rows it creates — it is not a second, parallel replay mechanism.</p>
 */
@RestController
@RequestMapping("/api/v1/citizen/parking")
@Tag(name = "Citizen · Parking", description = "Policy, quotes and parking sessions of the active municipality.")
public class CitizenParkingController {

    /** {@code ?status=} value meaning "the whole history", as opposed to a concrete status. */
    private static final String STATUS_ALL = "ALL";

    /**
     * How long a client may reuse the zone list. Short, because it carries prices: a tariff change
     * has to reach the app before it quotes yesterday's price at somebody.
     */
    private static final Duration ZONES_CACHE_TTL = Duration.ofMinutes(1);

    /** The code format changes when a municipality renumbers its bays, which is to say almost never. */
    private static final Duration SPACE_FORMAT_CACHE_TTL = Duration.ofMinutes(15);

    private final ParkingPolicyService policyService;
    private final ParkingQuoteService quoteService;
    private final ParkingSessionService sessionService;
    private final ParkingScheduleService scheduleService;
    private final ParkingCatalogService catalogService;
    private final ParkingSpaceFormatService spaceFormatService;
    private final VehicleService vehicleService;
    private final ParkingMapper mapper;
    private final AuditRecorder auditRecorder;
    private final OutboxRecorder outboxRecorder;
    private final Clock clock;

    public CitizenParkingController(ParkingPolicyService policyService,
                                    ParkingQuoteService quoteService,
                                    ParkingSessionService sessionService,
                                    ParkingScheduleService scheduleService,
                                    ParkingCatalogService catalogService,
                                    ParkingSpaceFormatService spaceFormatService,
                                    VehicleService vehicleService,
                                    ParkingMapper mapper,
                                    AuditRecorder auditRecorder,
                                    OutboxRecorder outboxRecorder,
                                    Clock clock) {
        this.policyService = policyService;
        this.quoteService = quoteService;
        this.sessionService = sessionService;
        this.scheduleService = scheduleService;
        this.catalogService = catalogService;
        this.spaceFormatService = spaceFormatService;
        this.vehicleService = vehicleService;
        this.mapper = mapper;
        this.auditRecorder = auditRecorder;
        this.outboxRecorder = outboxRecorder;
        this.clock = clock;
    }

    @GetMapping("/policy")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "The parking rules of the active municipality")
    public ParkingDtos.ParkingPolicyResponse policy() {
        ParkingPolicy policy = policyService.require(TenantContextHolder.requireTenantId());
        return mapper.toPolicy(policy);
    }

    /**
     * The zones of the active municipality a citizen may park in, with the price of each.
     *
     * <p>It exists because {@code quote} and {@code sessions} both take a {@code zoneId} and there was
     * no citizen-reachable way to obtain one: the zone listing was on the admin portal, behind
     * {@code PERM_TENANT_MANAGE}, so a client had no choice but to mine zone identifiers out of the
     * caller's own session history — which shows a brand-new citizen an empty list and no way to
     * start.</p>
     *
     * <p>Only zones that are still operated appear, and the tenant is the one in the token, never a
     * parameter. Not paginated: a zone is a sector a municipality operates and the count is bounded by
     * how a city is organised — the collection that grows without limit is the bays inside a zone, and
     * those are only ever read by code. The response is cacheable but {@code private}: it is a
     * tenant's price list resolved for an authenticated caller, so it must never land in a shared
     * cache. One minute, because a tariff change has to reach the app quickly enough that a citizen is
     * never quoted yesterday's price.</p>
     *
     * <p>Each zone carries the <b>range of bay codes</b> it actually has, so the app can put
     * "0001–0500" under the field instead of letting a citizen type 1500 in Barrio Amón and be told
     * only that the code does not exist. The range changes when the municipality paints or retires a
     * bay — rarely — but it rides on this response rather than in a cache of its own: a second cache
     * would need invalidating whenever {@code POST /admin/parking/spaces} runs, and the minute this
     * response already lives for is a cheaper way to be at most a minute stale about a number that
     * changes a few times a year.</p>
     */
    @GetMapping("/zones")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Zones of the active municipality that are still operated, with their tariff")
    public ResponseEntity<List<ParkingDtos.CitizenParkingZoneResponse>> zones() {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        Instant now = clock.instant();
        List<ParkingZone> zones = catalogService.listActiveZones(tenantId);
        Map<UUID, ZonePriceBook> rates = catalogService.ratesInForce(tenantId, now);
        // Both in one aggregate query each, never one per zone: this list grows with the
        // municipality, and an N+1 here would get slower exactly as one succeeds.
        Map<UUID, ParkingSpaceRange> ranges = catalogService.spaceRangesByZone(tenantId);
        // The rules of every zone in two queries, for the same reason (CONTRACT.md v0.31). Since a
        // zone may sell different durations from the municipality, the price ladder of each zone has
        // to be priced against ITS list — pricing them all against the municipality's would show a
        // citizen a duration this zone refuses, or hide one it sells.
        Map<UUID, ZoneRules> rules = policyService.rulesFor(tenantId,
                zones.stream().map(ParkingZone::getId).toList());
        List<ParkingDtos.CitizenParkingZoneResponse> body = new ArrayList<>(zones.size());
        for (ParkingZone zone : zones) {
            ZoneRules zoneRules = rules.get(zone.getId());
            body.add(mapper.toCitizenZone(zone, rates.get(zone.getId()), zoneRules.sessionIncrements().values(),
                    ranges.get(zone.getId()), zoneRules));
        }
        return privatelyCacheable(body, ZONES_CACHE_TTL);
    }

    /**
     * The shape of a bay code in this municipality (CONTRACT.md v0.3, "Formato del código de
     * espacio").
     *
     * <p>The same row the admin portal edits, read here so the citizen app can validate the bay field
     * with {@code pattern} while the person types and show {@code example} as the placeholder, instead
     * of assuming four digits — an assumption that is right for San José today and wrong for the first
     * municipality that paints {@code A-12}.</p>
     */
    @GetMapping("/space-format")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "The bay code format of the active municipality: pattern and example")
    public ResponseEntity<ParkingDtos.ParkingSpaceFormatResponse> spaceFormat() {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        return privatelyCacheable(mapper.toSpaceFormat(spaceFormatService.require(tenantId)),
                SPACE_FORMAT_CACHE_TTL);
    }

    /**
     * When the municipality charges, and whether it is charging right now (CONTRACT.md v0.3,
     * "Horario de cobro").
     *
     * <p>The app needs this to say the sentence the contract asks for — "charging is not running now;
     * it resumes on Monday at 7:00" — and to stop offering a start button that would only earn an
     * {@code OUTSIDE_CHARGING_HOURS}. The time zone travels with it, because every hour here is the
     * municipality's local time and not the device's.</p>
     */
    @GetMapping("/schedule")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Charging hours of the active municipality, and when charging next resumes")
    public ParkingDtos.ParkingScheduleResponse schedule() {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        Instant now = clock.instant();
        List<ParkingScheduleException> exceptions = scheduleService.exceptions(tenantId);
        return mapper.toSchedule(
                scheduleService.require(tenantId),
                scheduleService.slots(tenantId),
                exceptions,
                scheduleService.exceptionBands(exceptions),
                scheduleService.scheduleFor(tenantId, now, now.plusSeconds(370L * 24L * 3600L)),
                now);
    }

    @PostMapping("/quote")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "What a stay would cost, credit included. Nothing is charged or reserved.")
    public ParkingDtos.QuoteResponse quote(@Valid @RequestBody ParkingDtos.QuoteRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        UserId userId = TenantContextHolder.requireUserId();
        // The duration is judged inside `quote`, together with the saved-minute balance it depends
        // on (CONTRACT.md v0.12): one of the durations a citizen may ask for is exactly the minutes
        // they have saved, so the check cannot be made here without reading that balance twice.
        // The plate, when the client says which car it is for: courtesy is limited per plate, so
        // without it the quote cannot tell whether this stay would be free and answers with the price.
        // Resolved exactly the way starting a session resolves it — a registered vehicle's plate comes
        // from the record, never from the request, so nobody can claim somebody else's courtesy.
        String plate = null;
        if (request.vehicleId() != null) {
            plate = vehicleService.requireOwn(userId, request.vehicleId()).getPlateNormalized();
        } else if (request.plate() != null && !request.plate().isBlank()) {
            plate = PlateNormalizer.normalize(request.plate());
        }
        ParkingQuote quote = quoteService.quote(tenantId, userId, request.zoneId(),
                request.minutes().intValue(), plate);
        return mapper.toQuote(quote);
    }

    /**
     * My sessions in this municipality.
     *
     * <p>Always a paginated envelope, including for {@code status=ACTIVE} where the list is short:
     * one shape for one endpoint is worth more to a client than saving a wrapper.</p>
     */
    @GetMapping("/sessions")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "My parking sessions (default: only the running ones)")
    public PageResponse<ParkingDtos.ParkingSessionResponse> sessions(
            @RequestParam(required = false, defaultValue = "ACTIVE") String status,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        UserId userId = TenantContextHolder.requireUserId();
        PageRequest request = PageRequest.parse(page, size, null);
        String normalized = status == null ? "ACTIVE" : status.trim().toUpperCase(Locale.ROOT);

        if (ParkingSessionStatus.ACTIVE.name().equals(normalized)) {
            // Running sessions are bounded by the number of vehicles a person owns, and the domain
            // expires the stale ones on the way out, so this list is short and complete by nature.
            List<ParkingSession> active = sessionService.listActive(tenantId, userId);
            List<ParkingDtos.ParkingSessionResponse> items = mapper.toSessions(active);
            return PageResponse.of(items, 0, request.size(), items.size());
        }
        ParkingSessionStatus filter = STATUS_ALL.equals(normalized) ? null : parseStatus(normalized);
        PageResponse<ParkingSession> sessions = sessionService.listOwn(tenantId, userId, filter, request);
        List<ParkingDtos.ParkingSessionResponse> items = mapper.toSessions(sessions.items());
        return new PageResponse<>(items, sessions.page(), sessions.size(), sessions.totalElements(),
                sessions.totalPages());
    }

    @GetMapping("/sessions/{id}")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "One of my sessions, with its extensions")
    public ParkingDtos.ParkingSessionDetailResponse session(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        UserId userId = TenantContextHolder.requireUserId();
        ParkingSession session = sessionService.requireOwn(tenantId, userId, id);
        List<ParkingSessionExtension> extensions = sessionService.listExtensions(session.getId());
        List<ParkingDtos.ParkingSessionExtensionResponse> mapped = new ArrayList<>(extensions.size());
        for (ParkingSessionExtension extension : extensions) {
            mapped.add(mapper.toExtension(extension));
        }
        return new ParkingDtos.ParkingSessionDetailResponse(mapper.toSession(session), mapped);
    }

    @PostMapping("/sessions")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Start a session. Requires Idempotency-Key.")
    public ParkingDtos.ParkingSessionResponse start(
            @RequestHeader(value = IdempotencyFilter.HEADER, required = false) String idempotencyKey,
            @Valid @RequestBody ParkingDtos.StartSessionRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        UserId userId = TenantContextHolder.requireUserId();
        // Which of the two the request means was already settled by validation (exactly one of the
        // pair is present), so this only names it.
        SessionVehicleRef vehicleRef = request.vehicleId() != null
                ? SessionVehicleRef.registered(request.vehicleId())
                : SessionVehicleRef.guest(request.plate(), request.vehicleType());
        ParkingSession session = sessionService.start(tenantId, userId, request.zoneId(), request.spaceCode(),
                vehicleRef, request.minutes().intValue(), idempotencyKey);
        audit(AuditAction.PARKING_SESSION_STARTED, session,
                Map.of("minutes", String.valueOf(request.minutes()),
                        "amountMinor", String.valueOf(session.getAmountMinor()),
                        "creditMinutes", String.valueOf(session.getCreditMinutesApplied())));
        outboxRecorder.record("parking-session", session.getId().toString(), tenantId,
                OutboxEventType.PARKING_SESSION_STARTED,
                Map.of("sessionId", session.getId().toString(), "spaceId", session.getSpaceId().toString()));
        return mapper.toSession(session);
    }

    /**
     * What extending this session would cost, for every duration the municipality offers.
     *
     * <p>A {@code GET} because nothing happens: no minute is reserved, no money moves. It answers the
     * screen's whole question in one call — each option with its price and the expiry it would
     * produce — rather than making the client quote each duration separately and hope the three
     * answers were computed at the same instant.</p>
     *
     * <p>Not cached at all. The prices depend on the charging hours the session is about to cross and
     * on a credit balance the citizen may spend elsewhere a second later; a minute of staleness here
     * is a number that no longer matches what the extension will charge.</p>
     */
    @GetMapping("/sessions/{id}/extension-options")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Every extension this municipality offers for a session, already priced")
    public List<ParkingDtos.ExtensionOptionResponse> extensionOptions(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        UserId userId = TenantContextHolder.requireUserId();
        List<ExtensionOption> options = sessionService.extensionOptions(tenantId, userId, id);
        List<ParkingDtos.ExtensionOptionResponse> body = new ArrayList<>(options.size());
        for (ExtensionOption option : options) {
            body.add(mapper.toExtensionOption(option));
        }
        return body;
    }

    @PostMapping("/sessions/{id}/extend")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Add time to a running session. Requires Idempotency-Key.")
    public ParkingDtos.ParkingSessionResponse extend(
            @PathVariable UUID id,
            @RequestHeader(value = IdempotencyFilter.HEADER, required = false) String idempotencyKey,
            @Valid @RequestBody ParkingDtos.ExtendSessionRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        UserId userId = TenantContextHolder.requireUserId();
        ParkingSession session = sessionService.extend(tenantId, userId, id, request.minutes().intValue(),
                idempotencyKey);
        audit(AuditAction.PARKING_SESSION_EXTENDED, session,
                Map.of("minutes", String.valueOf(request.minutes()),
                        "expiresAt", session.getExpiresAt().toString()));
        outboxRecorder.record("parking-session", session.getId().toString(), tenantId,
                OutboxEventType.PARKING_SESSION_EXTENDED,
                Map.of("sessionId", session.getId().toString(), "minutes", String.valueOf(request.minutes())));
        return mapper.toSession(session);
    }

    @PostMapping("/sessions/{id}/finish")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Close a session. Remaining minutes come back as credit, never as money. "
            + "Requires Idempotency-Key.")
    public ParkingDtos.ParkingSessionResponse finish(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        UserId userId = TenantContextHolder.requireUserId();
        ParkingSession session = sessionService.finish(tenantId, userId, id);
        audit(AuditAction.PARKING_SESSION_FINISHED, session,
                Map.of("endedAt", String.valueOf(session.getEndedAt())));
        outboxRecorder.record("parking-session", session.getId().toString(), tenantId,
                OutboxEventType.PARKING_SESSION_FINISHED,
                Map.of("sessionId", session.getId().toString()));
        return mapper.toSession(session);
    }

    /**
     * Every parking write is audited with tenant, user, vehicle and space (CONTRACT.md v0.2,
     * "Invariantes"). The plate is the citizen's own datum and is what makes the row readable.
     */
    private void audit(String action, ParkingSession session, Map<String, Object> extra) {
        Map<String, Object> metadata = new HashMap<>(extra);
        // Absent, not null, for a stay on a typed plate: there is no vehicle of ours behind it, and
        // the plate below is what identifies the car in that case (CONTRACT.md v0.11).
        if (session.getVehicleId() != null) {
            metadata.put("vehicleId", session.getVehicleId().toString());
        }
        metadata.put("vehicleType", session.getVehicleType().name());
        metadata.put("spaceId", session.getSpaceId().toString());
        metadata.put("zoneId", session.getZoneId().toString());
        metadata.put("plate", session.getPlateSnapshot());
        auditRecorder.record(action, "parking-session", session.getId().toString(), metadata);
    }

    /**
     * A tenant-scoped catalogue read: cacheable, but {@code private}. These bodies are resolved for
     * one authenticated caller inside one municipality, so a shared cache holding them would be a way
     * for one tenant's configuration to be served to another (SECURITY.md §7).
     */
    private <T> ResponseEntity<T> privatelyCacheable(T body, Duration ttl) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(ttl).cachePrivate())
                .body(body);
    }

    private ParkingSessionStatus parseStatus(String value) {
        for (ParkingSessionStatus status : ParkingSessionStatus.values()) {
            if (status.name().equals(value)) {
                return status;
            }
        }
        // An unknown filter degrades to "everything" rather than failing: the contract only pins
        // ACTIVE and ALL, and a client sending something else means "do not filter".
        return null;
    }
}
