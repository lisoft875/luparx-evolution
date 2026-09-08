package cr.luparx.identity.service;

import cr.luparx.core.domain.Portal;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.UnauthorizedException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.identity.entity.RefreshToken;
import cr.luparx.identity.repository.RefreshTokenRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

/**
 * Opaque refresh tokens with rotation and reuse detection (ADR 0005).
 *
 * <p>Each login starts a token <em>family</em>. Every refresh consumes the presented token and
 * issues a successor in the same family. If a token that has already been rotated is presented
 * again, the only sound explanation is that a copy leaked, so the entire family is revoked and the
 * caller is forced to authenticate from scratch — the legitimate client loses its session too, which
 * is the intended trade-off.</p>
 *
 * <p><b>Expiry is configuration; rotation is not.</b> With {@code luparx.jwt.refresh-token-ttl = 0}
 * (the default since CONTRACT.md v0.3 §2) a token is persisted without {@code expires_at} and is
 * never refused for being old. Everything above still applies: each use rotates, a replay still
 * kills the family, and logout, a password change and an administrative block still revoke.</p>
 */
@Service
public class RefreshTokenService {

    /** A rotation result: the persisted row plus the plaintext that is only ever returned once. */
    public record Issued(RefreshToken token, String rawToken) {
    }

    private final RefreshTokenRepository refreshTokenRepository;
    private final TokenProperties properties;
    private final Clock clock;

    public RefreshTokenService(RefreshTokenRepository refreshTokenRepository, TokenProperties properties,
                               Clock clock) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.properties = properties;
        this.clock = clock;
    }

    /** Starts a new family (a fresh login). */
    @Transactional
    public Issued issue(UserId userId, Portal portal, TenantId tenantId, String userAgent, String ipHash) {
        return issueInFamily(userId, portal, tenantId, UUID.randomUUID(), userAgent, ipHash);
    }

    private Issued issueInFamily(UserId userId, Portal portal, TenantId tenantId, UUID familyId, String userAgent,
                                 String ipHash) {
        Instant now = clock.instant();
        String raw = Hashing.randomToken();
        RefreshToken token = new RefreshToken(
                Uuid7.generate(),
                userId.value(),
                portal,
                tenantId == null ? null : tenantId.value(),
                Hashing.sha256Hex(raw),
                familyId,
                now,
                // null = no expiry (CONTRACT.md v0.3 §2). Nothing else about the token changes.
                properties.refreshTokenNeverExpires() ? null : now.plus(properties.refreshTokenTtl()),
                truncate(userAgent),
                ipHash);
        refreshTokenRepository.save(token);
        return new Issued(token, raw);
    }

    /**
     * Consumes the presented token and issues its successor.
     *
     * @param tenantId tenant of the new session; pass the current one to refresh in place, or a new
     *                 one when switching municipality (CONTRACT.md §3)
     * @throws UnauthorizedException with {@code REFRESH_TOKEN_REUSED} when reuse is detected — the
     *                               whole family is revoked before the exception is thrown
     */
    @Transactional
    public Issued rotate(String rawToken, Portal portal, TenantId tenantId, String userAgent, String ipHash) {
        RefreshToken current = require(rawToken, portal);
        Instant now = clock.instant();

        if (current.getReplacedBy() != null || current.isRevoked()) {
            refreshTokenRepository.revokeFamily(current.getFamilyId(), now);
            throw UnauthorizedException.of(ErrorCode.REFRESH_TOKEN_REUSED, "error.refreshToken.reused");
        }
        if (current.isExpired(now)) {
            throw UnauthorizedException.of(ErrorCode.REFRESH_TOKEN_INVALID, "error.refreshToken.invalid");
        }

        Issued successor = issueInFamily(UserId.of(current.getUserId()), portal, tenantId, current.getFamilyId(),
                userAgent, ipHash);
        current.rotateTo(successor.token().getId(), now);
        return successor;
    }

    /** Looks up a presented token, checking that it was minted for this portal. */
    @Transactional(readOnly = true)
    public RefreshToken require(String rawToken, Portal portal) {
        if (rawToken == null || rawToken.isBlank()) {
            throw UnauthorizedException.of(ErrorCode.REFRESH_TOKEN_INVALID, "error.refreshToken.invalid");
        }
        RefreshToken token = refreshTokenRepository.findByTokenHash(Hashing.sha256Hex(rawToken))
                .orElseThrow(() -> UnauthorizedException.of(ErrorCode.REFRESH_TOKEN_INVALID,
                        "error.refreshToken.invalid"));
        if (token.getPortal() != portal) {
            // A refresh token from another portal must never be exchangeable here (CONTRACT.md §3).
            throw UnauthorizedException.of(ErrorCode.PORTAL_MISMATCH, "error.refreshToken.portalMismatch");
        }
        return token;
    }

    /** Logout: revokes just the presented token; other devices keep their sessions. */
    @Transactional
    public void revoke(String rawToken, Portal portal) {
        Instant now = clock.instant();
        refreshTokenRepository.findByTokenHash(Hashing.sha256Hex(rawToken))
                .filter(token -> token.getPortal() == portal)
                .ifPresent(token -> token.revoke(now));
    }

    /** Revokes every session of a user (block, password change, incident response). */
    @Transactional
    public int revokeAllForUser(UserId userId) {
        return refreshTokenRepository.revokeAllForUser(userId.value(), clock.instant());
    }

    /** Revokes the user's sessions on one portal; used when the active municipality changes. */
    @Transactional
    public int revokeAllForUserAndPortal(UserId userId, Portal portal) {
        return refreshTokenRepository.revokeAllForUserAndPortal(userId.value(), portal, clock.instant());
    }

    private String truncate(String userAgent) {
        if (userAgent == null) {
            return null;
        }
        return userAgent.length() <= 400 ? userAgent : userAgent.substring(0, 400);
    }
}
