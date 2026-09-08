package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingTimeCreditEntry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/**
 * Movements of a minute balance.
 *
 * <p>{@link #findLiveLots} is the consumption query: the lots of one citizen that still hold unspent
 * minutes, oldest expiry first, so that minutes about to expire are used before minutes that are
 * not. {@code expires_at} sorts NULLS LAST in ascending order in PostgreSQL, which puts the lots
 * that never expire at the end — exactly where they belong.</p>
 */
public interface ParkingTimeCreditEntryRepository extends JpaRepository<ParkingTimeCreditEntry, UUID> {

    @Query("select e from ParkingTimeCreditEntry e where e.creditId = :creditId and e.remainingMinutes > 0"
            + " order by e.expiresAt asc, e.createdAt asc")
    List<ParkingTimeCreditEntry> findLiveLots(@Param("creditId") UUID creditId);

    Page<ParkingTimeCreditEntry> findByCreditIdOrderByCreatedAtDesc(UUID creditId, Pageable pageable);
}
