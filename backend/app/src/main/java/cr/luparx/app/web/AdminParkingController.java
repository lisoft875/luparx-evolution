package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.web.dto.ParkingDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.parking.entity.ParkingPolicy;
import cr.luparx.parking.entity.ParkingRate;
import cr.luparx.parking.entity.ParkingZone;
import cr.luparx.parking.service.ParkingCatalogService;
import cr.luparx.parking.service.ParkingPolicyService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

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
    private final ParkingMapper mapper;
    private final AuditRecorder auditRecorder;

    public AdminParkingController(ParkingPolicyService policyService,
                                  ParkingCatalogService catalogService,
                                  ParkingMapper mapper,
                                  AuditRecorder auditRecorder) {
        this.policyService = policyService;
        this.catalogService = catalogService;
        this.mapper = mapper;
        this.auditRecorder = auditRecorder;
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
}
