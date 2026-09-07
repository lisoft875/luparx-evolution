package cr.luparx.identity.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.UnauthorizedException;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.entity.UserCredentials;
import cr.luparx.identity.entity.VerificationToken;
import cr.luparx.identity.model.VerificationPurpose;
import cr.luparx.identity.repository.UserCredentialsRepository;
import cr.luparx.identity.repository.UserRepository;
import cr.luparx.identity.repository.VerificationTokenRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;

/**
 * Password reset by email (CONTRACT.md §4 {@code /password/forgot} and {@code /password/reset}).
 *
 * <p>{@code forgot} always answers 202 whether or not the address exists: telling an anonymous
 * caller which emails are registered is an account-enumeration oracle.</p>
 *
 * <p>A completed reset bumps {@code credentials_version} and revokes every refresh token, so a
 * session opened by whoever compromised the account dies immediately instead of surviving until its
 * natural expiry.</p>
 */
@Service
public class PasswordResetService {

    private static final Duration TOKEN_TTL = Duration.ofHours(1);

    private final VerificationTokenRepository tokenRepository;
    private final UserRepository userRepository;
    private final UserCredentialsRepository credentialsRepository;
    private final PasswordService passwordService;
    private final RefreshTokenService refreshTokenService;
    private final Clock clock;

    public PasswordResetService(VerificationTokenRepository tokenRepository,
                                UserRepository userRepository,
                                UserCredentialsRepository credentialsRepository,
                                PasswordService passwordService,
                                RefreshTokenService refreshTokenService,
                                Clock clock) {
        this.tokenRepository = tokenRepository;
        this.userRepository = userRepository;
        this.credentialsRepository = credentialsRepository;
        this.passwordService = passwordService;
        this.refreshTokenService = refreshTokenService;
        this.clock = clock;
    }

    /**
     * @return the user and the plaintext token when the address exists; empty otherwise. The caller
     *         responds 202 either way.
     */
    @Transactional
    public Optional<Issued> requestReset(String email) {
        if (email == null || email.isBlank()) {
            return Optional.empty();
        }
        return userRepository.findByEmail(email.trim().toLowerCase(Locale.ROOT))
                .map(user -> new Issued(user, issueToken(UserId.of(user.getId()))));
    }

    /** Administrative forced reset: same token flow, plus the account must change its password. */
    @Transactional
    public Issued forceReset(UserId userId) {
        User user = userRepository.findById(userId.value())
                .orElseThrow(() -> NotFoundException.of(ErrorCode.USER_NOT_FOUND, "error.user.notFound"));
        Instant now = clock.instant();
        credentialsRepository.findById(user.getId()).ifPresent(credentials -> credentials.requireChange(now));
        user.bumpCredentialsVersion(now);
        refreshTokenService.revokeAllForUser(UserId.of(user.getId()));
        return new Issued(user, issueToken(UserId.of(user.getId())));
    }

    private String issueToken(UserId userId) {
        Instant now = clock.instant();
        tokenRepository.consumeOutstanding(userId.value(), VerificationPurpose.PASSWORD_RESET, now);
        String raw = Hashing.randomToken();
        tokenRepository.save(new VerificationToken(
                Uuid7.generate(),
                userId.value(),
                VerificationPurpose.PASSWORD_RESET,
                Hashing.sha256Hex(raw),
                now,
                now.plus(TOKEN_TTL)));
        return raw;
    }

    @Transactional
    public User reset(String rawToken, String newPassword) {
        passwordService.validatePolicy(newPassword, "newPassword");
        Instant now = clock.instant();
        VerificationToken token = tokenRepository.findByTokenHash(Hashing.sha256Hex(rawToken))
                .filter(candidate -> candidate.getPurpose() == VerificationPurpose.PASSWORD_RESET)
                .filter(candidate -> candidate.isUsable(now))
                .orElseThrow(() -> UnauthorizedException.of(ErrorCode.VERIFICATION_TOKEN_INVALID,
                        "error.verification.token.invalid"));
        User user = userRepository.findById(token.getUserId())
                .orElseThrow(() -> NotFoundException.of(ErrorCode.USER_NOT_FOUND, "error.user.notFound"));

        String hash = passwordService.hash(newPassword);
        credentialsRepository.findById(user.getId())
                .ifPresentOrElse(
                        credentials -> credentials.replace(hash, passwordService.algorithm(), now),
                        () -> credentialsRepository.save(new UserCredentials(user.getId(), hash,
                                passwordService.algorithm(), now, false)));

        token.markUsed(now);
        user.bumpCredentialsVersion(now);
        // A reset means "I may have been compromised": every existing session is destroyed.
        refreshTokenService.revokeAllForUser(UserId.of(user.getId()));
        return user;
    }

    /** A user together with the one-time token that must be emailed to them. */
    public record Issued(User user, String token) {
    }
}
