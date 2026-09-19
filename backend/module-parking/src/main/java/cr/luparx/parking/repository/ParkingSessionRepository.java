package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingSession;
import cr.luparx.parking.model.ParkingSessionStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Parking sessions. Every citizen-facing read carries {@code tenantId} first
 * (docs/ARCHITECTURE.md §4), and the collection reads are paginated (CONTRACT.md §4): a
 * municipality accumulates sessions forever, so an unbounded list here would be a table scan that
 * grows every day.
 *
 * <p>{@link #findByVehicleIdAndStatus} is Optional-returning on the strength of the partial unique
 * index {@code uq_parking_sessions_active_vehicle}: with {@code status = ACTIVE} the database
 * guarantees at most one row. <b>The lookup by bay is not</b>, and since v0.37 that is the whole
 * point — {@code uq_parking_sessions_active_space} is gone and a bay may hold one running stay per
 * plate (V34_0). Neither is tenant-scoped on purpose: a car is in one place at a time whichever
 * municipality it is parked in, and a bay belongs to exactly one municipality already.</p>
 */
public interface ParkingSessionRepository extends JpaRepository<ParkingSession, UUID> {

    Optional<ParkingSession> findByTenantIdAndId(UUID tenantId, UUID id);

    Optional<ParkingSession> findByVehicleIdAndStatus(UUID vehicleId, ParkingSessionStatus status);

    /**
     * Every stay on this bay in this status — a LIST since v0.37, and changing it back would be a bug.
     *
     * <p>Two citizens may each have a running stay on the same bay when the municipality allows it
     * ({@code parking_policies.overlapping_stays_enabled}, V34_0). An Optional here would not merely
     * hide the second one: Spring Data throws on more than one result, so the ordinary case of a bay
     * somebody failed to release would surface as a 500 the next time anyone tried to park on it.</p>
     */
    List<ParkingSession> findAllBySpaceIdAndStatus(UUID spaceId, ParkingSessionStatus status);

    boolean existsBySpaceIdAndStatus(UUID spaceId, ParkingSessionStatus status);

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

    /**
     * Stays for this plate that the CLOCK ended, newest first, no older than {@code since}.
     *
     * <p>Only {@code EXPIRED}. A {@code FINISHED} stay is one the citizen closed themselves — they
     * said they were leaving — and reporting that to an officer as a lapsed payment would put words
     * in their mouth (CONTRACT.md v0.28).</p>
     *
     * <p>Bounded by {@code since} because this answers "did it just run out", not "what did this
     * plate ever pay": unbounded, it would eventually scan a table that grows with every stay.</p>
     */
    @Query("""
            select s from ParkingSession s
            where s.tenantId = :tenantId and s.plateSnapshot = :plate
              and s.status = cr.luparx.parking.model.ParkingSessionStatus.EXPIRED
              and s.expiresAt >= :since
            order by s.expiresAt desc
            """)
    List<ParkingSession> findRecentlyExpired(@Param("tenantId") UUID tenantId,
                                             @Param("plate") String plate,
                                             @Param("since") Instant since);

    /**
     * Estadías de un VEHÍCULO REGISTRADO que cubrían este instante, la que empezó más tarde primero.
     *
     * <p>Sirve para desempatar a quién pertenece una boleta cuando dos personas registraron la misma
     * placa: haber pagado una estadía en ese momento es un hecho, mientras que {@code is_owner} es
     * una declaración que viene en {@code true} por omisión y que el dueño anterior de un carro
     * vendido también sigue afirmando.</p>
     *
     * <p>{@code vehicleId is not null} es la condición que hace esto útil: una estadía escrita como
     * invitado no dice de quién es el carro, sólo que alguien lo tecleó. Se exige además que el
     * instante caiga dentro de la estadía —no se acepta una de la semana pasada— y no se filtra por
     * estado, porque una estadía que ya terminó sigue probando quién estaba parqueado entonces.</p>
     */
    @Query("""
            select s from ParkingSession s
            where s.tenantId = :tenantId and s.plateSnapshot = :plate
              and s.vehicleId is not null
              and s.startedAt <= :moment and s.expiresAt >= :moment
            order by s.startedAt desc
            """)
    List<ParkingSession> findRegisteredStaysCovering(@Param("tenantId") UUID tenantId,
                                                     @Param("plate") String plate,
                                                     @Param("moment") Instant moment);

    /**
     * Stays whose clock lands inside a window, across every municipality (v0.38).
     *
     * <p>Deliberately not tenant-scoped: this answers a scheduled job that has no municipality of its
     * own, and narrowing it per tenant would mean one query per municipality on every pass. The rows
     * it returns carry their tenant, and everything written from them is scoped by it.</p>
     *
     * <p>{@code FINISHED} is excluded by the caller's status list, and that is the point: somebody
     * who closed their stay early said they were leaving, and telling them it "ran out" would be
     * putting words in their mouth — the same reasoning as {@code recentlyExpiredStays}.</p>
     */
    List<ParkingSession> findByStatusInAndExpiresAtBetweenOrderByExpiresAtAsc(
            java.util.Collection<ParkingSessionStatus> statuses, Instant from, Instant to, Pageable pageable);

    long countByTenantIdAndStatus(UUID tenantId, ParkingSessionStatus status);

    /**
     * Whether this plate already took its courtesy stay inside this window (CONTRACT.md v0.31).
     *
     * <p>The window is the municipality's own calendar day, computed by the caller in its time zone:
     * a midnight is a local fact, and a day that turned over at seven in the evening would be
     * unexplainable to the person standing at the bay.</p>
     */
    boolean existsByTenantIdAndPlateSnapshotAndCourtesyTrueAndStartedAtBetween(
            java.util.UUID tenantId, String plateSnapshot, java.time.Instant from, java.time.Instant to);

    /**
     * Running stays grouped by zone, right now (CONTRACT.md v0.36).
     *
     * <p>The numerator of occupancy. A stay with no zone is counted apart rather than dropped: it is
     * still a car parked somewhere, and silently losing it would make the municipality's busiest
     * hour look quieter than it was.</p>
     */
    @org.springframework.data.jpa.repository.Query("""
            select s.zoneId, count(s)
            from ParkingSession s
            where s.tenantId = :tenantId and s.status = :status
            group by s.zoneId
            """)
    java.util.List<Object[]> countActiveByZone(
            @org.springframework.data.repository.query.Param("tenantId") java.util.UUID tenantId,
            @org.springframework.data.repository.query.Param("status")
            cr.luparx.parking.model.ParkingSessionStatus status);

    /**
     * Stays of a period grouped by how the money went, with what they were worth.
     *
     * <p>Grouped by {@code paymentStatus} (v0.32) rather than by {@code status}: the dashboard
     * question is about the money, and a stay that finished last week is not the same fact as a stay
     * that was never charged for.</p>
     */
    @org.springframework.data.jpa.repository.Query("""
            select s.paymentStatus, count(s), coalesce(sum(s.amountMinor), 0)
            from ParkingSession s
            where s.tenantId = :tenantId and s.startedAt >= :from and s.startedAt < :to
            group by s.paymentStatus
            """)
    java.util.List<Object[]> countByPaymentStatus(
            @org.springframework.data.repository.query.Param("tenantId") java.util.UUID tenantId,
            @org.springframework.data.repository.query.Param("from") java.time.Instant from,
            @org.springframework.data.repository.query.Param("to") java.time.Instant to);
}
