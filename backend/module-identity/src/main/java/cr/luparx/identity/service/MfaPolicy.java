package cr.luparx.identity.service;

import cr.luparx.core.domain.Portal;

import java.util.Collection;
import java.util.EnumSet;
import java.util.Set;

/**
 * Which portals require a second factor (CONTRACT.md §3).
 *
 * <p>The list is configuration ({@code luparx.security.mfa-enforced-portals}), not a constant: a
 * deployment decides it, and a developer laptop is allowed to run with an empty list so a freshly
 * seeded administrator can reach the admin, inspector and platform portals without first enrolling a
 * TOTP. Every environment that is not a laptop keeps the documented default
 * {@code admin,inspector,platform}, and the application logs a WARN at startup while the list is
 * empty.</p>
 *
 * <p>Deliberately framework-free: it is assembled once in the application module from the bound
 * configuration properties and injected wherever the decision is taken — the login flow, the servlet
 * filter that guards the portal routes, and the endpoint that lets a user disable their own TOTP.
 * A per-user override ({@code users.mfa_required}) is applied on top of this by the caller; this
 * type answers the portal question only.</p>
 */
public final class MfaPolicy {

    private final Set<Portal> enforcedPortals;

    public MfaPolicy(Collection<Portal> enforcedPortals) {
        this.enforcedPortals = enforcedPortals == null || enforcedPortals.isEmpty()
                ? EnumSet.noneOf(Portal.class)
                : EnumSet.copyOf(enforcedPortals);
    }

    /** Every portal that declares MFA mandatory in code — the default when nothing is configured. */
    public static MfaPolicy defaults() {
        EnumSet<Portal> mandatory = EnumSet.noneOf(Portal.class);
        for (Portal portal : Portal.values()) {
            if (portal.mfaMandatory()) {
                mandatory.add(portal);
            }
        }
        return new MfaPolicy(mandatory);
    }

    public boolean isEnforcedFor(Portal portal) {
        return portal != null && enforcedPortals.contains(portal);
    }

    public boolean isEnforcedAnywhere() {
        return !enforcedPortals.isEmpty();
    }

    public Set<Portal> enforcedPortals() {
        return Set.copyOf(enforcedPortals);
    }
}
