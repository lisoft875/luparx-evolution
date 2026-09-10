package cr.luparx.app.audit;

import cr.luparx.identity.entity.User;
import cr.luparx.identity.model.UserStatus;
import cr.luparx.identity.service.UserDirectoryService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Puts a name on "quién realizó cada acción" (CONTRACT.md v0.33).
 *
 * <h2>Resolved when read, not copied when written</h2>
 *
 * <p>The trail stores the actor's <b>id</b> and this looks the person up at read time. The obvious
 * alternative — writing the name into the audit row alongside the id, the way a citation copies the
 * offender's name — was considered and rejected, and the reasons are worth keeping because they run
 * opposite to each other:</p>
 *
 * <ul>
 *   <li>A citation is a document that was <em>served on a person</em>: what it said the day it was
 *       handed over is part of the act, so it is copied and frozen. An audit entry is a record of
 *       who did something, and who they are does not change because their name was recorded with a
 *       typo.</li>
 *   <li>The table cannot be updated — that is the whole of v0.32. A name copied into it is a name
 *       that can never be corrected, including a legal name change, and including one written wrong.
 *       The platform would be permanently unable to fix its own record of a person.</li>
 *   <li>It would put a personal identifier in every one of the busiest rows in the system, in the
 *       one table with no deletion path, to save a lookup that costs one indexed query per page.</li>
 *   <li>An official is never deleted when they are deactivated (CONTRACT.md v0.28), so the link
 *       always resolves. That rule is what makes read-time resolution safe here and it is not an
 *       accident: it exists precisely so that history keeps its authors.</li>
 * </ul>
 *
 * <p>The trade-off is honest and one-directional: the screen shows the person's name <em>as it is
 * today</em>, not as it was written on the day. For "who did this", today's name is the right answer
 * — it is how the auditor will find them.</p>
 *
 * <h2>What it deliberately does not return</h2>
 *
 * <p>No document number, no address, no telephone. The question is which official acted, and a name
 * with a portal and a status answers it. Anybody who then needs the person's file opens the staff
 * panel, where reading it is its own audited act rather than a side effect of scrolling a log.</p>
 */
@Service
public class AuditActorResolver {

    private final UserDirectoryService userDirectoryService;

    public AuditActorResolver(UserDirectoryService userDirectoryService) {
        this.userDirectoryService = userDirectoryService;
    }

    /**
     * The people behind one page of entries, in a single query.
     *
     * <p>One query per page and not per row. An audit screen is twenty rows of which a handful are
     * usually the same person, and a resolver that read the user table once per line would be the
     * textbook N+1 on the one screen a municipality opens when it is already suspicious about
     * performance.</p>
     *
     * @return ids that could not be resolved are simply absent; the caller renders what it has
     */
    @Transactional(readOnly = true)
    public Map<UUID, Actor> resolve(Collection<AuditEventEntity> events) {
        Set<UUID> ids = new HashSet<>();
        for (AuditEventEntity event : events) {
            if (event.getActorUserId() != null) {
                ids.add(event.getActorUserId());
            }
        }
        if (ids.isEmpty()) {
            // Every entry on this page was written by a scheduled job or by an anonymous caller.
            return Map.of();
        }
        List<User> people = userDirectoryService.findAllById(ids);
        return people.stream().collect(Collectors.toMap(User::getId, Actor::of, (first, second) -> first));
    }

    /**
     * Who acted, in the two facts a reader needs.
     *
     * @param name   the person's name as it stands today
     * @param active false for a deactivated or blocked account. Shown, not hidden: "this was done by
     *               somebody who no longer has access" is a different fact from "this was done by a
     *               current employee", and it is often the more interesting of the two
     */
    public record Actor(String name, boolean active) {

        static Actor of(User user) {
            return new Actor(user.displayName(), user.getStatus() == UserStatus.ACTIVE);
        }
    }
}
