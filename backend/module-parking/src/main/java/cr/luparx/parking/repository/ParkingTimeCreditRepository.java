package cr.luparx.parking.repository;

import cr.luparx.parking.entity.ParkingTimeCredit;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

/** Minute balances, per {@code (tenantId, userId)}. Minutes never cross a municipality. */
public interface ParkingTimeCreditRepository extends JpaRepository<ParkingTimeCredit, UUID> {

    Optional<ParkingTimeCredit> findByTenantIdAndUserId(UUID tenantId, UUID userId);

    /** Row-locked variant for the read-decide-write of consuming or granting minutes. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from ParkingTimeCredit c where c.tenantId = :tenantId and c.userId = :userId")
    Optional<ParkingTimeCredit> lockByTenantIdAndUserId(@Param("tenantId") UUID tenantId,
                                                        @Param("userId") UUID userId);
}
