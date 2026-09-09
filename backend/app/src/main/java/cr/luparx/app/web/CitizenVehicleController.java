package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.web.dto.ParkingDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.id.UserId;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.parking.entity.Vehicle;
import cr.luparx.parking.service.VehicleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The citizen's vehicles (CONTRACT.md v0.2, "API").
 *
 * <p>Every operation acts on {@code TenantContextHolder.requireUserId()} — the identity the verified
 * token resolved to — and the service narrows every read by it. An identifier in the path is
 * therefore never enough to reach somebody else's car (SECURITY.md §4, IDOR/BOLA).</p>
 *
 * <p>There is no tenant here on purpose: a vehicle belongs to a person, not to a municipality, and
 * the same car is driven to two of them on the same day.</p>
 */
@RestController
@RequestMapping("/api/v1/citizen/vehicles")
@Tag(name = "Citizen · Vehicles", description = "Cars a citizen registers to park with.")
public class CitizenVehicleController {

    private final VehicleService vehicleService;
    private final ParkingMapper mapper;
    private final AuditRecorder auditRecorder;

    public CitizenVehicleController(VehicleService vehicleService, ParkingMapper mapper,
                                    AuditRecorder auditRecorder) {
        this.vehicleService = vehicleService;
        this.mapper = mapper;
        this.auditRecorder = auditRecorder;
    }

    @GetMapping
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "List my vehicles")
    public List<ParkingDtos.VehicleResponse> list() {
        UserId userId = TenantContextHolder.requireUserId();
        List<Vehicle> vehicles = vehicleService.listOwn(userId);
        List<ParkingDtos.VehicleResponse> response = new ArrayList<>(vehicles.size());
        for (Vehicle vehicle : vehicles) {
            response.add(mapper.toVehicle(vehicle));
        }
        return response;
    }

    @PostMapping
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Register a vehicle. Only the plate is required.")
    public ParkingDtos.VehicleResponse create(@Valid @RequestBody ParkingDtos.CreateVehicleRequest request) {
        UserId userId = TenantContextHolder.requireUserId();
        Vehicle vehicle = vehicleService.register(userId, request.plate(), request.name(), request.brand(),
                request.model(), request.year(), request.type(), request.color(),
                request.isOwner() == null || request.isOwner().booleanValue(),
                request.isPrimary() != null && request.isPrimary().booleanValue());
        // The plate is the citizen's own datum and identifies the resource; the audit row needs it to
        // be useful at all, and it is not another person's data (SECURITY.md §11).
        auditRecorder.record(AuditAction.VEHICLE_REGISTERED, "vehicle", vehicle.getId().toString(),
                Map.of("plate", vehicle.getPlateNormalized()));
        return mapper.toVehicle(vehicle);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Update one of my vehicles")
    public ParkingDtos.VehicleResponse update(@PathVariable UUID id,
                                              @Valid @RequestBody ParkingDtos.UpdateVehicleRequest request) {
        UserId userId = TenantContextHolder.requireUserId();
        Vehicle vehicle = vehicleService.update(userId, id, request.plate(), request.name(), request.brand(),
                request.model(), request.year(), request.type(), request.color(),
                request.isOwner() == null || request.isOwner().booleanValue());
        auditRecorder.record(AuditAction.VEHICLE_UPDATED, "vehicle", id.toString(),
                Map.of("plate", vehicle.getPlateNormalized()));
        return mapper.toVehicle(vehicle);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Delete one of my vehicles. Refused while it has a running session.")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        UserId userId = TenantContextHolder.requireUserId();
        vehicleService.delete(userId, id);
        auditRecorder.record(AuditAction.VEHICLE_DELETED, "vehicle", id.toString(), Map.of());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/primary")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Make this vehicle the one offered first")
    public ParkingDtos.VehicleResponse makePrimary(@PathVariable UUID id) {
        UserId userId = TenantContextHolder.requireUserId();
        Vehicle vehicle = vehicleService.makePrimary(userId, id);
        auditRecorder.record(AuditAction.VEHICLE_PRIMARY_CHANGED, "vehicle", id.toString(), Map.of());
        return mapper.toVehicle(vehicle);
    }
}
