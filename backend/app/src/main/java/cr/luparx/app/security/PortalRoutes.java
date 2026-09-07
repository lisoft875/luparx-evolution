package cr.luparx.app.security;

import cr.luparx.core.domain.Portal;

import java.util.Optional;

/**
 * Maps a request path to the portal that owns it. This is the link that lets the resource server
 * reject a token whose {@code aud}/{@code portal} claims do not match the URL being called
 * (CONTRACT.md §3).
 */
public final class PortalRoutes {

    public static final String API_PREFIX = "/api/v1";

    private PortalRoutes() {
    }

    /** Ant pattern of the authenticated routes of a portal, e.g. {@code /api/v1/admin/**}. */
    public static String pattern(Portal portal) {
        return API_PREFIX + "/" + portal.slug() + "/**";
    }

    /** Ant pattern of the (public) authentication routes of a portal. */
    public static String authPattern(Portal portal) {
        return API_PREFIX + "/auth/" + portal.slug() + "/**";
    }

    /** Portal owning an authenticated request path, if any. */
    public static Optional<Portal> fromRequestPath(String path) {
        if (path == null || !path.startsWith(API_PREFIX + "/")) {
            return Optional.empty();
        }
        String remainder = path.substring(API_PREFIX.length() + 1);
        int slash = remainder.indexOf('/');
        String segment = slash < 0 ? remainder : remainder.substring(0, slash);
        return Portal.fromSlug(segment);
    }
}
