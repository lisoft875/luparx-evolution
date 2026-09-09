package cr.luparx.parking.service;

import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.parking.entity.Vehicle;
import cr.luparx.parking.model.ParkingSessionStatus;
import cr.luparx.parking.model.VehicleColor;
import cr.luparx.parking.model.VehicleType;
import cr.luparx.parking.model.PlateNormalizer;
import cr.luparx.parking.repository.ParkingSessionRepository;
import cr.luparx.parking.repository.VehicleRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The cars a citizen registered.
 *
 * <p>Every method takes the caller's {@link UserId} and every read is narrowed by it, so a vehicle
 * cannot be reached by guessing its identifier (SECURITY.md §4, IDOR/BOLA). A vehicle has no tenant:
 * a person is global on this platform and drives the same car to two municipalities.</p>
 *
 * <p>The plate is normalised on write and stored twice — as typed and normalised — so a lookup finds
 * {@code "SJ 1234"} when the citizen registered {@code "sj-1234"} while the app still shows them
 * what they wrote. Uniqueness is {@code (user, normalised plate)}: two people registering the same
 * plate is legitimate and must keep working.</p>
 */
@Service
public class VehicleService {

    private final VehicleRepository vehicleRepository;
    private final ParkingSessionRepository sessionRepository;
    private final Clock clock;

