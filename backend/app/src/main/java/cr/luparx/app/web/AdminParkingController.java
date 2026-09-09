package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.web.dto.ParkingDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.parking.entity.ParkingPolicy;
import cr.luparx.parking.entity.ParkingRate;
import cr.luparx.parking.entity.ParkingScheduleException;
import cr.luparx.parking.entity.ParkingSpace;
import cr.luparx.parking.entity.ParkingSpaceFormat;
import cr.luparx.parking.entity.ParkingZone;
import cr.luparx.parking.service.ParkingCatalogService;
import cr.luparx.parking.service.ParkingPolicyService;
import cr.luparx.parking.service.ParkingScheduleService;
import cr.luparx.parking.service.ParkingSpaceFormatService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
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
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
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
    private final ParkingSpaceFormatService spaceFormatService;
    private final ParkingScheduleService scheduleService;
    private final ParkingMapper mapper;
    private final AuditRecorder auditRecorder;
    private final Clock clock;

    public AdminParkingController(ParkingPolicyService policyService,
                                  ParkingCatalogService catalogService,
                                  ParkingSpaceFormatService spaceFormatService,
                                  ParkingScheduleService scheduleService,
                                  ParkingMapper mapper,
                                  AuditRecorder auditRecorder,
                                  Clock clock) {
        this.policyService = policyService;
        this.catalogService = catalogService;
        this.spaceFormatService = spaceFormatService;
        this.scheduleService = scheduleService;
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
                request.graceMinutes().intValue());
        auditRecorder.record(AuditAction.PARKING_POLICY_UPDATED, "parking-policy", tenantId.toString(),
                Map.of("sessionIncrements", policy.getSessionIncrementsMinutes(),
                        "extensionEnabled", String.valueOf(policy.isExtensionEnabled()),
                        "earlyFinishEnabled", String.valueOf(policy.isEarlyFinishEnabled())));
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
        ParkingZone zone = catalogService.updateZone(tenantId, id, request.name(), request.description(),
                request.divisionId(), request.active().booleanValue());
        auditRecorder.record(AuditAction.PARKING_ZONE_UPDATED, "parking-zone", id.toString(),
                Map.of("code", zone.getCode(), "active", String.valueOf(zone.isActive())));
        return mapper.toZone(zone, catalogService.countSpaces(tenantId, zone.getId()));
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
    @Operation(summary = "Take a bay out of service, put it back, or move it to another zone")
    public ParkingDtos.ParkingSpaceResponse updateSpace(
            @PathVariable UUID id,
            @Valid @RequestBody ParkingDtos.UpdateParkingSpaceRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        ParkingSpace space = catalogService.updateSpace(tenantId, id, request.status(), request.zoneId());
        auditRecorder.record(AuditAction.PARKING_SPACE_UPDATED, "parking-space", id.toString(),
                Map.of("code", space.getCode(), "status", space.getStatus().name(),
                        "zoneId", space.getZoneId().toString()));
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
                        exception.date(),
                        exception.charges() != null && exception.charges().booleanValue(),
                        exception.chargesAllDay() != null && exception.chargesAllDay().booleanValue(),
                        exception.label(),
                        exceptionBands));
            }
        }
        scheduleService.replace(tenantId, request.chargesAllDay().booleanValue(), bands, exceptions);
        auditRecorder.record(AuditAction.PARKING_SCHEDULE_UPDATED, "parking-schedule", tenantId.toString(),
                Map.of("chargesAllDay", String.valueOf(request.chargesAllDay()),
                        "bands", String.valueOf(bands.size()),
                        "exceptions", String.valueOf(exceptions.size())));
        return readSchedule(tenantId);
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
