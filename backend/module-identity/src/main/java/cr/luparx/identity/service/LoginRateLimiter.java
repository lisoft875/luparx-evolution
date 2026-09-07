package cr.luparx.identity.service;

import cr.luparx.core.domain.Portal;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.TooManyRequestsException;
import cr.luparx.core.id.Uuid7;
import cr.luparx.identity.entity.AuthAttempt;
import cr.luparx.identity.repository.AuthAttemptRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;

/**
 * Brute-force and credential-stuffing protection backed by the {@code auth_attempts} table
 * (SECURITY.md §2).
 *
 * <p>State lives in PostgreSQL rather than in memory precisely so the limit holds across every
 * backend instance behind the load balancer — an in-memory counter would be trivially bypassed by
 * spreading attempts over replicas (docs/ARCHITECTURE.md §7).</p>
 */
@Service
public class LoginRateLimiter {

    private final AuthAttemptRepository attemptRepository;
    private final RateLimitProperties properties;
    private final Clock clock;

    public LoginRateLimiter(AuthAttemptRepository attemptRepository, RateLimitProperties properties, Clock clock) {
        this.attemptRepository = attemptRepository;
        this.properties = properties;
        this.clock = clock;
    }

    /**
     * @throws TooManyRequestsException when the account or the client address is currently locked
     */
    @Transactional(readOnly = true)
    public void checkAllowed(String email, Portal portal, String ip) {
        Instant since = clock.instant().minus(properties.window());
        String emailHash = Hashing.emailHash(email);
        String ipHash = Hashing.ipHash(ip, properties.ipHashPepper());

        long byEmail = attemptRepository
                .countByEmailHashAndPortalAndSuccessFalseAndOccurredAtAfter(emailHash, portal, since);
        if (byEmail >= properties.maxFailuresPerEmail()) {
            throw new TooManyRequestsException(ErrorCode.RATE_LIMITED, "error.auth.rateLimited",
                    properties.lockout());
        }
        long byIp = attemptRepository
                .countByIpHashAndPortalAndSuccessFalseAndOccurredAtAfter(ipHash, portal, since);
        if (byIp >= properties.maxFailuresPerIp()) {
            throw new TooManyRequestsException(ErrorCode.RATE_LIMITED, "error.auth.rateLimited",
                    properties.lockout());
        }
    }

    /**
     * Records the outcome. Runs in its own transaction so a failed login still leaves its trace when
     * the surrounding transaction is rolled back by the thrown authentication error.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String email, Portal portal, String ip, boolean success) {
        attemptRepository.save(new AuthAttempt(
                Uuid7.generate(),
                Hashing.emailHash(email),
                portal,
                Hashing.ipHash(ip, properties.ipHashPepper()),
                success,
                clock.instant()));
    }

    public String hashIp(String ip) {
        return Hashing.ipHash(ip, properties.ipHashPepper());
    }
}
