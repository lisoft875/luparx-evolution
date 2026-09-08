package cr.luparx.tenancy.model;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * The visual identity of a municipality: how to obtain its logo, its brand colour and the short name
 * a top bar can fit.
 *
 * <p>A citizen picks their municipality from a grid of icons after signing in, and the active one
 * sits next to the LupaRX logo. Neither screen can be built from a name alone, and neither may be
 * built from whatever string somebody typed: a colour that is not a colour paints nothing, and a
 * logo address that is not one is a broken image on every screen of the product. So the rules live
 * here, in the domain, and are the same whether the value arrives from the municipal portal, from
 * the platform back-office or from a fixture.</p>
 *
 * <h2>Why the logo is a key, not a URL</h2>
 *
 * <p>Storing an absolute URL in a tenant row makes the row environment-specific: restore the
 * database into staging and every municipality points at production's asset host. It also ages
 * badly — the day an upload endpoint and a CDN land, every stored URL has to be rewritten. A key is
 * resolved at render time instead, so hosting changes without a row moving.</p>
 *
 * <p>Two kinds of key are understood today, and nothing else is accepted:</p>
 * <ul>
 *   <li>{@link #GENERATED_MONOGRAM} — the built-in placeholder, drawn by the platform from the short
 *       name and the brand colour. It is what a municipality has before it provides an emblem;</li>
 *   <li>an absolute {@code https://} address of an emblem the municipality hosts itself, which is
 *       what a real one has right now. Plain {@code http} is refused: a logo loaded over http on an
 *       https page is blocked by the browser as mixed content, so accepting it would only produce a
 *       broken image nobody can explain.</li>
 * </ul>
 *
 * @param logoAssetKey how to obtain the logo, or null when the municipality has none
 * @param brandColor   {@code #rrggbb}, lower case, or null
 * @param shortName    what fits in a top bar, or null to fall back to the display name
 */
public record TenantBranding(String logoAssetKey, String brandColor, String shortName) {

    /** The built-in placeholder: the short name over the brand colour, drawn by the platform. */
    public static final String GENERATED_MONOGRAM = "generated:monogram";

    /** {@code #rrggbb}. Three-digit shorthand is expanded before it gets here; see {@link #normalizeColor}. */
    private static final Pattern COLOR = Pattern.compile("^#[0-9a-f]{6}$");

    /** Absolute, https, and no whitespace. Deliberately not a full URL parser: the CHECK is the same. */
    private static final Pattern HTTPS_URL = Pattern.compile("^https://\\S+$");

    private static final int MAX_LOGO_KEY_LENGTH = 400;
    private static final int MAX_SHORT_NAME_LENGTH = 40;

    /** Nothing configured yet. A perfectly good state for a municipality created five minutes ago. */
    public static TenantBranding none() {
        return new TenantBranding(null, null, null);
    }

    /**
     * Canonicalises a colour: trimmed, lower-cased, and {@code #abc} expanded to {@code #aabbcc}.
     *
     * <p>One spelling only, because two rows holding {@code #FFAA00} and {@code #ffaa00} are the same
     * colour and would still compare unequal — and a client keying a cache by the value would miss.
     * Accepting the three-digit shorthand is not laxity: it is a colour, it is what a designer hands
     * over, and refusing it would only teach people to expand it by hand.</p>
     *
     * @return the canonical form, or null when the input is blank or not a colour
     */
    public static String normalizeColor(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim().toLowerCase(Locale.ROOT);
        if (trimmed.isEmpty()) {
            return null;
        }
        if (trimmed.matches("^#[0-9a-f]{3}$")) {
            StringBuilder expanded = new StringBuilder("#");
            for (int index = 1; index < trimmed.length(); index++) {
                expanded.append(trimmed.charAt(index)).append(trimmed.charAt(index));
            }
            trimmed = expanded.toString();
        }
        return COLOR.matcher(trimmed).matches() ? trimmed : null;
    }

    /** True when the value is a colour this platform will store. Null is <em>not</em> a colour. */
    public static boolean isValidColor(String value) {
        return normalizeColor(value) != null;
    }

    /** Canonicalises a logo key: trimmed, and the reserved placeholder recognised case-insensitively. */
    public static String normalizeLogoKey(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        return GENERATED_MONOGRAM.equalsIgnoreCase(trimmed) ? GENERATED_MONOGRAM : trimmed;
    }

    /** True when the value is a key this platform understands. Null is allowed by the caller, not here. */
    public static boolean isValidLogoKey(String value) {
        String normalized = normalizeLogoKey(value);
        if (normalized == null || normalized.length() > MAX_LOGO_KEY_LENGTH) {
            return false;
        }
        return GENERATED_MONOGRAM.equals(normalized) || HTTPS_URL.matcher(normalized).matches();
    }

    public static String normalizeShortName(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    public static boolean isValidShortName(String value) {
        String normalized = normalizeShortName(value);
        return normalized == null || normalized.length() <= MAX_SHORT_NAME_LENGTH;
    }

    /** True when the logo is the built-in placeholder rather than an emblem the municipality provided. */
    public boolean isGenerated() {
        return GENERATED_MONOGRAM.equals(logoAssetKey);
    }
}
