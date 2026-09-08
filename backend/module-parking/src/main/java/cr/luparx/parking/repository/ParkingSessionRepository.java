package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingSession;
import cr.luparx.parking.model.ParkingSessionStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Parking sessions. Every citizen-facing read carries {@code tenantId} first
 * (docs/ARCHITECTURE.md §4), and the collection reads are paginated (CONTRACT.md §4): a
 * municipality accumulates sessions forever, so an unbounded list here would be a table scan that
 * grows every day.
 *
 * <p>The two {@code ...AndStatus} lookups by vehicle and by space are Optional-returning on the
 * strength of the partial unique indexes {@code uq_parking_sessions_active_vehicle} and
 * {@code uq_parking_sessions_active_space}: with {@code status = ACTIVE} the database guarantees at
 * most one row. They are not tenant-scoped on purpose — a car is in one place at a time whichever
 * municipality it is parked in, and a bay belongs to exactly one municipality already.</p>
 */
public interface ParkingSessionRepository extends JpaRepository<ParkingSession, UUID> {

    Optional<ParkingSession> findByTenantIdAndId(UUID tenantId, UUID id);

    Optional<ParkingSession> findByVehicleIdAndStatus(UUID vehicleId, ParkingSessionStatus status);

    Optional<ParkingSession> findBySpaceIdAndStatus(UUID spaceId, ParkingSessionStatus status);

    boolean existsByVehicleIdAndStatus(UUID vehicleId, ParkingSessionStatus status);

    /** The citizen's running sessions, soonest to expire first: the order the countdown bar needs. */
    List<ParkingSession> findByTenantIdAndUserIdAndStatusOrderByExpiresAtAsc(
            UUID tenantId, UUID userId, ParkingSessionStatus status);

    Page<ParkingSession> findByTenantIdAndUserIdOrderByStartedAtDesc(UUID tenantId, UUID userId, Pageable pageable);

    Page<ParkingSession> findByTenantIdAndUserIdAndStatusOrderByStartedAtDesc(
            UUID tenantId, UUID userId, ParkingSessionStatus status, Pageable pageable);

    /**
     * The inspector's lookup: a plate, inside this municipality, running now.
     *
     * <p>It returns a LIST and not an Optional, and that is not an oversight.
     * {@code vehicles.plate_normalized} is unique per user, never globally (CONTRACT.md v0.2,
     * rule 2), so two citizens may legitimately have registered the same plate and both may have a
     * session running in the same municipality at the same time.</p>
     *
     * <p>TODO(domain): decide how the inspector app disambiguates several active sessions for one
     * plate. The data needed is already on each row — zone and space — so the natural resolution is
     * to ask the inspector which bay the car is actually standing on, or to filter by the bay they
     * are scanning. That is a product decision (what the inspector sees, and what counts as a
     * verified stay when two matches exist), not something this repository may invent: silently
     * returning the first match would let a real infraction be excused by somebody else's session.
     * Until it is decided, every match is returned and the caller must handle more than one.</p>
     */
    List<ParkingSession> findByTenantIdAndPlateSnapshotAndStatusOrderByExpiresAtAsc(
            UUID tenantId, String plateSnapshot, ParkingSessionStatus status);

    long countByTenantIdAndStatus(UUID tenantId, ParkingSessionStatus status);
}
