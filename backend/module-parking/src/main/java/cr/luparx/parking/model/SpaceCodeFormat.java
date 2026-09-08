package cr.luparx.parking.model;

import java.util.Locale;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * The shape of a bay code (CONTRACT.md v0.3, "Formato del código de espacio") as a value object:
 * the parts an administrator edits, the effective regular expression, and the example the app shows
 * as a placeholder.
 *
 * <p><b>Why derive the pattern instead of only storing it.</b> An administrator thinks in "four
 * digits, no prefix", not in {@code ^[0-9]{4}$}. Deriving the expression from the parts is what makes
 * the form usable, and keeping the derived expression in a column is what makes the <em>same</em>
 * rule available to the browser without it having to reimplement the derivation. A municipality with
 * a shape this cannot express writes the expression itself; the parts are then documentation and the
 * pattern is the truth, which is why validation only ever consults the pattern.</p>
 *
 * <p>The generated expressions stay inside the subset Java and JavaScript read identically —
 * anchors, a literal prefix, one character class and one counted repetition — because the same string
 * validates on the server and while the citizen types.</p>
 */
public final class SpaceCodeFormat {

    /** {@code parking_spaces.code} is varchar(16); a code that cannot be stored is not a code. */
    public static final int MAX_CODE_LENGTH = 16;

    /** A prefix is painted on a sign: capitals, digits and hyphens, nothing that needs escaping. */
    private static final Pattern PREFIX_PATTERN = Pattern.compile("^[A-Z0-9-]{0,8}$");

    private SpaceCodeFormat() {
    }

    /**
     * Canonicalises a code as typed by a citizen or an operator: trimmed and upper-cased.
     *
     * <p>Upper-casing is part of the contract of a code, not a convenience: the generated patterns
     * accept {@code [A-Z0-9]}, signs are painted in capitals, and a driver typing {@code a12} on a
     * phone keyboard means the bay marked {@code A12}. Refusing that would be a defect dressed up as
     * strictness.</p>
     */
    public static String normalize(String code) {
        return code == null ? null : code.trim().toUpperCase(Locale.ROOT);
    }

    /** The prefix as it is stored: trimmed, upper-cased, never null. */
    public static String normalizePrefix(String prefix) {
        return prefix == null ? "" : prefix.trim().toUpperCase(Locale.ROOT);
    }

    public static boolean isValidPrefix(String prefix) {
        return PREFIX_PATTERN.matcher(normalizePrefix(prefix)).matches();
    }

    /**
     * The expression a municipality gets when it describes its codes with the form fields.
     *
     * @param prefix       literal prefix, already normalised; may be empty
     * @param digits       how many characters follow the prefix
     * @param allowLetters whether those characters may be letters as well as digits
     */
    public static String derivePattern(String prefix, int digits, boolean allowLetters) {
        String characterClass = allowLetters ? "[A-Z0-9]" : "[0-9]";
        return "^" + normalizePrefix(prefix) + characterClass + "{" + digits + "}$";
    }

    /**
     * A code that matches {@link #derivePattern}: the prefix followed by {@code 0…01}. It is the
     * first bay of a municipality that numbers from one, which is the example a citizen recognises.
     */
    public static String deriveExample(String prefix, int digits) {
        StringBuilder builder = new StringBuilder(normalizePrefix(prefix));
        for (int index = 1; index < digits; index++) {
            builder.append('0');
        }
        builder.append('1');
        return builder.toString();
    }

    /** Compiles a pattern, or empty when it is not a usable regular expression. */
    public static java.util.Optional<Pattern> compile(String pattern) {
        if (pattern == null || pattern.isBlank()) {
            return java.util.Optional.empty();
        }
        try {
            return java.util.Optional.of(Pattern.compile(pattern.trim()));
        } catch (PatternSyntaxException exception) {
            return java.util.Optional.empty();
        }
    }
}
