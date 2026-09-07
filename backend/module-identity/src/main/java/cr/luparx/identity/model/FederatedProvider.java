package cr.luparx.identity.model;

import java.util.Locale;
import java.util.Optional;

/** Supported identity providers (CONTRACT.md §3, ADR 0006). */
public enum FederatedProvider {

    GOOGLE("google"),
    MICROSOFT("microsoft"),
    FACEBOOK("facebook");

    private final String slug;

    FederatedProvider(String slug) {
        this.slug = slug;
    }

    public String slug() {
        return slug;
    }

    public static Optional<FederatedProvider> fromSlug(String slug) {
        if (slug == null) {
            return Optional.empty();
        }
        String normalized = slug.trim().toLowerCase(Locale.ROOT);
        for (FederatedProvider provider : values()) {
            if (provider.slug.equals(normalized)) {
                return Optional.of(provider);
            }
        }
        return Optional.empty();
    }
}
