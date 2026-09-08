package cr.luparx.core.email;

import java.util.Locale;

/**
 * Canonical form of an email address, applied at every server-side entry point.
 *
 * <p>An address that reaches the platform is never trusted as typed: browsers, autofill, mobile
 * keyboards and copy/paste routinely add a leading, trailing or even inner space, and a capitalised
 * address is the same mailbox as its lower-case spelling. Normalising in one place — instead of
 * repeating {@code trim().toLowerCase()} at each call site — is what keeps login, registration,
 * password recovery, verification and every administrative lookup agreeing on the same key.</p>
 *
 * <p>The rule is deliberately narrow and lossless for real addresses: whitespace is removed (an
 * unquoted address may not contain any) and the whole string is lower-cased with
 * {@link Locale#ROOT}, never with the default locale — a Turkish locale would otherwise map
 * {@code I} to a dotless i and silently produce a different key on some machines.</p>
 *
 * <p>The database column is {@code citext}, so the comparison is case-insensitive there as well;
 * normalising here keeps the value stored, indexed, hashed and logged consistent rather than relying
 * on the column type alone.</p>
 */
public final class EmailAddress {

    /** Zero-width no-break space: what a copied address from a document or a PDF often carries. */
    private static final char BYTE_ORDER_MARK = '\uFEFF';

    private EmailAddress() {
    }

    /**
     * @param raw the address exactly as it arrived from a client
     * @return the canonical form, or {@code null} when nothing usable remains. Validity is not
     *         checked here: the callers report an invalid address with their own field path.
     */
    public static String normalize(String raw) {
        if (raw == null) {
            return null;
        }
        StringBuilder compacted = new StringBuilder(raw.length());
        for (int index = 0; index < raw.length(); index++) {
            char character = raw.charAt(index);
            // isWhitespace misses NBSP; isSpaceChar misses the control characters. Both are needed.
            if (Character.isWhitespace(character) || Character.isSpaceChar(character)
                    || character == BYTE_ORDER_MARK) {
                continue;
            }
            compacted.append(character);
        }
        if (compacted.length() == 0) {
            return null;
        }
        return compacted.toString().toLowerCase(Locale.ROOT);
    }

    /**
     * Same as {@link #normalize(String)} but never returns {@code null}. Used where an empty string
     * must still flow through a constant-time code path — an authentication attempt must not take a
     * different route (or a different amount of time) just because the address was blank.
     */
    public static String normalizeOrEmpty(String raw) {
        String normalized = normalize(raw);
        return normalized == null ? "" : normalized;
    }
}
