package cr.luparx.identity.repository;

import cr.luparx.core.domain.Portal;
import cr.luparx.identity.entity.AuthAttempt;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface AuthAttemptRepository extends JpaRepository<AuthAttempt, UUID> {

    long countByEmailHashAndPortalAndSuccessFalseAndOccurredAtAfter(String emailHash, Portal portal, Instant after);

    long countByIpHashAndPortalAndSuccessFalseAndOccurredAtAfter(String ipHash, Portal portal, Instant after);

    /** Housekeeping job: attempts older than the retention window carry no value (ADR 0013). */
    @Modifying
    @Query("delete from AuthAttempt a where a.occurredAt < :before")
    int deleteOlderThan(@Param("before") Instant before);
}
