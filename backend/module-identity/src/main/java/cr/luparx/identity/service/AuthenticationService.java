package cr.luparx.identity.service;

import cr.luparx.core.domain.Portal;
import cr.luparx.core.email.EmailAddress;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.UnauthorizedException;
import cr.luparx.core.id.UserId;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.entity.UserCredentials;
import cr.luparx.identity.model.UserStatus;
import cr.luparx.identity.repository.UserCredentialsRepository;
import cr.luparx.identity.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Optional;

/**
 * The password step of a login (CONTRACT.md §3, docs/ARCHITECTURE.md §3).
 *
 * <p>Two properties are load-bearing here:</p>
 * <ul>
 *   <li><b>No account enumeration</b>: an unknown email runs the same Argon2id derivation against a
 *       fixed dummy hash and yields the same {@code INVALID_CREDENTIALS} answer as a wrong password,
 *       so neither the response body nor the response time distinguishes the two.</li>
 *   <li><b>Rate limiting before anything else</b>: the check and the recording both go through the
 *       database-backed limiter, so the protection holds across instances.</li>
 * </ul>
 */
@Service
public class AuthenticationService {

    /**
     * A real Argon2id hash of a random value, computed once at startup. Verifying against it makes
     * the "user not found" path cost the same as the "wrong password" path.
     */
    private final String dummyHash;

    private final UserRepository userRepository;
    private final UserCredentialsRepository credentialsRepository;
    private final PasswordService passwordService;
    private final MfaService mfaService;
    private final LoginRateLimiter rateLimiter;
    private final MfaPolicy mfaPolicy;
    private final Clock clock;

    public AuthenticationService(UserRepository userRepository,
                                 UserCredentialsRepository credentialsRepository,
                                 PasswordService passwordService,
                                 MfaService mfaService,
                                 LoginRateLimiter rateLimiter,
                                 MfaPolicy mfaPolicy,
                                 Clock clock) {
        this.userRepository = userRepository;
        this.credentialsRepository = credentialsRepository;
        this.passwordService = passwordService;
        this.mfaService = mfaService;
        this.rateLimiter = rateLimiter;
        this.mfaPolicy = mfaPolicy;
        this.clock = clock;
        this.dummyHash = passwordService.hash(Hashing.randomToken());
    }

    @Transactional
    public PasswordAuthentication authenticate(String email, String password, Portal portal, String ip) {
        // Normalised before the limiter so the counter, the lookup and the audit trail all agree on
        // one spelling of the address (a copied "  User@Example.com " is the same account).
        String normalizedEmail = EmailAddress.normalizeOrEmpty(email);
        rateLimiter.checkAllowed(normalizedEmail, portal, ip);

        Optional<User> maybeUser = userRepository.findByEmail(normalizedEmail);
        Optional<UserCredentials> credentials = maybeUser
                .flatMap(user -> credentialsRepository.findById(user.getId()));

        String storedHash = credentials.map(UserCredentials::getPasswordHash).orElse(dummyHash);
        boolean passwordMatches = passwordService.matches(password == null ? "" : password, storedHash);

        if (maybeUser.isEmpty() || credentials.isEmpty() || !passwordMatches) {
            rateLimiter.record(normalizedEmail, portal, ip, false);
            throw UnauthorizedException.of(ErrorCode.INVALID_CREDENTIALS, "error.auth.invalidCredentials");
        }

        User user = maybeUser.get();
        if (user.getStatus() == UserStatus.BLOCKED) {
            rateLimiter.record(normalizedEmail, portal, ip, false);
            throw UnauthorizedException.of(ErrorCode.ACCOUNT_BLOCKED, "error.auth.blocked");
        }
        if (user.getStatus() == UserStatus.PENDING_VERIFICATION) {
            rateLimiter.record(normalizedEmail, portal, ip, false);
            throw UnauthorizedException.of(ErrorCode.EMAIL_NOT_VERIFIED, "error.auth.emailNotVerified");
        }

        // Transparent upgrade when the cost parameters were raised since this hash was written.
        if (passwordService.needsRehash(storedHash)) {
            credentials.get().replace(passwordService.hash(password), passwordService.algorithm(), clock.instant());
        }

        rateLimiter.record(normalizedEmail, portal, ip, true);
        // Recorded on the password step rather than after any second factor, because the question
        // it answers is "was this account used", and an attempt that got this far was.
        user.recordLogin(portal.slug(), clock.instant());

        boolean totpActive = mfaService.isActive(UserId.of(user.getId()));
        // The portal side of the decision is configuration (luparx.security.mfa-enforced-portals);
        // the per-user override is data. Neither is a constant in this class.
        boolean mfaMandatory = mfaPolicy.isEnforcedFor(portal) || user.isMfaRequired();
        return new PasswordAuthentication(user, totpActive, mfaMandatory && !totpActive);
    }

    @Transactional(readOnly = true)
    public User requireUser(UserId userId) {
        return userRepository.findById(userId.value())
                .orElseThrow(() -> UnauthorizedException.of(ErrorCode.USER_NOT_FOUND, "error.user.notFound"));
    }
}
