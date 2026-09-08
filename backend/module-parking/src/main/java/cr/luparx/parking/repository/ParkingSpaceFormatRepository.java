package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingSpaceFormat;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/** One row per municipality, keyed by tenant: there is no way to read another one's format by id. */
public interface ParkingSpaceFormatRepository extends JpaRepository<ParkingSpaceFormat, UUID> {
}
