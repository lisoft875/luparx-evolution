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
import cr.luparx.parking.entity.ParkingSession;
import cr.luparx.parking.entity.ParkingSessionExtension;
import cr.luparx.parking.model.ParkingQuote;
import cr.luparx.parking.model.ParkingSessionStatus;
import cr.luparx.parking.service.ParkingPolicyService;
import cr.luparx.parking.service.ParkingQuoteService;
import cr.luparx.parking.service.ParkingSessionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

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

    private final ParkingPolicyService policyService;
    private final ParkingQuoteService quoteService;
    private final ParkingSessionService sessionService;
    private final ParkingMapper mapper;
    private final AuditRecorder auditRecorder;
    private final OutboxRecorder outboxRecorder;

    public CitizenParkingController(ParkingPolicyService policyService,
                                    ParkingQuoteService quoteService,
                                    ParkingSessionService sessionService,
                                    ParkingMapper mapper,
                                    AuditRecorder auditRecorder,
                                    OutboxRecorder outboxRecorder) {
        this.policyService = policyService;
        this.quoteService = quoteService;
        this.sessionService = sessionService;
        this.mapper = mapper;
        this.auditRecorder = auditRecorder;
        this.outboxRecorder = outboxRecorder;
    }

    @GetMapping("/policy")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "The parking rules of the active municipality")
    public ParkingDtos.ParkingPolicyResponse policy() {
        ParkingPolicy policy = policyService.require(TenantContextHolder.requireTenantId());
        return mapper.toPolicy(policy);
    }

    @PostMapping("/quote")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "What a stay would cost, credit included. Nothing is charged or reserved.")
    public ParkingDtos.QuoteResponse quote(@Valid @RequestBody ParkingDtos.QuoteRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        UserId userId = TenantContextHolder.requireUserId();
        ParkingPolicy policy = policyService.require(tenantId);
        // The same check the start would make: a quote for an option the municipality does not offer
        // would show the citizen a price they can never pay.
        policyService.requireSessionIncrement(policy, request.minutes().intValue());
        ParkingQuote quote = quoteService.quote(tenantId, userId, request.zoneId(), request.minutes().intValue());
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
        ParkingSession session = sessionService.start(tenantId, userId, request.zoneId(), request.spaceCode(),
                request.vehicleId(), request.minutes().intValue(), idempotencyKey);
        audit(AuditAction.PARKING_SESSION_STARTED, session,
                Map.of("minutes", String.valueOf(request.minutes()),
                        "amountMinor", String.valueOf(session.getAmountMinor()),
                        "creditMinutes", String.valueOf(session.getCreditMinutesApplied())));
        outboxRecorder.record("parking-session", session.getId().toString(), tenantId,
                OutboxEventType.PARKING_SESSION_STARTED,
                Map.of("sessionId", session.getId().toString(), "spaceId", session.getSpaceId().toString()));
        return mapper.toSession(session);
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
        metadata.put("vehicleId", session.getVehicleId().toString());
        metadata.put("spaceId", session.getSpaceId().toString());
        metadata.put("zoneId", session.getZoneId().toString());
        metadata.put("plate", session.getPlateSnapshot());
        auditRecorder.record(action, "parking-session", session.getId().toString(), metadata);
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
