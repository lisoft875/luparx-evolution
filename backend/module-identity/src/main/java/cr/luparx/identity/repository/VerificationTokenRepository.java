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

    /**
     * El token vigente más reciente de ese propósito, si queda alguno sin usar ni vencer.
     *
     * Se usa para NO emitir uno nuevo cuando la persona vuelve a pedir el enlace a los pocos
     * segundos: cada emisión invalida la anterior (ver {@link #consumeOutstanding}), así que diez
     * clics dejaban diez correos en la bandeja de los cuales sólo el último servía.
     */
    Optional<VerificationToken> findTopByUserIdAndPurposeAndUsedAtIsNullAndExpiresAtAfterOrderByCreatedAtDesc(
            UUID userId, VerificationPurpose purpose, Instant now);

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
