package cr.luparx.app.idempotency;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface IdempotencyKeyRepository extends JpaRepository<IdempotencyKeyEntity, UUID> {

    Optional<IdempotencyKeyEntity> findByScopeHash(String scopeHash);

    /** Housekeeping: expired records carry no replay value and must not grow without bound. */
    @Modifying
    @Query("delete from IdempotencyKeyEntity k where k.expiresAt < :before")
    int deleteExpired(@Param("before") Instant before);
}
