package cr.luparx.identity.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;

/**
 * Hashing helpers for values that must be looked up but never stored in the clear: opaque tokens,
 * email addresses used as rate-limit keys and client IPs (SECURITY.md §11).
 *
 * <p>SHA-256 is deliberate here and not a password hash: these inputs are high-entropy (tokens) or
 * only need pseudonymisation for abuse detection (email/IP), and the lookup has to be a single
 * indexed equality comparison.</p>
 */
public final class Hashing {

    private static final SecureRandom RANDOM = new SecureRandom();

    private Hashing() {
    }

    public static String sha256Hex(String value) {
        if (value == null) {
            return null;
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(bytes);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required by the Java platform", exception);
        }
    }

    /** Pseudonymises an email for {@code auth_attempts}: lower-cased, then hashed. */
    public static String emailHash(String email) {
        return email == null ? null : sha256Hex(email.trim().toLowerCase(Locale.ROOT));
    }

    /**
     * Pseudonymises a client IP. A per-deployment pepper is mixed in so the hashes cannot be
     * reversed with a rainbow table of the (tiny) IPv4 space.
     */
    public static String ipHash(String ip, String pepper) {
        if (ip == null || ip.isBlank()) {
            return sha256Hex("unknown" + (pepper == null ? "" : pepper));
        }
        return sha256Hex(ip.trim() + "|" + (pepper == null ? "" : pepper));
    }

    /** 256 bits of entropy, URL-safe: used for refresh tokens and verification tokens. */
    public static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
