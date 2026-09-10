package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingSpace;
import cr.luparx.parking.model.ParkingSpaceRange;
import cr.luparx.parking.model.ParkingSpaceStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Bays of one municipality. A municipality has thousands of them, so every read here is either
 * narrowed to a single code or paginated — never an unbounded scan (CONTRACT.md §7).
 *
 * <p>{@link #findByTenantIdAndCode} is the lookup the citizen flow uses: the person types the code
 * painted on the bay, not an internal identifier.</p>
 */
public interface ParkingSpaceRepository extends JpaRepository<ParkingSpace, UUID> {

    Optional<ParkingSpace> findByTenantIdAndCode(UUID tenantId, String code);

    Optional<ParkingSpace> findByTenantIdAndId(UUID tenantId, UUID id);

    Page<ParkingSpace> findByTenantIdAndZoneIdOrderByCodeAsc(UUID tenantId, UUID zoneId, Pageable pageable);

    Page<ParkingSpace> findByTenantIdOrderByCodeAsc(UUID tenantId, Pageable pageable);

    long countByTenantId(UUID tenantId);

    long countByTenantIdAndZoneId(UUID tenantId, UUID zoneId);

    long countByTenantIdAndStatus(UUID tenantId, ParkingSpaceStatus status);

    /**
     * The code range of every zone of a municipality, in ONE aggregate query.
     *
     * <p>The alternative — asking each zone for its own min, max and count — is the N+1 this project
     * refuses on a normal endpoint (CONTRACT.md §7), and it would get slower exactly as a
     * municipality grows. This groups instead, so the cost is one scan of an index the table already
     * has on {@code (tenant_id, zone_id)} however many thousands of bays there are.</p>
     *
     * <p>Projected into {@link cr.luparx.parking.model.ParkingSpaceRange} rather than returned as
     * entities: a zone's range is three numbers, and loading every bay to compute them would be
     * absurd.</p>
     */
    @Query("""
            select new cr.luparx.parking.model.ParkingSpaceRange(
                    s.zoneId, min(s.code), max(s.code), count(s))
            from ParkingSpace s
            where s.tenantId = :tenantId
            group by s.zoneId
            """)
    List<ParkingSpaceRange> rangesByZone(@Param("tenantId") UUID tenantId);

    /**
     * Bays in service, by zone (CONTRACT.md v0.36).
     *
     * <p>The denominator of occupancy, and only the ones actually in service: a bay taken out for
     * roadworks is not capacity, and counting it would report a municipality as emptier than it is
     * on exactly the week it is most congested.</p>
     */
    @org.springframework.data.jpa.repository.Query("""
            select s.zoneId, count(s)
            from ParkingSpace s
            where s.tenantId = :tenantId and s.status = :status
            group by s.zoneId
            """)
    java.util.List<Object[]> countInServiceByZone(
            @org.springframework.data.repository.query.Param("tenantId") java.util.UUID tenantId,
            @org.springframework.data.repository.query.Param("status")
            cr.luparx.parking.model.ParkingSpaceStatus status);
}