    public VehicleService(VehicleRepository vehicleRepository,
                          ParkingSessionRepository sessionRepository,
                          Clock clock) {
        this.vehicleRepository = vehicleRepository;
        this.sessionRepository = sessionRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<Vehicle> listOwn(UserId userId) {
        return vehicleRepository.findByUserIdOrderByCreatedAtAsc(userId.value());
    }

    /** @throws NotFoundException when the vehicle does not exist or belongs to somebody else */
    @Transactional(readOnly = true)
    public Vehicle requireOwn(UserId userId, UUID vehicleId) {
        return vehicleRepository.findByIdAndUserId(vehicleId, userId.value())
                .orElseThrow(() -> NotFoundException.of(ErrorCode.VEHICLE_NOT_FOUND,
                        "error.parking.vehicle.notFound"));
    }

    @Transactional
    public Vehicle register(UserId userId, String plate, String name, String brand, String model, Integer year,
                            String type, String color, boolean owner, boolean primary) {
        String normalized = requireValidPlate(plate);
        if (vehicleRepository.existsByUserIdAndPlateNormalized(userId.value(), normalized)) {
            // Per user, not globally: another citizen may well have this same plate registered.
            throw ConflictException.of(ErrorCode.VEHICLE_PLATE_ALREADY_REGISTERED,
                    "error.parking.vehicle.plate.taken");
        }
        Instant now = clock.instant();
        // The first car a citizen registers is their primary one; asking them would be noise.
        boolean makePrimary = primary || vehicleRepository.countByUserId(userId.value()) == 0L;
        if (makePrimary) {
            clearPrimary(userId, null, now);
        }
        Vehicle vehicle = new Vehicle(Uuid7.generate(), userId.value(), plate.trim(), normalized,
                blankToNull(name), blankToNull(brand), blankToNull(model), year,
                requireValidType(type), requireValidColor(color), owner, makePrimary, now);
        return vehicleRepository.save(vehicle);
    }

    @Transactional
    public Vehicle update(UserId userId, UUID vehicleId, String plate, String name, String brand, String model,
                          Integer year, String type, String color, boolean owner) {
        Vehicle vehicle = requireOwn(userId, vehicleId);
        String normalized = requireValidPlate(plate);
        if (!normalized.equals(vehicle.getPlateNormalized())
                && vehicleRepository.existsByUserIdAndPlateNormalized(userId.value(), normalized)) {
            throw ConflictException.of(ErrorCode.VEHICLE_PLATE_ALREADY_REGISTERED,
                    "error.parking.vehicle.plate.taken");
        }
        // A running session keeps its own plate_snapshot, so correcting a typo here never rewrites
        // what an inspector verified.
        vehicle.changePlate(plate.trim(), normalized);
        vehicle.describe(blankToNull(name), blankToNull(brand), blankToNull(model), year,
                requireValidType(type), requireValidColor(color), owner);
        vehicle.touch(clock.instant());
        return vehicleRepository.save(vehicle);
    }

    /**
     * Removes a vehicle.
     *
     * @throws ConflictException {@code VEHICLE_HAS_ACTIVE_SESSION} while a session is running for
     *         it. The row is referenced by every session it ever had, so deleting it under a running
     *         one would break the inspector's view of a stay that is still being paid for.
     */
    /**
     * The kind of vehicle, refused when it is not one this platform knows.
     *
     * <p>An unknown value is a validation error and never a silent fall back to {@code CAR}: the
     * client is choosing from a catalogue the API published, so a value outside it means the two have
     * drifted, and quietly storing a car where the citizen said motorcycle is how a per-type tariff
     * ends up charging the wrong person. Absent is different from wrong: sending nothing is the
     * ordinary case and takes the default.</p>
     */
    private VehicleType requireValidType(String value) {
        if (value == null || value.isBlank()) {
            return VehicleType.DEFAULT;
        }
        return VehicleType.parse(value).orElseThrow(() -> new ValidationException("type",
                ErrorCode.VALIDATION_FAILED, "error.parking.vehicle.type.invalid"));
    }

    /** The colour, refused when unknown. Absent stays absent: "not said" is a real answer. */
    private VehicleColor requireValidColor(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return VehicleColor.parse(value).orElseThrow(() -> new ValidationException("color",
                ErrorCode.VALIDATION_FAILED, "error.parking.vehicle.color.invalid"));
    }

    @Transactional
    public void delete(UserId userId, UUID vehicleId) {
        Vehicle vehicle = requireOwn(userId, vehicleId);
        if (sessionRepository.existsByVehicleIdAndStatus(vehicleId, ParkingSessionStatus.ACTIVE)) {
            throw ConflictException.of(ErrorCode.VEHICLE_HAS_ACTIVE_SESSION,
                    "error.parking.vehicle.activeSession");
        }
        vehicleRepository.delete(vehicle);
    }

    /** Makes one vehicle the primary one, demoting whichever held the flag. */
    @Transactional
    public Vehicle makePrimary(UserId userId, UUID vehicleId) {
        Vehicle vehicle = requireOwn(userId, vehicleId);
        Instant now = clock.instant();
        if (vehicle.isPrimary()) {
            return vehicle;
        }
        // Demote first and flush, or the partial unique index would see two primaries mid-statement.
        clearPrimary(userId, vehicleId, now);
        vehicle.changePrimary(true);
        vehicle.touch(now);
        return vehicleRepository.save(vehicle);
    }

    private void clearPrimary(UserId userId, UUID keepId, Instant now) {
        List<Vehicle> owned = vehicleRepository.findByUserIdOrderByCreatedAtAsc(userId.value());
        for (Vehicle other : owned) {
            if (other.isPrimary() && !other.getId().equals(keepId)) {
                other.changePrimary(false);
                other.touch(now);
                vehicleRepository.save(other);
            }
        }
        vehicleRepository.flush();
    }

    /**
     * @return the normalised plate
     * @throws ValidationException when nothing usable is left after normalising, which is the only
     *         plate rule this platform enforces: the shape of a plate is a fact about a national
     *         vehicle registry, not about us, and rejecting a valid foreign plate would be a bug
     */
    private String requireValidPlate(String plate) {
        String normalized = PlateNormalizer.normalize(plate);
        if (!PlateNormalizer.isValid(normalized) || plate.trim().length() > PlateNormalizer.MAX_LENGTH) {
            throw new ValidationException("plate", ErrorCode.VALIDATION_FAILED, "error.parking.vehicle.plate.invalid");
        }
        return normalized;
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
