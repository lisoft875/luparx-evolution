package cr.luparx.app.security;

import cr.luparx.app.audit.AuditEventRepository;
import cr.luparx.app.config.SecurityProperties;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.TooManyRequestsException;
import cr.luparx.core.id.UserId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/**
 * The ceiling on how often one municipal administrator may look a person up in the platform-wide
 * directory (CONTRACT.md v0.26).
 *
 * <p>The lookup is already an exact match — you cannot find anybody you cannot already name in full
 * — so this is not what stops a stranger being found. It is what stops the endpoint being used as an
 * oracle: fed a list of addresses one at a time, an unlimited exact-match lookup answers "does this
 * person exist on the platform" for every one of them. A ceiling turns that from a script into a job
 * nobody will finish, while leaving the real case — hiring a dozen people in an afternoon — well
 * inside the limit.</p>
 *
 * <p>The counter is <b>the audit trail itself</b>: the same rows that make the lookup accountable are
 * the rows that bound it. That is deliberate. There is no second table to keep in step, the limit
 * cannot silently diverge from the record, and it holds across every backend instance behind the load
 * balancer — an in-memory counter would be bypassed by spreading the requests over replicas
 * (docs/ARCHITECTURE.md §7). The cost is one indexed count per lookup, which is the right price.</p>
 *
 * <p>Counted per person, not per municipality: an administrator who moves between two councils takes
 * their own ceiling with them, and one busy council does not throttle another.</p>
 */
@Service
public class DirectoryLookupRateLimiter {

    private final AuditEventRepository auditEventRepository;
    private final SecurityProperties properties;
    private final Clock clock;

    public DirectoryLookupRateLimiter(AuditEventRepository auditEventRepository,
                                      SecurityProperties properties,
                                      Clock clock) {
        this.auditEventRepository = auditEventRepository;
        this.properties = properties;
        this.clock = clock;
    }

    /**
     * @throws TooManyRequestsException when this administrator has already used up the window's
     *                                  allowance. {@code Retry-After} carries the window, which is
     *                                  the honest answer: the oldest attempt ages out no sooner.
     */
    @Transactional(readOnly = true)
    public void checkAllowed(UserId actor) {
        if (actor == null) {
            // No actor means no request context, which is a scheduled job and not a person browsing.
            return;
        }
        Duration window = properties.effectiveDirectoryLookupWindow();
        Instant since = clock.instant().minus(window);
        long used = auditEventRepository.countByActorUserIdAndActionAndOccurredAtAfter(
                actor.value(), AuditAction.USER_DIRECTORY_LOOKUP, since);
        if (used >= properties.effectiveDirectoryLookupMaxPerActor()) {
            throw new TooManyRequestsException(ErrorCode.RATE_LIMITED, "error.directory.lookup.rateLimited",
                    window);
        }
    }
}
