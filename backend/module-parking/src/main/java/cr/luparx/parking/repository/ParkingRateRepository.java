package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingRate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Tariffs of one municipality, always read through its tenant (docs/ARCHITECTURE.md §4). */
public interface ParkingRateRepository extends JpaRepository<ParkingRate, UUID> {

    List<ParkingRate> findByTenantIdAndZoneIdOrderByValidFromDesc(UUID tenantId, UUID zoneId);

    /**
     * Tariffs of a zone whose window had already opened at {@code at}, most recent first. The caller
     * takes the first one whose window has not closed yet, which is the tariff in force.
     *
     * <p>Filtering {@code valid_to} in Java rather than in the query is deliberate: a rate history
     * has a handful of rows per zone — a tariff is superseded by closing its window, not by writing
     * one per day — and a derived query keeps the contract of this interface readable. It is
     * covered by {@code ix_parking_rates_zone_validity}.</p>
     */
    List<ParkingRate> findByTenantIdAndZoneIdAndValidFromLessThanEqualOrderByValidFromDesc(
            UUID tenantId, UUID zoneId, Instant at);

    /**
     * Every tariff of a municipality whose window is open at {@code at} — one per zone that has one.
     *
     * <p>Exists so that listing the zones a citizen may park in does not turn into one tariff query
     * per zone (CONTRACT.md §7, no N+1). It is narrowed by tenant and by the window, so it returns at
     * most one row per zone however long the price history has grown, and it is covered by
     * {@code ix_parking_rates_zone_validity}.</p>
     */
    @Query("""
            select r from ParkingRate r
            where r.tenantId = :tenantId
              and r.validFrom <= :at
              and (r.validTo is null or r.validTo > :at)
            order by r.zoneId asc, r.validFrom desc
            """)
    List<ParkingRate> findInForce(@Param("tenantId") UUID tenantId, @Param("at") Instant at);

    long countByTenantId(UUID tenantId);

    long countByTenantIdAndZoneId(UUID tenantId, UUID zoneId);
}
