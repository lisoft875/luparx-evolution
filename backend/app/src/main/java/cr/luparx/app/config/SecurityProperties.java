package cr.luparx.app.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Security knobs that must differ per environment ({@code luparx.security.*}).
 *
 * @param ipHashPepper         per-deployment secret mixed into IP hashes (SECURITY.md §11)
 * @param mfaEncryptionKey     Base64 32-byte AES key protecting TOTP secrets at rest
 * @param mfaIssuerName        label shown by authenticator apps
 * @param passwordMinLength    minimum password length; the client mirrors it for UX only
 * @param loginWindow          sliding window in which failed logins are counted
 * @param loginMaxPerEmail     failures per account before a temporary lockout
 * @param loginMaxPerIp        failures per client address before throttling
 * @param loginLockout         lockout duration communicated through {@code Retry-After}
 * @param corsAllowedOrigins   allowed browser origin(s) per portal slug — never a shared wildcard
 *                             (SECURITY.md §7)
 */
@ConfigurationProperties(prefix = "luparx.security")
public record SecurityProperties(
        String ipHashPepper,
        String mfaEncryptionKey,
        String mfaIssuerName,
        int passwordMinLength,
        Duration loginWindow,
        int loginMaxPerEmail,
        int loginMaxPerIp,
        Duration loginLockout,
        Map<String, List<String>> corsAllowedOrigins) {
}
