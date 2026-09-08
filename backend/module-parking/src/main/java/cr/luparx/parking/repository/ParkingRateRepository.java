package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingRate;
import org.springframework.data.jpa.repository.JpaRepository;

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

    long countByTenantId(UUID tenantId);

    long countByTenantIdAndZoneId(UUID tenantId, UUID zoneId);
}
