package cr.luparx.geo.model;

import java.util.Locale;

/**
 * Normalisation applied to a document number before it is compared or stored in
 * {@code users.document_number_normalized}. The raw number the person typed is kept as well, so the
 * uniqueness constraint works on a canonical form without losing the original formatting.
 *
 * <p>The strategy per country+type is configuration ({@code identity_document_types.normalizer}),
 * which is why a new country never requires a code change here unless it needs a brand-new rule.</p>
 */
public enum DocumentNormalizer {

    /** Trim, upper-case, drop every character that is not a letter or a digit. */
    UPPER_ALPHANUMERIC {
        @Override
        public String normalize(String raw) {
            return raw == null ? null : raw.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        }
    },

    /** Keep digits only (national ids written as 1-2345-6789). */
    DIGITS_ONLY {
        @Override
        public String normalize(String raw) {
            return raw == null ? null : raw.replaceAll("[^0-9]", "");
        }
    },

    /** Trim and upper-case, preserving inner punctuation (tax ids where the dash is significant). */
    TRIM_UPPER {
        @Override
        public String normalize(String raw) {
            return raw == null ? null : raw.trim().toUpperCase(Locale.ROOT);
        }
    };

    public abstract String normalize(String raw);

    /** Unknown or missing configuration degrades to the safest general rule rather than failing. */
    public static DocumentNormalizer fromName(String name) {
        if (name == null || name.isBlank()) {
            return UPPER_ALPHANUMERIC;
        }
        String normalized = name.trim().toUpperCase(Locale.ROOT);
        for (DocumentNormalizer value : values()) {
            if (value.name().equals(normalized)) {
                return value;
            }
        }
        return UPPER_ALPHANUMERIC;
    }
}
