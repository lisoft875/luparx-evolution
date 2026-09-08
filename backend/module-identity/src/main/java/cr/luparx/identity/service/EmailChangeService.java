package cr.luparx.identity.service;

import cr.luparx.core.email.EmailAddress;
import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.UnauthorizedException;
import cr.luparx.core.error.ValidationException;
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
import java.util.regex.Pattern;

/**
 * Moving an account to a different email address (CONTRACT.md v0.3, "Perfil editable").
 *
 * <p>Not a field of the profile form, and deliberately so: the address is the identity of access.
 * Letting it be replaced by a {@code PUT} would mean that anyone holding a session — a borrowed
 * laptop, a stolen token — could redirect password recovery to a mailbox of their own and take the
 * account with it.</p>
 *
 * <p>So the change is two-legged. {@link #request} stores the new address <em>on the token</em>, not
 * on the user, and returns the plaintext token for delivery <b>to the new address</b>: the person
 * proves they can read the mailbox they are asking to move to. {@link #confirm} is what actually
 * replaces the address, and it revokes every session, because from that moment the account answers
 * to a different identity.</p>
 *
 * <p>Issuing a new request consumes any outstanding one, so a request sent to the wrong address
 * stops working as soon as a correct one is asked for.</p>
 */
@Service
public class EmailChangeService {

    /** Long enough to reach a mailbox and be acted on, short enough that a stale link stops working. */
    private static final Duration TOKEN_TTL = Duration.ofHours(24);

    /** Deliberately permissive, the same expression registration uses: real addresses vary widely. */
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^@\\s]+@[^@\\s.]+(\\.[^@\\s.]+)+$");

    private final UserRepository userRepository;
    private final VerificationTokenRepository tokenRepository;
    private final RefreshTokenService refreshTokenService;
    private final Clock clock;

    public EmailChangeService(UserRepository userRepository,
                              VerificationTokenRepository tokenRepository,
                              RefreshTokenService refreshTokenService,
                              Clock clock) {
        this.userRepository = userRepository;
        this.tokenRepository = tokenRepository;
        this.refreshTokenService = refreshTokenService;
        this.clock = clock;
    }

    /**
     * Starts the change. Nothing about the account moves yet.
     *
     * @return the user, the canonicalised new address and the one-time token that must be sent to
     *         <b>that</b> address and nowhere else
     * @throws ConflictException {@code EMAIL_ALREADY_REGISTERED} when the address already belongs to
     *         an account. Unlike the anonymous password-reset flow there is no enumeration concern
     *         here: the caller is authenticated, and telling them the address is taken is the only
     *         way they can act on it.
     */
    @Transactional
    public Requested request(UserId userId, String newEmail) {
        User user = userRepository.findById(userId.value())
                .orElseThrow(() -> NotFoundException.of(ErrorCode.USER_NOT_FOUND, "error.user.notFound"));
        String email = EmailAddress.normalize(newEmail);
        if (email == null || !EMAIL_PATTERN.matcher(email).matches() || email.length() > 320) {
            throw new ValidationException("newEmail", ErrorCode.VALIDATION_FAILED, "error.user.email.invalid");
        }
        if (email.equals(EmailAddress.normalize(user.getEmail()))) {
            throw new ValidationException("newEmail", ErrorCode.EMAIL_CHANGE_NOT_ALLOWED,
                    "error.user.email.unchanged");
        }
        if (userRepository.existsByEmail(email)) {
            throw ConflictException.of(ErrorCode.EMAIL_ALREADY_REGISTERED, "error.user.email.taken");
        }

        Instant now = clock.instant();
        tokenRepository.consumeOutstanding(userId.value(), VerificationPurpose.EMAIL_CHANGE, now);
        String raw = Hashing.randomToken();
        tokenRepository.save(new VerificationToken(
                Uuid7.generate(),
                userId.value(),
                VerificationPurpose.EMAIL_CHANGE,
                Hashing.sha256Hex(raw),
                now,
                now.plus(TOKEN_TTL),
                email));
        return new Requested(user, email, raw);
    }

    /**
     * Completes the change: the address is replaced, marked verified (the token proved the mailbox
     * is readable) and every session is revoked.
     *
     * <p>The uniqueness check is repeated here on purpose. Between the request and the confirmation
     * somebody else may have registered that address; the unique index would refuse the write with a
     * constraint violation, and answering {@code EMAIL_ALREADY_REGISTERED} is the readable version of
     * the same refusal.</p>
     *
     * @throws UnauthorizedException {@code VERIFICATION_TOKEN_INVALID} when the token is unknown,
     *         expired, already used, or was issued for another purpose
     */
    @Transactional
    public User confirm(String rawToken) {
        Instant now = clock.instant();
        VerificationToken token = tokenRepository.findByTokenHash(Hashing.sha256Hex(rawToken))
                .filter(candidate -> candidate.getPurpose() == VerificationPurpose.EMAIL_CHANGE)
                .filter(candidate -> candidate.isUsable(now))
                .orElseThrow(() -> UnauthorizedException.of(ErrorCode.VERIFICATION_TOKEN_INVALID,
                        "error.verification.token.invalid"));
        User user = userRepository.findById(token.getUserId())
                .orElseThrow(() -> NotFoundException.of(ErrorCode.USER_NOT_FOUND, "error.user.notFound"));

        String email = token.getNewEmail();
        if (email == null) {
            throw UnauthorizedException.of(ErrorCode.VERIFICATION_TOKEN_INVALID,
                    "error.verification.token.invalid");
        }
        if (!email.equals(EmailAddress.normalize(user.getEmail())) && userRepository.existsByEmail(email)) {
            throw ConflictException.of(ErrorCode.EMAIL_ALREADY_REGISTERED, "error.user.email.taken");
        }

        token.markUsed(now);
        user.changeEmail(email, now);
        // The account now answers to a different identity: every token minted for the old one dies.
        user.bumpCredentialsVersion(now);
        refreshTokenService.revokeAllForUser(UserId.of(user.getId()));
        return user;
    }

    /** A started change: who, where to, and the one-time token for that address. */
    public record Requested(User user, String newEmail, String token) {
    }
}
