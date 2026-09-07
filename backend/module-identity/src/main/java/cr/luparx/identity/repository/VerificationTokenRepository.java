package cr.luparx.identity.repository;

import cr.luparx.identity.entity.VerificationToken;
import cr.luparx.identity.model.VerificationPurpose;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface VerificationTokenRepository extends JpaRepository<VerificationToken, UUID> {

    Optional<VerificationToken> findByTokenHash(String tokenHash);

    /** Invalidates any outstanding token of the same purpose before issuing a new one. */
    @Modifying
    @Query("""
            update VerificationToken t set t.usedAt = :now
            where t.userId = :userId and t.purpose = :purpose and t.usedAt is null
            """)
    int consumeOutstanding(@Param("userId") UUID userId,
                           @Param("purpose") VerificationPurpose purpose,
                           @Param("now") Instant now);
}
