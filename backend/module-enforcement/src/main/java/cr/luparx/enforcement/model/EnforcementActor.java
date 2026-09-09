package cr.luparx.enforcement.model;

import cr.luparx.core.domain.Portal;
import cr.luparx.core.id.UserId;

/**
 * Who is acting on a citation, as the domain needs to record them.
 *
 * <p>Passed in rather than read from a thread-local: this module has to be callable from a controller,
 * a batch job or (one day) a message consumer, and a service that reaches into the web request
 * context for its actor cannot be. The IP arrives already hashed — the application hashes it with the
 * platform pepper exactly as the audit trail does, so the enforcement history is correlatable with
 * the security trail without either of them storing a raw address.</p>
 */
public record EnforcementActor(UserId userId, Portal portal, String ipHash) {

    public static EnforcementActor of(UserId userId, Portal portal, String ipHash) {
        return new EnforcementActor(userId, portal, ipHash);
    }

    public java.util.UUID userIdValue() {
        return userId == null ? null : userId.value();
    }
}
