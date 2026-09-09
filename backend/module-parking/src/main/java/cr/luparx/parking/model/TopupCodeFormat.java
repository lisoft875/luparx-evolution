package cr.luparx.parking.model;

import java.security.SecureRandom;
import java.util.Locale;
import java.util.Optional;

/**
 * The shape of the code a citizen dictates at a till to have their wallet credited.
 *
 * <h2>Why not the identity number</h2>
 *
 * <p>The obvious design — "identity number plus municipality" — is dictated out loud in a queue. The
 * person behind hears a national identifier, and anybody who knows somebody else's can probe their
 * account. This code carries no personal data, is derived from none, is scoped to one municipality
 * and can be rotated the moment its owner suspects it was overheard.</p>
 *
 * <h2>The alphabet</h2>
 *
 * <p>Crockford's base 32: the digits plus the letters with <b>I, L, O and U removed</b>. The first
 * three are removed because they are what a person confuses when a code is spoken or handwritten —
 * O with zero, I and L with one — and the fourth because removing it keeps an accidental obscenity
 * out of a randomly generated code. Since O, I and L are not in the alphabet, {@code 0} and {@code 1}
 * have no look-alike left, and reading is forgiving: a cashier who types O gets 0, and I or L gets 1
 * ({@link #normalize}), so a human transcription error becomes the right code instead of a refusal.
 * Case is irrelevant.</p>
 *
 * <h2>The shape</h2>
 *
 * <p>Eight random characters plus one check character, shown grouped as {@code XXX-XXX-XXX}. Eight
 * base-32 characters is 2^40 ≈ 1.1×10^12 possibilities inside one municipality: enumerating them at
 * one attempt a second would take thirty thousand years, and the resolution endpoint is authenticated
 * and rate-limited on top of that. Nine characters is what a person can read off a phone screen and a
 * cashier can key without losing their place; the grouping is display only and is stripped on the way
 * in.</p>
 *
 * <h2>The check character</h2>
 *
 * <p>Luhn mod N over the same alphabet (N = 32). It detects <b>every single mistyped character</b>
 * and every transposition of two adjacent characters except a pair that differs by exactly 16
 * positions in the alphabet — the known and accepted limitation of Luhn with an even base. That is
 * what stops a slip at the till from crediting a stranger: the code fails locally, before any money
 * moves, and the cashier is asked to read it again.</p>
 */
public final class TopupCodeFormat {

    /** Crockford base 32: 0-9 and A-Z without I, L, O and U. */
    private static final char[] ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();

    private static final int BASE = 32;

    /** Random characters, before the check character. */
    public static final int RANDOM_LENGTH = 8;

    /** Total significant characters, check character included. */
    public static final int LENGTH = RANDOM_LENGTH + 1;

    private static final SecureRandom RANDOM = new SecureRandom();

    private TopupCodeFormat() {
    }

    /** A new code: eight cryptographically random characters plus its check character. */
    public static String generate() {
        StringBuilder builder = new StringBuilder(LENGTH);
        for (int index = 0; index < RANDOM_LENGTH; index++) {
            builder.append(ALPHABET[RANDOM.nextInt(BASE)]);
        }
        builder.append(checkCharacter(builder.toString()));
        return builder.toString();
    }

    /**
     * Turns what somebody typed into the canonical code: upper case, separators dropped, and the
     * three habitual confusions folded onto the character that is actually in the alphabet.
     *
     * @return the canonical code, or empty when what was typed cannot be one
     */
    public static Optional<String> normalize(String typed) {
        if (typed == null) {
            return Optional.empty();
        }
        String upper = typed.toUpperCase(Locale.ROOT);
        StringBuilder builder = new StringBuilder(LENGTH);
        for (int index = 0; index < upper.length(); index++) {
            char character = upper.charAt(index);
            if (character == '-' || character == ' ' || character == '.') {
                continue;
            }
            if (character == 'O') {
                character = '0';
            } else if (character == 'I' || character == 'L') {
                character = '1';
            }
            if (valueOf(character) < 0) {
                return Optional.empty();
            }
            builder.append(character);
            if (builder.length() > LENGTH) {
                return Optional.empty();
            }
        }
        return builder.length() == LENGTH ? Optional.of(builder.toString()) : Optional.empty();
    }

    /** True when the check character matches, which is what makes a mistyped code fail at the till. */
    public static boolean isValid(String canonical) {
        if (canonical == null || canonical.length() != LENGTH) {
            return false;
        }
        String body = canonical.substring(0, RANDOM_LENGTH);
        for (int index = 0; index < RANDOM_LENGTH; index++) {
            if (valueOf(body.charAt(index)) < 0) {
                return false;
            }
        }
        return canonical.charAt(RANDOM_LENGTH) == checkCharacter(body);
    }

    /** {@code XXX-XXX-XXX} — grouping is for the eye and the voice, never for storage. */
    public static String display(String canonical) {
        if (canonical == null || canonical.length() != LENGTH) {
            return canonical;
        }
        return canonical.substring(0, 3) + "-" + canonical.substring(3, 6) + "-" + canonical.substring(6);
    }

    /** Luhn mod N (N = 32) over the alphabet above. */
    static char checkCharacter(String body) {
        int factor = 2;
        int sum = 0;
        for (int index = body.length() - 1; index >= 0; index--) {
            int addend = factor * valueOf(body.charAt(index));
            factor = factor == 2 ? 1 : 2;
            addend = (addend / BASE) + (addend % BASE);
            sum += addend;
        }
        int remainder = sum % BASE;
        return ALPHABET[(BASE - remainder) % BASE];
    }

    private static int valueOf(char character) {
        for (int index = 0; index < ALPHABET.length; index++) {
            if (ALPHABET[index] == character) {
                return index;
            }
        }
        return -1;
    }
}
