package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingZonePolicy;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Where zones depart from their municipality's rules.
 *
 * <p>An absent row is the normal case and never an error: it means the zone does not depart in
 * anything. Nothing here creates one on read, unlike the municipality's own policy — materialising a
 * row of nulls for every zone anybody looks at would fill the table with rows that say nothing.</p>
 */
public interface ParkingZonePolicyRepository extends JpaRepository<ParkingZonePolicy, UUID> {

    Optional<ParkingZonePolicy> findByTenantIdAndZoneId(UUID tenantId, UUID zoneId);

    List<ParkingZonePolicy> findByTenantId(UUID tenantId);

    /** The departures of a whole page of zones, so a zone listing does not ask once per row. */
    List<ParkingZonePolicy> findByTenantIdAndZoneIdIn(UUID tenantId, Collection<UUID> zoneIds);
}
