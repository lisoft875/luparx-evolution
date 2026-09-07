package cr.luparx.core.i18n;

import java.util.Locale;
import java.util.Optional;

/**
 * BCP 47 language-tag helpers (ADR 0008). No locale is hardcoded anywhere in the domain: the value
 * always comes from the user, the tenant or the configured platform default, in that order.
 */
public final class Locales {

    private Locales() {
    }

    /**
     * Parses a BCP 47 tag such as {@code es-CR}. Returns empty for null, blank or malformed tags
     * instead of silently falling back, so the caller decides which default applies.
     */
    public static Optional<Locale> parse(String languageTag) {
        if (languageTag == null || languageTag.isBlank()) {
            return Optional.empty();
        }
        Locale locale = Locale.forLanguageTag(languageTag.trim());
        if (locale.getLanguage().isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(locale);
    }

    /** Deterministic resolution order: explicit value, then tenant default, then platform default. */
    public static Locale resolve(String preferred, String tenantDefault, String platformDefault) {
        return parse(preferred)
                .or(() -> parse(tenantDefault))
                .or(() -> parse(platformDefault))
                .orElse(Locale.ROOT);
    }

    public static String toTag(Locale locale) {
        return locale == null ? null : locale.toLanguageTag();
    }

    public static boolean isValid(String languageTag) {
        return parse(languageTag).isPresent();
    }
}
