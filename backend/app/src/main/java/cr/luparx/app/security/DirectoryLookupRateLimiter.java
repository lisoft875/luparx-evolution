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
        checkAllowed(actor, AuditAction.USER_DIRECTORY_LOOKUP, "error.directory.lookup.rateLimited");
    }

    /**
     * The same ceiling applied to any other lookup that answers a yes-or-no about a person
     * (CONTRACT.md v0.33).
     *
     * <p>The second caller is the audit origin probe, which has the same shape as the directory
     * lookup and therefore the same failure mode: harmless once, an enumeration tool if it can be run
     * ten thousand times. Sharing the mechanism rather than copying it means the two cannot drift, and
     * counting each action separately means one does not exhaust the other's allowance — an
     * administrator hiring staff should not be locked out of the trail.</p>
     *
     * @param action     the audited action that counts against the ceiling
     * @param messageKey what the caller is told, so the message names the thing they were doing
     */
    @Transactional(readOnly = true)
    public void checkAllowed(UserId actor, String action, String messageKey) {
        if (actor == null) {
            // No actor means no request context, which is a scheduled job and not a person browsing.
            return;
        }
        Duration window = properties.effectiveDirectoryLookupWindow();
        Instant since = clock.instant().minus(window);
        long used = auditEventRepository.countByActorUserIdAndActionAndOccurredAtAfter(
                actor.value(), action, since);
        if (used >= properties.effectiveDirectoryLookupMaxPerActor()) {
            throw new TooManyRequestsException(ErrorCode.RATE_LIMITED, messageKey, window);
        }
    }
}
