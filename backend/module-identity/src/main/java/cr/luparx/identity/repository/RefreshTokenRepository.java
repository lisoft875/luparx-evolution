package cr.luparx.identity.repository;

import cr.luparx.core.domain.Portal;
import cr.luparx.identity.entity.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

    Optional<RefreshToken> findByTokenHash(String tokenHash);

    List<RefreshToken> findByUserId(UUID userId);

    List<RefreshToken> findByFamilyId(UUID familyId);

    /** Revokes an entire token family at once when reuse is detected (ADR 0005). */
    @Modifying
    @Query("update RefreshToken t set t.revokedAt = :now where t.familyId = :familyId and t.revokedAt is null")
    int revokeFamily(@Param("familyId") UUID familyId, @Param("now") Instant now);

    /** Revokes every session of a user (block, forced password reset, incident response). */
    @Modifying
    @Query("update RefreshToken t set t.revokedAt = :now where t.userId = :userId and t.revokedAt is null")
    int revokeAllForUser(@Param("userId") UUID userId, @Param("now") Instant now);

    /**
     * Revokes a user's sessions on one portal only. Used when switching active municipality: the
     * previous tokens carried the old tid claim and must not survive the switch (CONTRACT.md 3),
     * while sessions on other portals are unrelated and are left alone.
     */
    @Modifying
    @Query("update RefreshToken t set t.revokedAt = :now where t.userId = :userId "
            + "and t.portal = :portal and t.revokedAt is null")
    int revokeAllForUserAndPortal(@Param("userId") UUID userId,
                                  @Param("portal") Portal portal,
                                  @Param("now") Instant now);
}
