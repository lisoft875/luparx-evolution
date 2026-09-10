package cr.luparx.app.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Security knobs that must differ per environment ({@code luparx.security.*}).
 *
 * @param ipHashPepper         per-deployment secret mixed into IP hashes (SECURITY.md §11)
 * @param passwordMinLength    minimum password length; the client mirrors it for UX only
 * @param loginWindow          sliding window in which failed logins are counted
 * @param loginMaxPerEmail     failures per account before a temporary lockout
 * @param loginMaxPerIp        failures per client address before throttling
 * @param loginLockout         lockout duration communicated through {@code Retry-After}
 * @param directoryLookupWindow      sliding window in which a municipal administrator's directory
 *                                   lookups are counted (CONTRACT.md v0.26)
 * @param directoryLookupMaxPerActor lookups one administrator may run inside that window before
 *                                   being throttled — the endpoint answers about people outside
 *                                   their municipality, so the ceiling is what keeps it a way to
 *                                   confirm one person and not a way to sweep the register
 * @param corsAllowedOrigins   allowed browser origin(s) per portal slug — never a shared wildcard
 *                             (SECURITY.md §7)
 */
@ConfigurationProperties(prefix = "luparx.security")
public record SecurityProperties(
        String ipHashPepper,
        int passwordMinLength,
        Duration loginWindow,
        int loginMaxPerEmail,
        int loginMaxPerIp,
        Duration loginLockout,
        Duration directoryLookupWindow,
        int directoryLookupMaxPerActor,
        Map<String, List<String>> corsAllowedOrigins) {

    private static final Duration DEFAULT_DIRECTORY_LOOKUP_WINDOW = Duration.ofMinutes(10);
    private static final int DEFAULT_DIRECTORY_LOOKUP_MAX = 40;

    /**
     * The window, never null.
     *
     * <p>A deployment that forgets the setting gets the default, not {@code null}: an unconfigured
     * limiter must fail towards the documented ceiling, never towards "no limit" and never towards a
     * crash on a request that should have worked.</p>
     */
    public Duration effectiveDirectoryLookupWindow() {
        return directoryLookupWindow == null ? DEFAULT_DIRECTORY_LOOKUP_WINDOW : directoryLookupWindow;
    }

    /** The ceiling, never zero — a zero read from an unset property would block every lookup. */
    public int effectiveDirectoryLookupMaxPerActor() {
        return directoryLookupMaxPerActor <= 0 ? DEFAULT_DIRECTORY_LOOKUP_MAX : directoryLookupMaxPerActor;
    }
}
