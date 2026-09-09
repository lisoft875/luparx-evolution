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
    ADMIN("admin", "luparx:portal:admin", true, false),
    INSPECTOR("inspector", "luparx:portal:inspector", true, false),
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

    /**
     * Whether anyone may open an account on this portal by themselves. Only the citizen portal may
     * (CONTRACT.md v0.13).
     *
     * <p>An account that can fine you, close your session or move money out of a municipality's
     * books is not a thing to hand out to whoever fills in a form. Since v0.13 those three portals
     * answer {@code SELF_REGISTRATION_DISABLED} and their memberships are granted from the platform
     * back-office instead — which is the one place that already knows which municipality the person
     * belongs to and who authorised them.</p>
     *
     * <p>What the earlier arrangement actually did is worth recording, because it looked safe and
     * was not: anybody could register on the admin portal against any municipality, and whether they
     * landed ACTIVE or PENDING_APPROVAL depended on a per-tenant setting whose default nobody
     * reviews on the day a municipality is created.</p>
     */
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
