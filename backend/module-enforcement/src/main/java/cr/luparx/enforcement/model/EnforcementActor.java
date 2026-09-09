package cr.luparx.enforcement.model;

import cr.luparx.core.domain.Portal;
import cr.luparx.core.id.UserId;

import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Who is acting on a citation, as the domain needs to record them — and where they may act.
 *
 * <p>Passed in rather than read from a thread-local: this module has to be callable from a controller,
 * a batch job or (one day) a message consumer, and a service that reaches into the web request
 * context for its actor cannot be. The IP arrives already hashed — the application hashes it with the
 * platform pepper exactly as the audit trail does, so the enforcement history is correlatable with
 * the security trail without either of them storing a raw address.</p>
 *
 * <p>{@code displayName} and {@code allowedZoneIds} arrive the same way and for the same reason.
 * This module knows nothing about people or about memberships: the application resolves the
 * officer's name (copied onto the citation, CONTRACT.md v0.15) and the sectors their post covers,
 * and hands both over. A domain service that went looking for either would be a domain service that
 * depends on identity and tenancy.</p>
 *
 * @param allowedZoneIds the sectors this officer may act in. <b>Empty means unrestricted</b> — the
 *                       whole municipality — and never "nowhere": see {@code MembershipZoneService}.
 */
public record EnforcementActor(UserId userId, Portal portal, String ipHash, String displayName,
                               Set<UUID> allowedZoneIds) {

    public EnforcementActor {
        allowedZoneIds = allowedZoneIds == null ? Set.of() : Set.copyOf(allowedZoneIds);
    }

    /** An actor with no zone restriction and no recorded name — jobs, and every non-issuing path. */
    public static EnforcementActor of(UserId userId, Portal portal, String ipHash) {
        return new EnforcementActor(userId, portal, ipHash, null, Set.of());
    }

    public static EnforcementActor of(UserId userId, Portal portal, String ipHash, String displayName,
                                      List<UUID> allowedZoneIds) {
        return new EnforcementActor(userId, portal, ipHash, displayName,
                allowedZoneIds == null ? Set.of() : Set.copyOf(allowedZoneIds));
    }

    public UUID userIdValue() {
        return userId == null ? null : userId.value();
    }

    /** True when this officer's post covers every sector of the municipality. */
    public boolean isUnrestricted() {
        return allowedZoneIds.isEmpty();
    }

    /**
     * Whether this officer may act in a zone.
     *
     * <p>A null zone answers true: a citation whose bay could not be resolved has no sector to
     * check against, and refusing it here would make an unmapped bay look like a permissions
     * problem. What such a citation is missing is a bay, and that is a separate conversation.</p>
     */
    public boolean mayActIn(UUID zoneId) {
        return isUnrestricted() || zoneId == null || allowedZoneIds.contains(zoneId);
    }
}
