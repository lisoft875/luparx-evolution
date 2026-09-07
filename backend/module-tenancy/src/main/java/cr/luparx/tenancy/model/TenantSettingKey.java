package cr.luparx.tenancy.model;

import java.util.Locale;
import java.util.Optional;

/**
 * Declared tenant settings. Keeping the keys in an enum (instead of accepting arbitrary strings)
 * means a typo is a 422 rather than a silently ignored configuration, and it documents the shape
 * every consumer can expect inside the JSON value under the {@code value} member.
 */
public enum TenantSettingKey {

    /** {@code {"value": true|false}} — whether citizens may self-register without choosing a tenant. */
    CITIZEN_SELF_REGISTRATION_ENABLED,
    /** {@code {"value": 18}} — minimum age accepted at registration; overrides the platform default. */
    MINIMUM_REGISTRATION_AGE,
    /** {@code {"value": "https://..."}} — public support URL shown in the portals. */
    SUPPORT_URL,
    /** {@code {"value": "v1"}} — terms version users of this tenant must accept. */
    TERMS_VERSION,
    /** {@code {"value": ["es-CR","en-US"]}} — locales offered by this tenant's portals. */
    SUPPORTED_LOCALES;

    public static Optional<TenantSettingKey> fromName(String name) {
        if (name == null) {
            return Optional.empty();
        }
        String normalized = name.trim().toUpperCase(Locale.ROOT);
        for (TenantSettingKey key : values()) {
            if (key.name().equals(normalized)) {
                return Optional.of(key);
            }
        }
        return Optional.empty();
    }
}
