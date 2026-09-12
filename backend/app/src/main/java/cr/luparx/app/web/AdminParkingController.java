package cr.luparx.app.web;

import com.fasterxml.jackson.databind.JsonNode;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.web.dto.ParkingDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.audit.AuditChanges;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.core.time.HolidayObservance;
import cr.luparx.geo.entity.HolidayCatalogEntry;
import cr.luparx.geo.service.HolidayCatalogService;
import cr.luparx.parking.entity.ParkingPolicy;
import cr.luparx.parking.entity.ParkingRate;
import cr.luparx.parking.entity.ParkingScheduleException;
import cr.luparx.parking.entity.ParkingSpace;
import cr.luparx.parking.entity.ParkingSpaceFormat;
import cr.luparx.app.service.ZoneGeometryService;
import cr.luparx.parking.entity.ParkingZone;
import cr.luparx.parking.entity.ParkingZonePolicy;
import cr.luparx.parking.entity.ParkingZoneSchedule;
import cr.luparx.parking.entity.ParkingZoneScheduleSlot;
import cr.luparx.parking.model.ExceptionRecurrence;
import cr.luparx.parking.model.ZoneRules;
import cr.luparx.parking.service.ParkingCatalogService;
import cr.luparx.parking.service.ParkingPolicyService;
import cr.luparx.parking.service.ParkingScheduleService;
import cr.luparx.parking.service.ParkingSpaceFormatService;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.service.TenantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
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
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Parking administration of the active municipality (CONTRACT.md v0.2, "API").
 *
 * <p>Everything here is scoped by {@code TenantContextHolder.requireTenantId()} and guarded by
 * {@code PERM_TENANT_MANAGE}: a municipal administrator edits their own municipality and nothing
 * else, whatever identifier they put in the path — the services resolve every row through the tenant
 * before touching it (SECURITY.md §3).</p>
 */
@RestController
@RequestMapping("/api/v1/admin/parking")
@Tag(name = "Admin · Parking", description = "Policy, zones and tariffs of the active municipality.")
public class AdminParkingController {

    private final ParkingPolicyService policyService;
    private final ParkingCatalogService catalogService;
    private final ZoneGeometryService zoneGeometryService;
    private final ParkingSpaceFormatService spaceFormatService;
    private final ParkingScheduleService scheduleService;
    private final HolidayCatalogService holidayCatalogService;
    private final TenantService tenantService;
    private final ParkingMapper mapper;
    private final AuditRecorder auditRecorder;
    private final Clock clock;

    public AdminParkingController(ParkingPolicyService policyService,
                                  ParkingCatalogService catalogService,
                                  ZoneGeometryService zoneGeometryService,
                                  ParkingSpaceFormatService spaceFormatService,
                                  ParkingScheduleService scheduleService,
                                  HolidayCatalogService holidayCatalogService,
                                  TenantService tenantService,
                                  ParkingMapper mapper,
                                  AuditRecorder auditRecorder,
                                  Clock clock) {
        this.policyService = policyService;
        this.catalogService = catalogService;
        this.zoneGeometryService = zoneGeometryService;
        this.spaceFormatService = spaceFormatService;
        this.scheduleService = scheduleService;
        this.holidayCatalogService = holidayCatalogService;
        this.tenantService = tenantService;
        this.mapper = mapper;
        this.auditRecorder = auditRecorder;
        this.clock = clock;
    }

    // --- policy ----------------------------------------------------------------------------------

