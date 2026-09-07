package cr.luparx.identity.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ValidationException;
import org.bouncycastle.crypto.generators.Argon2BytesGenerator;
import org.bouncycastle.crypto.params.Argon2Parameters;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Locale;

/**
 * Argon2id password hashing (ADR 0005, SECURITY.md §2).
 *
 * <p>Hashes are stored in the standard PHC string format
 * {@code $argon2id$v=19$m=65536,t=3,p=1$<salt>$<hash>}: the cost parameters travel with the hash, so
 * they can be increased over time without invalidating existing passwords.</p>
 *
 * <p>Verification is constant-time and always runs the full derivation, so a failed attempt takes
 * the same time whether or not the user exists (the caller feeds it a dummy hash for unknown
 * accounts).</p>
 */
@Service
public class PasswordService {

    private static final String ALGORITHM = "argon2id";
    private static final int ARGON2_VERSION = Argon2Parameters.ARGON2_VERSION_13;

    private final PasswordProperties properties;
    private final SecureRandom random = new SecureRandom();

    public PasswordService(PasswordProperties properties) {
        this.properties = properties;
    }

    public String algorithm() {
        return ALGORITHM;
    }

    /**
     * @throws ValidationException when the password does not meet the configured policy
     */
    public void validatePolicy(String rawPassword, String fieldPath) {
        if (rawPassword == null || rawPassword.length() < properties.minLength()) {
            throw new ValidationException(fieldPath, ErrorCode.PASSWORD_TOO_WEAK, "error.password.tooShort");
        }
        if (rawPassword.chars().distinct().count() < 4) {
            throw new ValidationException(fieldPath, ErrorCode.PASSWORD_TOO_WEAK, "error.password.tooSimple");
        }
    }

    public String hash(String rawPassword) {
        byte[] salt = new byte[properties.saltLength()];
        random.nextBytes(salt);
        byte[] hash = derive(rawPassword, salt, properties.memoryKib(), properties.iterations(),
                properties.parallelism(), properties.hashLength());
        Base64.Encoder encoder = Base64.getEncoder().withoutPadding();
        return "$" + ALGORITHM
                + "$v=" + ARGON2_VERSION
                + "$m=" + properties.memoryKib() + ",t=" + properties.iterations()
                + ",p=" + properties.parallelism()
                + "$" + encoder.encodeToString(salt)
                + "$" + encoder.encodeToString(hash);
    }

    /** Constant-time verification. Returns false (never throws) for a malformed stored hash. */
    public boolean matches(String rawPassword, String encodedHash) {
        if (rawPassword == null || encodedHash == null) {
            return false;
        }
        String[] parts = encodedHash.split("\\$");
        // ["", "argon2id", "v=19", "m=..,t=..,p=..", salt, hash]
        if (parts.length != 6 || !ALGORITHM.equals(parts[1])) {
            return false;
        }
        try {
            int memoryKib = 0;
            int iterations = 0;
            int parallelism = 0;
            for (String parameter : parts[3].split(",")) {
                String[] pair = parameter.split("=", 2);
                if (pair.length != 2) {
                    return false;
                }
                switch (pair[0].trim().toLowerCase(Locale.ROOT)) {
                    case "m" -> memoryKib = Integer.parseInt(pair[1]);
                    case "t" -> iterations = Integer.parseInt(pair[1]);
                    case "p" -> parallelism = Integer.parseInt(pair[1]);
                    default -> {
                        // Unknown parameter: ignore rather than fail, forward compatibility.
                    }
                }
            }
            if (memoryKib <= 0 || iterations <= 0 || parallelism <= 0) {
                return false;
            }
            Base64.Decoder decoder = Base64.getDecoder();
            byte[] salt = decoder.decode(parts[4]);
            byte[] expected = decoder.decode(parts[5]);
            byte[] actual = derive(rawPassword, salt, memoryKib, iterations, parallelism, expected.length);
            return MessageDigest.isEqual(expected, actual);
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    /** True when a stored hash uses weaker parameters than the current policy and should be upgraded. */
    public boolean needsRehash(String encodedHash) {
        if (encodedHash == null) {
            return true;
        }
        return !encodedHash.contains("m=" + properties.memoryKib() + ",t=" + properties.iterations()
                + ",p=" + properties.parallelism());
    }

    private byte[] derive(String rawPassword, byte[] salt, int memoryKib, int iterations, int parallelism,
                          int length) {
        Argon2Parameters parameters = new Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
                .withVersion(ARGON2_VERSION)
                .withMemoryAsKB(memoryKib)
                .withIterations(iterations)
                .withParallelism(parallelism)
                .withSalt(salt)
                .build();
        Argon2BytesGenerator generator = new Argon2BytesGenerator();
        generator.init(parameters);
        byte[] output = new byte[length];
        generator.generateBytes(rawPassword.getBytes(StandardCharsets.UTF_8), output);
        return output;
    }
}
