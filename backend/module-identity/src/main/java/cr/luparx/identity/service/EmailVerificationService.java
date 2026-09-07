package cr.luparx.identity.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.UnauthorizedException;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.entity.VerificationToken;
import cr.luparx.identity.model.VerificationPurpose;
import cr.luparx.identity.repository.UserRepository;
import cr.luparx.identity.repository.VerificationTokenRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/**
 * Email ownership proof (CONTRACT.md §4 {@code POST /auth/{portal}/email/verify}).
 *
 * <p>Only the hash of the token is stored, and issuing a new token invalidates any outstanding one,
 * so a link forwarded to the wrong person stops working as soon as the user asks for another.</p>
 */
@Service
public class EmailVerificationService {

    private static final Duration TOKEN_TTL = Duration.ofHours(24);

    private final VerificationTokenRepository tokenRepository;
    private final UserRepository userRepository;
    private final Clock clock;

    public EmailVerificationService(VerificationTokenRepository tokenRepository, UserRepository userRepository,
                                    Clock clock) {
        this.tokenRepository = tokenRepository;
        this.userRepository = userRepository;
        this.clock = clock;
    }

    /** @return the plaintext token, to be delivered by the notification sender and never stored */
    @Transactional
    public String issueToken(UserId userId) {
        Instant now = clock.instant();
        tokenRepository.consumeOutstanding(userId.value(), VerificationPurpose.EMAIL_VERIFICATION, now);
        String raw = Hashing.randomToken();
        tokenRepository.save(new VerificationToken(
                Uuid7.generate(),
                userId.value(),
                VerificationPurpose.EMAIL_VERIFICATION,
                Hashing.sha256Hex(raw),
                now,
                now.plus(TOKEN_TTL)));
        return raw;
    }

    /**
     * @return the verified user
     * @throws UnauthorizedException when the token is unknown, expired, already used or issued for a
     *                               different purpose
     */
    @Transactional
    public User verify(String rawToken) {
        Instant now = clock.instant();
        VerificationToken token = tokenRepository.findByTokenHash(Hashing.sha256Hex(rawToken))
                .filter(candidate -> candidate.getPurpose() == VerificationPurpose.EMAIL_VERIFICATION)
                .filter(candidate -> candidate.isUsable(now))
                .orElseThrow(() -> UnauthorizedException.of(ErrorCode.VERIFICATION_TOKEN_INVALID,
                        "error.verification.token.invalid"));
        User user = userRepository.findById(token.getUserId())
                .orElseThrow(() -> NotFoundException.of(ErrorCode.USER_NOT_FOUND, "error.user.notFound"));
        token.markUsed(now);
        user.markEmailVerified(now);
        return user;
    }
}
