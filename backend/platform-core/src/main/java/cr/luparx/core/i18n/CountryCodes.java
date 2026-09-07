package cr.luparx.core.i18n;

import java.util.Locale;
import java.util.Set;

/** ISO 3166-1 alpha-2 validation helper. */
public final class CountryCodes {

    private static final Set<String> ISO_COUNTRIES = Set.of(Locale.getISOCountries());

    private CountryCodes() {
    }

    public static boolean isValid(String code) {
        return code != null && code.length() == 2 && ISO_COUNTRIES.contains(code.toUpperCase(Locale.ROOT));
    }

    public static String normalize(String code) {
        return code == null ? null : code.trim().toUpperCase(Locale.ROOT);
    }

    /**
     * Unicode regional-indicator flag emoji for a country code. Derived, never stored as an image
     * (CONTRACT.md §2 item 5).
     */
    public static String flagEmoji(String code) {
        String normalized = normalize(code);
        if (!isValid(normalized)) {
            return "";
        }
        int base = 0x1F1E6 - 'A';
        return new String(Character.toChars(base + normalized.charAt(0)))
                + new String(Character.toChars(base + normalized.charAt(1)));
    }
}
