package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingSessionExtension;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/** Extensions of one session, always read through the session that owns them. */
public interface ParkingSessionExtensionRepository extends JpaRepository<ParkingSessionExtension, UUID> {

    List<ParkingSessionExtension> findBySessionIdOrderByExtendedAtAsc(UUID sessionId);

    long countBySessionId(UUID sessionId);
}