    @GetMapping("/policy")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "The parking policy of this municipality")
    public ParkingDtos.ParkingPolicyResponse policy() {
        return mapper.toPolicy(policyService.require(TenantContextHolder.requireTenantId()));
    }

    @PutMapping("/policy")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Replace the parking policy of this municipality")
    public ParkingDtos.ParkingPolicyResponse updatePolicy(
            @Valid @RequestBody ParkingDtos.UpdateParkingPolicyRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        // Read before the change, so the entry can say what each number WAS. This is the whole point
        // of v0.32: "the policy was updated" is not auditable, "sessionMaxMinutes 480 → 120, by
        // Carlos, on Tuesday" is.
        ParkingPolicy before = policyService.require(tenantId);
        ParkingPolicySnapshot previous = ParkingPolicySnapshot.of(before);
        ParkingPolicy policy = policyService.replace(
                tenantId,
                request.sessionIncrementsMinutes(),
                request.sessionMinMinutes().intValue(),
                request.sessionMaxMinutes().intValue(),
                request.extensionEnabled().booleanValue(),
                request.extensionIncrementsMinutes(),
                request.extensionMaxTotalMinutes().intValue(),
                request.earlyFinishEnabled().booleanValue(),
                request.creditOnEarlyFinishEnabled().booleanValue(),
                request.creditMinRemainingMinutes().intValue(),
                request.creditExpiryDays().intValue(),
                request.graceMinutes().intValue(),
                // Absent keeps what the municipality has, which for one that has never set it is 0.
                request.freeMinutes() == null ? before.getFreeMinutes() : request.freeMinutes().intValue(),
                // Same rule (v0.37): a client that does not know this field must not decide it.
                request.overlappingStaysEnabled() == null
                        ? before.isOverlappingStaysEnabled()
                        : request.overlappingStaysEnabled().booleanValue());
        auditRecorder.record(AuditAction.PARKING_POLICY_UPDATED, "parking-policy", tenantId.toString(),
                Map.of("sessionIncrements", policy.getSessionIncrementsMinutes()),
                previous.diff(policy));
        return mapper.toPolicy(policy);
    }

    // --- zones -----------------------------------------------------------------------------------

    @GetMapping("/zones")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Zones of this municipality, with how many bays each holds")
    public List<ParkingDtos.ParkingZoneResponse> zones() {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        List<ParkingZone> zones = catalogService.listZones(tenantId);
        List<ParkingDtos.ParkingZoneResponse> response = new ArrayList<>(zones.size());
        for (ParkingZone zone : zones) {
            response.add(mapper.toZone(zone, catalogService.countSpaces(tenantId, zone.getId())));
        }
        return response;
    }

    /**
     * Opens a new sector.
     *
     * <p>There is no delete. A zone that a municipality stops operating is deactivated, and every
     * stay ever paid in it goes on resolving to a zone with a name.</p>
     */
    @PostMapping("/zones")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Open a new zone in this municipality")
    public ResponseEntity<ParkingDtos.ParkingZoneResponse> createZone(
            @Valid @RequestBody ParkingDtos.CreateParkingZoneRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        ParkingZone zone = catalogService.createZone(tenantId, request.code(), request.name(),
                request.description(), request.divisionId());
        auditRecorder.record(AuditAction.PARKING_ZONE_UPDATED, "parking-zone", zone.getId().toString(),
                Map.of("code", zone.getCode(), "created", "true"));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(mapper.toZone(zone, 0L));
    }

    @PutMapping("/zones/{id}")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Rename, re-describe or deactivate a zone. A zone is never deleted.")
    public ParkingDtos.ParkingZoneResponse updateZone(
            @PathVariable UUID id,
            @Valid @RequestBody ParkingDtos.UpdateParkingZoneRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        ParkingZone before = catalogService.requireZone(tenantId, id);
        String previousName = before.getName();
        String previousDescription = before.getDescription();
        boolean previousActive = before.isActive();
        UUID previousDivision = before.getDivisionId();
        ParkingZone zone = catalogService.updateZone(tenantId, id, request.name(), request.description(),
                request.divisionId(), request.active().booleanValue());
        auditRecorder.record(AuditAction.PARKING_ZONE_UPDATED, "parking-zone", id.toString(),
                Map.of("code", zone.getCode()),
                AuditChanges.builder()
                        .compare("name", previousName, zone.getName())
                        .compare("description", previousDescription, zone.getDescription())
                        .compare("divisionId", previousDivision, zone.getDivisionId())
                        .compare("active", Boolean.valueOf(previousActive), Boolean.valueOf(zone.isActive()))
                        .build());
        return mapper.toZone(zone, catalogService.countSpaces(tenantId, zone.getId()));
    }

    // --- zone geometry (CONTRACT.md v0.40, ADR 0024) ---------------------------------------------
    //
    // The body of these three endpoints is a bare RFC 7946 **geometry object**, not a Feature and not
    // a wrapper of our own. That is what `ST_AsGeoJSON` produces, what `ST_GeomFromGeoJSON` accepts
    // and what a GIS client already knows how to read; inventing an envelope around it would mean
    // every consumer writes an adapter for a format that already has a standard.

    @GetMapping("/zones/{id}/geometry")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "The drawn perimeter of a zone as GeoJSON, or 204 when it has none")
    public ResponseEntity<JsonNode> zoneGeometry(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        // Asked first so that an id from another municipality answers 404 and not 204: "this zone
        // has no geometry" would already confirm the zone exists (SECURITY.md, BOLA).
        catalogService.requireZone(tenantId, id);
        return zoneGeometryService.find(tenantId, id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /**
     * Replaces the perimeter of a zone.
     *
     * <p>PUT and not PATCH because a geometry has no parts to merge: what arrives is the perimeter
     * from now on. Sending the same polygon twice leaves the same state, which is what makes this
     * safe to retry.</p>
     */
    @PutMapping("/zones/{id}/geometry")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Replace the perimeter of a zone with a GeoJSON Polygon or MultiPolygon")
    public ResponseEntity<JsonNode> replaceZoneGeometry(@PathVariable UUID id,
                                                        @RequestBody JsonNode geometry) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        ParkingZone zone = catalogService.requireZone(tenantId, id);
        boolean had = zoneGeometryService.find(tenantId, id).isPresent();
        int positions = zoneGeometryService.replace(tenantId, id, zone.getVersion(), geometry);
        // The audit records the FACT, never the polygon. A before-and-after of two thousand
        // coordinates in `audit_events` — a table that cannot be rewritten (v0.32) — would bury the
        // trail it is supposed to make readable. Who, when, and how big is what an auditor asks.
        auditRecorder.record(AuditAction.PARKING_ZONE_GEOMETRY_UPDATED, "parking-zone", id.toString(),
                Map.of("code", zone.getCode(),
                        "positions", String.valueOf(positions),
                        "replaced", String.valueOf(had)));
        return ResponseEntity.ok(geometry);
    }

    @DeleteMapping("/zones/{id}/geometry")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Remove the perimeter of a zone. The zone keeps charging exactly as before.")
    public ResponseEntity<Void> deleteZoneGeometry(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        ParkingZone zone = catalogService.requireZone(tenantId, id);
        // Nothing to erase is a successful DELETE: the end state the caller asked for already holds,
        // and writing a new `updated_at` and version for a no-op would be a lie in the audit.
        if (zoneGeometryService.find(tenantId, id).isEmpty()) {
            return ResponseEntity.noContent().build();
        }
        zoneGeometryService.clear(tenantId, id, zone.getVersion());
        auditRecorder.record(AuditAction.PARKING_ZONE_GEOMETRY_CLEARED, "parking-zone", id.toString(),
                Map.of("code", zone.getCode()));
        return ResponseEntity.noContent().build();
    }

    // --- rates -----------------------------------------------------------------------------------

    @GetMapping("/rates")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Tariff windows, optionally of one zone. A closed window is history.")
    public List<ParkingDtos.ParkingRateResponse> rates(@RequestParam(required = false) UUID zoneId) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        List<ParkingRate> rates = catalogService.listRates(tenantId, zoneId);
        List<ParkingDtos.ParkingRateResponse> response = new ArrayList<>(rates.size());
        for (ParkingRate rate : rates) {
            response.add(mapper.toRate(rate));
        }
        return response;
    }

    @PutMapping("/rates")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Set the tariff in force for a zone. Closes the current window and opens a new one.")
    public ParkingDtos.ParkingRateResponse setRate(
            @Valid @RequestBody ParkingDtos.UpdateParkingRateRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        ParkingRate rate = catalogService.setRate(tenantId, request.zoneId(),
                request.amountMinor().longValue(), request.minutes().intValue());
        auditRecorder.record(AuditAction.PARKING_RATE_UPDATED, "parking-rate", rate.getId().toString(),
                Map.of("zoneId", request.zoneId().toString(),
                        "amountMinor", String.valueOf(rate.getAmountMinor()),
                        "minutes", String.valueOf(rate.getMinutes())));
        return mapper.toRate(rate);
    }

    /**
     * Prices one exact duration of a zone — a rung of its ladder (CONTRACT.md v0.24).
     *
     * <p>{@code PUT} and not {@code POST}: setting the price of 45 minutes twice is one statement
     * made twice, not two rungs. The window closes and a new one opens, so the history is kept
     * without the caller having to know whether that duration was already priced.</p>
     */
    @PutMapping("/rates/rungs")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Set the price of one exact duration in a zone")
    public ParkingDtos.ParkingRateResponse setRateRung(
            @Valid @RequestBody ParkingDtos.SetRateRungRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        ParkingRate rate = catalogService.setRung(tenantId, request.zoneId(),
                request.amountMinor().longValue(), request.minutes().intValue());
        auditRecorder.record(AuditAction.PARKING_RATE_UPDATED, "parking-rate", rate.getId().toString(),
                Map.of("zoneId", request.zoneId().toString(),
                        "kind", "EXACT",
                        "amountMinor", String.valueOf(rate.getAmountMinor()),
                        "minutes", String.valueOf(rate.getMinutes())));
        return mapper.toRate(rate);
    }

    /**
     * Removes a rung: that duration goes back to being priced by the zone's base.
     *
     * <p>The window closes, the row stays. What a municipality charged last month has to remain
     * readable, and a rung taken off the ladder is exactly as historical as one superseded by a new
     * price.</p>
     */
    @DeleteMapping("/rates/rungs")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Remove the price of one exact duration; the base prices it again")
    public ResponseEntity<Void> clearRateRung(@RequestParam UUID zoneId, @RequestParam int minutes) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        catalogService.clearRung(tenantId, zoneId, minutes);
        auditRecorder.record(AuditAction.PARKING_RATE_UPDATED, "parking-rate", zoneId.toString(),
                Map.of("zoneId", zoneId.toString(), "kind", "EXACT", "minutes", String.valueOf(minutes),
                        "cleared", "true"));
        return ResponseEntity.noContent().build();
    }

    // --- bays and their code format (CONTRACT.md v0.3) ---------------------------------------------

    @GetMapping("/space-format")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "The shape of a bay code in this municipality, with its pattern and example")
    public ParkingDtos.ParkingSpaceFormatResponse spaceFormat() {
        return mapper.toSpaceFormat(spaceFormatService.require(TenantContextHolder.requireTenantId()));
    }

    /**
     * Changes the shape of a bay code.
     *
     * <p>Existing bays are <b>not</b> renumbered or re-validated: their codes are painted on the
     * street and a change here describes what is painted next, not a retroactive claim about what was
     * painted before. A municipality that renumbers its bays creates the new ones and takes the old
     * ones out of service, which is the same thing that happens on the street.</p>
     */
    @PutMapping("/space-format")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Replace the bay code format of this municipality")
    public ParkingDtos.ParkingSpaceFormatResponse updateSpaceFormat(
            @Valid @RequestBody ParkingDtos.UpdateParkingSpaceFormatRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        ParkingSpaceFormat format = spaceFormatService.replace(tenantId, request.prefix(),
                request.digits().intValue(), request.allowLetters().booleanValue(), request.pattern(),
                request.example());
        auditRecorder.record(AuditAction.PARKING_SPACE_FORMAT_UPDATED, "parking-space-format",
                tenantId.toString(), Map.of("pattern", format.getPattern(), "example", format.getExample()));
        return mapper.toSpaceFormat(format);
    }

    @PostMapping("/spaces")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Add a bay to a zone; its code is validated against this municipality's format")
    public ParkingDtos.ParkingSpaceResponse createSpace(
            @Valid @RequestBody ParkingDtos.CreateParkingSpaceRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        ParkingSpace space = catalogService.createSpace(tenantId, request.zoneId(), request.code());
        auditRecorder.record(AuditAction.PARKING_SPACE_CREATED, "parking-space", space.getId().toString(),
                Map.of("code", space.getCode(), "zoneId", space.getZoneId().toString()));
        return mapper.toSpace(space);
    }

    /**
     * The bays, by page — of one zone or of the whole municipality.
     *
     * <p>Paginated where the zone list is not: a municipality has a handful of zones and San José
     * alone has five thousand bays.</p>
     */
    @GetMapping("/spaces")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Bays of this municipality, optionally of one zone (paginated)")
    public PageResponse<ParkingDtos.ParkingSpaceResponse> spaces(
            @RequestParam(required = false) UUID zoneId,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        PageRequest request = PageRequest.parse(page, size, null);
        PageResponse<ParkingSpace> spaces = catalogService.listSpaces(tenantId, zoneId, request);
        return PageResponse.of(spaces.items().stream().map(mapper::toSpace).toList(),
                request.page(), request.size(), spaces.totalElements());
    }

    @PutMapping("/spaces/{id}")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Take a bay out of service, put it back, move it to another zone, or correct its code")
    public ParkingDtos.ParkingSpaceResponse updateSpace(
            @PathVariable UUID id,
            @Valid @RequestBody ParkingDtos.UpdateParkingSpaceRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        // Read before the change so the audit entry can name the code the bay used to carry: that
        // string is what every printed receipt and every officer's memory still says.
        ParkingSpace beforeSpace = catalogService.requireSpace(tenantId, id);
        String previousCode = beforeSpace.getCode();
        String previousStatus = beforeSpace.getStatus().name();
        UUID previousZone = beforeSpace.getZoneId();
        ParkingSpace space = catalogService.updateSpace(tenantId, id, request.status(), request.zoneId(),
                request.code());
        auditRecorder.record(AuditAction.PARKING_SPACE_UPDATED, "parking-space", id.toString(),
                Map.of("code", space.getCode()),
                AuditChanges.builder()
                        .compare("code", previousCode, space.getCode())
                        .compare("status", previousStatus, space.getStatus().name())
                        .compare("zoneId", previousZone, space.getZoneId())
                        .build());
        if (!previousCode.equals(space.getCode())) {
            auditRecorder.record(AuditAction.PARKING_SPACE_RENAMED, "parking-space", id.toString(),
                    Map.of("previousCode", previousCode, "code", space.getCode()));
        }
        return mapper.toSpace(space);
    }

    // --- charging schedule (CONTRACT.md v0.3) ------------------------------------------------------

    @GetMapping("/schedule")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "When this municipality charges: weekly bands, dated exceptions and its time zone")
    public ParkingDtos.ParkingScheduleResponse schedule() {
        return readSchedule(TenantContextHolder.requireTenantId());
    }

    /**
     * Replaces the whole timetable, as one form.
     *
     * <p>Wholesale for the same reason the policy is: an administrator edits a timetable as one
     * screen, and a partial update leaves "what does an absent band mean?" unanswerable. Exceptions
     * are a forward-looking calendar — a stay that was already priced is never re-priced — so this
     * rewrites the plan, never the record.</p>
     */
    @PutMapping("/schedule")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Replace the charging timetable of this municipality")
    public ParkingDtos.ParkingScheduleResponse updateSchedule(
            @Valid @RequestBody ParkingDtos.UpdateParkingScheduleRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        List<ParkingScheduleService.BandEntry> bands = new ArrayList<>();
        if (request.week() != null) {
            for (ParkingDtos.ChargingDayDto day : request.week()) {
                if (day == null || day.bands() == null) {
                    continue;
                }
                for (ParkingDtos.ChargingBandDto band : day.bands()) {
                    bands.add(new ParkingScheduleService.BandEntry(day.weekday(), band.startMinute(),
                            band.endMinute()));
                }
            }
        }
        List<ParkingScheduleService.ExceptionEntry> exceptions = new ArrayList<>();
        if (request.exceptions() != null) {
            for (ParkingDtos.ChargingExceptionDto exception : request.exceptions()) {
                if (exception == null) {
                    continue;
                }
                List<ParkingScheduleService.BandEntry> exceptionBands = new ArrayList<>();
                if (exception.bands() != null) {
                    for (ParkingDtos.ChargingBandDto band : exception.bands()) {
                        exceptionBands.add(new ParkingScheduleService.BandEntry(null, band.startMinute(),
                                band.endMinute()));
                    }
                }
                exceptions.add(new ParkingScheduleService.ExceptionEntry(
                        recurrenceOf(exception),
                        exception.charges() != null && exception.charges().booleanValue(),
                        exception.chargesAllDay() != null && exception.chargesAllDay().booleanValue(),
                        exception.label(),
                        exception.holidayCode(),
                        exceptionBands));
            }
        }
        // A timetable is replaced whole, so the useful "before" is its shape rather than a list of
        // every band: an auditor asks whether the municipality started charging on Sundays or moved
        // closing time, and "Mon 07:00-18:00; Sun —" answers that where forty rows do not.
        boolean previousAllDay = scheduleService.require(tenantId).isChargesAllDay();
        String previousWeek = ScheduleShape.of(scheduleService.slots(tenantId));
        int previousExceptions = scheduleService.exceptions(tenantId).size();
        scheduleService.replace(tenantId, request.chargesAllDay().booleanValue(), bands, exceptions);
        auditRecorder.record(AuditAction.PARKING_SCHEDULE_UPDATED, "parking-schedule", tenantId.toString(),
                Map.of("bands", String.valueOf(bands.size())),
                AuditChanges.builder()
                        .compare("chargesAllDay", Boolean.valueOf(previousAllDay), request.chargesAllDay())
                        .compare("week", previousWeek, ScheduleShape.of(scheduleService.slots(tenantId)))
                        .compare("exceptions", Integer.valueOf(previousExceptions),
                                Integer.valueOf(exceptions.size()))
                        .build());
        return readSchedule(tenantId);
    }

    /**
     * The rule a submitted exception states.
     *
     * <p>An absent {@code recurrence} is read as {@code ONCE}, which is what every exception written
     * before v0.31 was and what a client older than this version still sends. Reading it as anything
     * else would turn one client's single holiday into an annual one nobody asked for.</p>
     */
    private static ExceptionRecurrence recurrenceOf(ParkingDtos.ChargingExceptionDto dto) {
        HolidayObservance observance = "MONDAY".equalsIgnoreCase(dto.observance())
                ? HolidayObservance.MONDAY
                : HolidayObservance.EXACT;
        String kind = dto.recurrence() == null ? "ONCE" : dto.recurrence().trim().toUpperCase(Locale.ROOT);
        return switch (kind) {
            case "ANNUAL" -> ExceptionRecurrence.annual(
                    dto.month() == null ? 0 : dto.month().intValue(),
                    dto.day() == null ? 0 : dto.day().intValue(),
                    observance);
            case "EASTER" -> ExceptionRecurrence.easter(
                    dto.easterOffsetDays() == null ? 0 : dto.easterOffsetDays().intValue(), observance);
            default -> ExceptionRecurrence.once(dto.date());
        };
    }

    // --- a country's holidays, and a zone's own rules (CONTRACT.md v0.31) ---------------------------

    /**
     * The holidays of this municipality's country, so it does not have to type them.
     *
     * <p>Reference data and never a live authority: the municipality <b>copies</b> what it wants into
     * its own exceptions, and from then on the rows are its to edit or delete. Holiday law changes,
     * and the calendar a canton charges on is the canton's answer to give — which is also why the
     * screen says this is a starting point and not legal advice.</p>
     */
    @GetMapping("/holidays")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "The public holidays of this municipality's country, as a starting point")
    public List<ParkingDtos.HolidayCatalogEntryDto> holidays() {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        Tenant tenant = tenantService.require(tenantId);
        int year = LocalDate.ofInstant(clock.instant(), scheduleService.zoneOf(tenantId)).getYear();
        Set<String> already = new HashSet<>();
        for (ParkingScheduleException exception : scheduleService.exceptions(tenantId)) {
            if (exception.getHolidayCode() != null) {
                already.add(exception.getHolidayCode());
            }
        }
        List<ParkingDtos.HolidayCatalogEntryDto> result = new ArrayList<>();
        for (HolidayCatalogEntry entry : holidayCatalogService.forCountry(tenant.getCountryCode())) {
            result.add(new ParkingDtos.HolidayCatalogEntryDto(
                    entry.getCode(),
                    entry.getName(),
                    entry.getKind().name(),
                    entry.getMonth() == null ? null : Integer.valueOf(entry.getMonth().intValue()),
                    entry.getDay() == null ? null : Integer.valueOf(entry.getDay().intValue()),
                    entry.getEasterOffsetDays() == null
                            ? null
                            : Integer.valueOf(entry.getEasterOffsetDays().intValue()),
                    entry.getObservance().name(),
                    entry.observedIn(year).orElse(null),
                    entry.observedIn(year + 1).orElse(null),
                    already.contains(entry.getCode())));
        }
        return result;
    }

    @GetMapping("/zones/{id}/rules")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "What this zone departs from the municipality in, and what it applies")
    public ParkingDtos.ZoneRulesResponse zoneRules(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        catalogService.requireZone(tenantId, id);
        return readZoneRules(tenantId, id);
    }

    /**
     * Replaces everything a zone departs in, as one form.
     *
     * <p>Absent means "follow the municipality", never "leave unchanged": those are opposite
     * instructions, and a partial update could not tell them apart. A form where everything is absent
     * puts the zone back to following in everything.</p>
     */
    @PutMapping("/zones/{id}/rules")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Give a zone rules of its own, or put it back to following the municipality")
    public ParkingDtos.ZoneRulesResponse updateZoneRules(@PathVariable UUID id,
                                                         @Valid @RequestBody
                                                         ParkingDtos.UpdateZoneRulesRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        ParkingZone zone = catalogService.requireZone(tenantId, id);
        // The RESOLVED numbers before and after, not the override row: an auditor asks what applied
        // in this zone, and "sessionMaxMinutes: (inherited) → 120" and "480 → 120" are the same
        // change to them. Reporting the override row would make an inheritance change invisible.
        ZoneRules previous = policyService.rulesFor(tenantId, id);
        boolean previousOwnSchedule = scheduleService.zoneSchedule(tenantId, id).isPresent();
        String previousWeek = previousOwnSchedule
                ? ZoneScheduleShape.of(scheduleService.zoneSlots(id))
                : null;
        policyService.replaceZone(tenantId, id,
                request.sessionIncrementsMinutes(),
                request.sessionMinMinutes(),
                request.sessionMaxMinutes(),
                request.extensionIncrementsMinutes(),
                request.extensionMaxTotalMinutes(),
                request.freeMinutes());

        boolean ownSchedule = request.ownSchedule() != null && request.ownSchedule().booleanValue();
        List<ParkingScheduleService.BandEntry> bands = new ArrayList<>();
        if (ownSchedule && request.week() != null) {
            for (ParkingDtos.ChargingDayDto day : request.week()) {
                if (day == null || day.bands() == null) {
                    continue;
                }
                for (ParkingDtos.ChargingBandDto band : day.bands()) {
                    bands.add(new ParkingScheduleService.BandEntry(day.weekday(), band.startMinute(),
                            band.endMinute()));
                }
            }
        }
        scheduleService.replaceZone(tenantId, id, ownSchedule,
                request.chargesAllDay() != null && request.chargesAllDay().booleanValue(), bands);

        ZoneRules now = policyService.rulesFor(tenantId, id);
        auditRecorder.record(AuditAction.PARKING_ZONE_RULES_UPDATED, "parking-zone", id.toString(),
                Map.of("zone", zone.getCode()),
                AuditChanges.builder()
                        .compare("sessionIncrementsMinutes", previous.sessionIncrements().values(),
                                now.sessionIncrements().values())
                        .compare("sessionMinMinutes", Integer.valueOf(previous.sessionMinMinutes()),
                                Integer.valueOf(now.sessionMinMinutes()))
                        .compare("sessionMaxMinutes", Integer.valueOf(previous.sessionMaxMinutes()),
                                Integer.valueOf(now.sessionMaxMinutes()))
                        .compare("extensionMaxTotalMinutes",
                                Integer.valueOf(previous.extensionMaxTotalMinutes()),
                                Integer.valueOf(now.extensionMaxTotalMinutes()))
                        .compare("freeMinutes", Integer.valueOf(previous.freeMinutes()),
                                Integer.valueOf(now.freeMinutes()))
                        .compare("ownSchedule", Boolean.valueOf(previousOwnSchedule),
                                Boolean.valueOf(ownSchedule))
                        .compare("week", previousWeek,
                                ownSchedule ? ZoneScheduleShape.of(scheduleService.zoneSlots(id)) : null)
                        .build());
        return readZoneRules(tenantId, id);
    }

    /** One read shared by the GET and by the answer to the PUT, so both always agree. */
    private ParkingDtos.ZoneRulesResponse readZoneRules(TenantId tenantId, UUID zoneId) {
        ZoneRules rules = policyService.rulesFor(tenantId, zoneId);
        ParkingZonePolicy override = policyService.zoneOverride(tenantId, zoneId).orElse(null);
        ParkingZoneSchedule zoneHeader = scheduleService.zoneSchedule(tenantId, zoneId).orElse(null);

        Map<DayOfWeek, List<ParkingDtos.ChargingBandDto>> byDay = new EnumMap<>(DayOfWeek.class);
        if (zoneHeader != null) {
            for (ParkingZoneScheduleSlot slot : scheduleService.zoneSlots(zoneId)) {
                byDay.computeIfAbsent(slot.weekday(), key -> new ArrayList<>())
                        .add(mapper.toBand(slot.band()));
            }
        }
        List<ParkingDtos.ChargingDayDto> week = new ArrayList<>(DayOfWeek.values().length);
        for (DayOfWeek weekday : DayOfWeek.values()) {
            week.add(new ParkingDtos.ChargingDayDto(weekday, byDay.getOrDefault(weekday, List.of())));
        }

        return new ParkingDtos.ZoneRulesResponse(
                zoneId,
                override != null,
                override == null || override.sessionIncrements() == null
                        ? null : override.sessionIncrements().values(),
                override == null ? null : override.getSessionMinMinutes(),
                override == null ? null : override.getSessionMaxMinutes(),
                override == null || override.extensionIncrements() == null
                        ? null : override.extensionIncrements().values(),
                override == null ? null : override.getExtensionMaxTotalMinutes(),
                override == null ? null : override.getFreeMinutes(),
                rules.sessionIncrements().values(),
                rules.sessionMinMinutes(),
                rules.sessionMaxMinutes(),
                rules.extensionIncrements().values(),
                rules.extensionMaxTotalMinutes(),
                rules.freeMinutes(),
                zoneHeader != null,
                zoneHeader != null && zoneHeader.isChargesAllDay(),
                week);
    }

    /** One read shared by the GET and by the answer to the PUT, so both always agree. */
    private ParkingDtos.ParkingScheduleResponse readSchedule(TenantId tenantId) {
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
}
