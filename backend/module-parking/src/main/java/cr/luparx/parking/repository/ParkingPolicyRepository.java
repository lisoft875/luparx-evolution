package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingPolicy;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/**
 * The parking policy of one municipality. The primary key <em>is</em> the tenant, so there is no way
 * to spell a query here that is not tenant-scoped — which is exactly the property
 * docs/ARCHITECTURE.md §4 asks of every tenant-owned table.
 */
public interface ParkingPolicyRepository extends JpaRepository<ParkingPolicy, UUID> {
}
