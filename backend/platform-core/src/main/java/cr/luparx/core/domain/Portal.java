package cr.luparx.core.domain;

import java.util.Locale;
import java.util.Optional;

/**
 * The four login-isolated portals (CONTRACT.md §0). A token minted for one portal is never valid on
 * another: the audience below is the {@code aud} claim the resource server checks against the URL
 * prefix of the incoming request.
 */
public enum Portal {

    CITIZEN("citizen", "luparx:portal:citizen", false, true),
    ADMIN("admin", "luparx:portal:admin", true, true),
    INSPECTOR("inspector", "luparx:portal:inspector", true, true),
    PLATFORM("platform", "luparx:portal:platform", true, false);

    private final String slug;
    private final String audience;
    private final boolean mfaMandatory;
    private final boolean selfRegistrationAllowed;

    Portal(String slug, String audience, boolean mfaMandatory, boolean selfRegistrationAllowed) {
        this.slug = slug;
        this.audience = audience;
        this.mfaMandatory = mfaMandatory;
        this.selfRegistrationAllowed = selfRegistrationAllowed;
    }

    /** Lower-case identifier used in URLs and in the {@code portal} JWT claim. */
    public String slug() {
        return slug;
    }

    /** Value of the JWT {@code aud} claim for this portal. */
    public String audience() {
        return audience;
    }

    /** CONTRACT.md §3: MFA is mandatory for admin, inspector and platform; optional for citizen. */
    public boolean mfaMandatory() {
        return mfaMandatory;
    }

    /** CONTRACT.md §4: {@code POST /auth/platform/register} does not exist. */
    public boolean selfRegistrationAllowed() {
        return selfRegistrationAllowed;
    }

    public static Optional<Portal> fromSlug(String slug) {
        if (slug == null) {
            return Optional.empty();
        }
        String normalized = slug.toLowerCase(Locale.ROOT);
        for (Portal portal : values()) {
            if (portal.slug.equals(normalized)) {
                return Optional.of(portal);
            }
        }
        return Optional.empty();
    }

    public static Optional<Portal> fromAudience(String audience) {
        if (audience == null) {
            return Optional.empty();
        }
        for (Portal portal : values()) {
            if (portal.audience.equals(audience)) {
                return Optional.of(portal);
            }
        }
        return Optional.empty();
    }
}
