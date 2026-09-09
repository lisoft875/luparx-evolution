package cr.luparx.app.enforcement;

import cr.luparx.core.id.TenantId;
import cr.luparx.enforcement.port.ParkingStatusPort;
import cr.luparx.parking.entity.ParkingSession;
import cr.luparx.parking.entity.ParkingSpace;
import cr.luparx.parking.entity.ParkingZone;
import cr.luparx.parking.entity.Vehicle;
import cr.luparx.parking.repository.ParkingSpaceRepository;
import cr.luparx.parking.repository.ParkingZoneRepository;
import cr.luparx.parking.repository.VehicleRepository;
import cr.luparx.parking.service.ParkingSessionService;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The one place where enforcement and parking touch.
 *
 * <p>{@code module-enforcement} depends on the {@link ParkingStatusPort} interface; this class is the
 * implementation that happens to call the parking services in the same process. Keeping the seam here
 * is what allows the two contexts to be deployed apart later — this class becomes an HTTP client and
 * nothing inside either module changes — and, in the meantime, what stops enforcement from quietly
 * reaching into parking's entities from a dozen call sites.</p>
 *
 * <p>The translation is deliberately lossy in one direction: parking rows carry the citizen who paid,
 * and none of that crosses into enforcement. A citation is written against a plate on a bay; who owns
 * the account that paid for a neighbouring bay is not the officer's business.</p>
 */
@Component
public class ParkingStatusAdapter implements ParkingStatusPort {

    private final ParkingSessionService sessionService;
    private final ParkingSpaceRepository spaceRepository;
    private final ParkingZoneRepository zoneRepository;
    private final VehicleRepository vehicleRepository;

    public ParkingStatusAdapter(ParkingSessionService sessionService,
                                ParkingSpaceRepository spaceRepository,
                                ParkingZoneRepository zoneRepository,
                                VehicleRepository vehicleRepository) {
        this.sessionService = sessionService;
        this.spaceRepository = spaceRepository;
        this.zoneRepository = zoneRepository;
        this.vehicleRepository = vehicleRepository;
    }

    /**
     * Every running session for this plate in this municipality.
     *
     * <p>The parking domain decides what "running" means — it expires the stale ones on the way out —
     * and the zone of each match is resolved in one query for the whole answer rather than one per
     * row. There are rarely more than two matches, but an N+1 that is harmless at two is still an
     * N+1 the day a fleet registers forty vehicles under one plate by mistake.</p>
     */
    @Override
    @Transactional
    public List<ActiveStay> activeStays(TenantId tenantId, String plateNormalized) {
        List<ParkingSession> sessions = sessionService.findActiveByPlate(tenantId, plateNormalized);
        if (sessions.isEmpty()) {
            return List.of();
        }
        Map<UUID, ParkingZone> zones = new HashMap<>();
        for (ParkingZone zone : zoneRepository.findByTenantIdOrderByCodeAsc(tenantId.value())) {
            zones.put(zone.getId(), zone);
        }
        Map<UUID, ParkingSpace> spaces = new HashMap<>();
        for (ParkingSession session : sessions) {
            spaceRepository.findByTenantIdAndId(tenantId.value(), session.getSpaceId())
                    .ifPresent(space -> spaces.put(space.getId(), space));
        }
        List<ActiveStay> stays = new ArrayList<>(sessions.size());
        for (ParkingSession session : sessions) {
            ParkingZone zone = zones.get(session.getZoneId());
            ParkingSpace space = spaces.get(session.getSpaceId());
            stays.add(new ActiveStay(session.getId(), session.getZoneId(),
                    zone == null ? null : zone.getCode(), zone == null ? null : zone.getName(),
                    session.getSpaceId(), space == null ? null : space.getCode(),
                    session.getStartedAt(), session.getExpiresAt()));
        }
        return stays;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Bay> findBay(TenantId tenantId, UUID zoneId, String spaceCode) {
        return spaceRepository.findByTenantIdAndCode(tenantId.value(), spaceCode)
                // The bay code is unique per municipality, so the zone is a check and not part of the
                // lookup: an officer who names a code that belongs to another zone has made a mistake
                // that must surface as "no such bay here", not as a citation on the wrong sector.
                .filter(space -> zoneId == null || zoneId.equals(space.getZoneId()))
                .map(this::toBay);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Bay> findBayById(TenantId tenantId, UUID spaceId) {
        return spaceRepository.findByTenantIdAndId(tenantId.value(), spaceId).map(this::toBay);
    }

    /**
     * The single registered vehicle with this plate, when there is exactly one.
     *
     * <p>Empty when nobody registered it — the ordinary case for a car that never used the app — and
     * also when several people did, because plates are unique per citizen and not globally. Refusing
     * to choose is the point: a citation linked to the wrong person is worse than one linked to
     * nobody, and the plate on the act identifies the vehicle either way.</p>
     */
    @Override
    @Transactional(readOnly = true)
    public Optional<RegisteredVehicle> findUniqueVehicleByPlate(String plateNormalized) {
        List<Vehicle> vehicles = vehicleRepository.findByPlateNormalizedOrderByCreatedAtAsc(plateNormalized);
        if (vehicles.size() != 1) {
            return Optional.empty();
        }
        Vehicle vehicle = vehicles.get(0);
        return Optional.of(new RegisteredVehicle(vehicle.getId(), vehicle.getUserId(),
                vehicle.getPlateNormalized()));
    }

    private Bay toBay(ParkingSpace space) {
        ParkingZone zone = zoneRepository.findByTenantIdAndId(space.getTenantId(), space.getZoneId()).orElse(null);
        return new Bay(space.getId(), space.getCode(), space.getZoneId(),
                zone == null ? null : zone.getCode(), zone == null ? null : zone.getName());
    }
}
