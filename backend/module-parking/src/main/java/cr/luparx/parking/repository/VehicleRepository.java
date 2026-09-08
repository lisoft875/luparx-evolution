package cr.luparx.parking.repository;

import cr.luparx.parking.entity.Vehicle;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Vehicles of one person. Every read here is narrowed by {@code userId} — a vehicle is owned by a
 * person, not by a municipality, so the isolation boundary of this table is the user and not the
 * tenant (see {@link Vehicle}).
 *
 * <p>The single exception is {@link #findByPlateNormalizedOrderByCreatedAtAsc}, which deliberately
 * crosses users. It exists for operational lookups only and is not reachable from any citizen
 * endpoint; the inspector flow reads {@code parking_sessions}, which is tenant-scoped.</p>
 */
public interface VehicleRepository extends JpaRepository<Vehicle, UUID> {

    List<Vehicle> findByUserIdOrderByCreatedAtAsc(UUID userId);

    Optional<Vehicle> findByIdAndUserId(UUID id, UUID userId);

    Optional<Vehicle> findByUserIdAndPlateNormalized(UUID userId, String plateNormalized);

    boolean existsByUserIdAndPlateNormalized(UUID userId, String plateNormalized);

    /** Every registration of one plate, across people. See the type comment before using it. */
    List<Vehicle> findByPlateNormalizedOrderByCreatedAtAsc(String plateNormalized);

    long countByUserId(UUID userId);
}
