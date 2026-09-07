package cr.luparx.identity.service;

import org.apache.commons.codec.binary.Base32;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.time.Instant;

/**
 * RFC 6238 TOTP, compatible with Google Authenticator, Authy and 1Password: HMAC-SHA1, 30-second
 * steps, 6 digits (ADR 0007).
 *
 * <p>Verification accepts the previous and the next step (±1 window) to tolerate clock drift
 * between the phone and the server; anything wider would materially enlarge the guessing window.
 * Comparison of the generated code is constant-time.</p>
 *
 * <p>This class is pure computation: it never touches the database and never sees the encrypted
 * form of the secret, which makes it directly unit-testable against the RFC 6238 vectors.</p>
 */
public class TotpService {

    public static final int DIGITS = 6;
    public static final int PERIOD_SECONDS = 30;
    private static final String HMAC_ALGORITHM = "HmacSHA1";
    private static final int SECRET_BYTES = 20;
    private static final int[] POWERS_OF_TEN = {1, 10, 100, 1000, 10000, 100000, 1000000, 10000000};

    private final SecureRandom random = new SecureRandom();
    private final Base32 base32 = new Base32();

    /** A fresh 160-bit secret, Base32 encoded without padding (what authenticator apps expect). */
    public String generateSecret() {
        byte[] bytes = new byte[SECRET_BYTES];
        random.nextBytes(bytes);
        return base32.encodeAsString(bytes).replace("=", "");
    }

    /**
     * Builds the {@code otpauth://} URI rendered as a QR code by the client.
     *
     * @param issuer      product/tenant name shown in the authenticator app
     * @param accountName usually the user's email
     */
    public String buildOtpauthUri(String issuer, String accountName, String base32Secret) {
        String encodedIssuer = urlEncode(issuer);
        String encodedAccount = urlEncode(accountName);
        return "otpauth://totp/" + encodedIssuer + ":" + encodedAccount
                + "?secret=" + base32Secret
                + "&issuer=" + encodedIssuer
                + "&algorithm=SHA1"
                + "&digits=" + DIGITS
                + "&period=" + PERIOD_SECONDS;
    }

    /** The code valid at {@code instant} for this secret. */
    public String generateCode(String base32Secret, Instant instant) {
        return generateForCounter(base32Secret, instant.getEpochSecond() / PERIOD_SECONDS);
    }

    /**
     * Verifies a user-supplied code against the current step and its immediate neighbours.
     *
     * @param code the 6-digit code as typed (spaces are tolerated)
     */
    public boolean verify(String base32Secret, String code, Instant now) {
        if (base32Secret == null || code == null) {
            return false;
        }
        String normalized = code.replaceAll("\\s", "");
        if (normalized.length() != DIGITS || !normalized.chars().allMatch(Character::isDigit)) {
            return false;
        }
        long counter = now.getEpochSecond() / PERIOD_SECONDS;
        boolean matched = false;
        for (long offset = -1; offset <= 1; offset++) {
            String candidate = generateForCounter(base32Secret, counter + offset);
            // No early return: comparing every window keeps the response time independent of which
            // window matched.
            matched |= constantTimeEquals(candidate, normalized);
        }
        return matched;
    }

    private String generateForCounter(String base32Secret, long counter) {
        byte[] key = base32.decode(base32Secret.replace(" ", "").toUpperCase(java.util.Locale.ROOT));
        byte[] counterBytes = new byte[8];
        long value = counter;
        for (int index = 7; index >= 0; index--) {
            counterBytes[index] = (byte) (value & 0xFF);
            value >>>= 8;
        }
        byte[] mac;
        try {
            Mac hmac = Mac.getInstance(HMAC_ALGORITHM);
            hmac.init(new SecretKeySpec(key, HMAC_ALGORITHM));
            mac = hmac.doFinal(counterBytes);
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("HMAC-SHA1 is required by the Java platform", exception);
        }
        int offset = mac[mac.length - 1] & 0x0F;
        int binary = ((mac[offset] & 0x7F) << 24)
                | ((mac[offset + 1] & 0xFF) << 16)
                | ((mac[offset + 2] & 0xFF) << 8)
                | (mac[offset + 3] & 0xFF);
        int otp = binary % POWERS_OF_TEN[DIGITS];
        return String.format("%0" + DIGITS + "d", otp);
    }

    private boolean constantTimeEquals(String left, String right) {
        byte[] leftBytes = left.getBytes(StandardCharsets.UTF_8);
        byte[] rightBytes = right.getBytes(StandardCharsets.UTF_8);
        return java.security.MessageDigest.isEqual(leftBytes, rightBytes);
    }

    private String urlEncode(String value) {
        try {
            return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8.name());
        } catch (UnsupportedEncodingException exception) {
            throw new IllegalStateException("UTF-8 is required by the Java platform", exception);
        }
    }
}
