package cr.luparx.identity.service;

import java.time.Duration;

/**
 * Login throttling configuration (SECURITY.md §2).
 *
 * @param window            sliding window in which failures are counted
 * @param maxFailuresPerEmail failures for one account before it is temporarily locked
 * @param maxFailuresPerIp  failures from one client address before it is throttled, higher than the
 *                          per-account limit so that a shared NAT does not lock out a whole office
 * @param lockout           how long a caller must wait once a limit is hit
 * @param ipHashPepper      per-deployment secret mixed into IP hashes so they cannot be reversed
 */
public record RateLimitProperties(
        Duration window,
        int maxFailuresPerEmail,
        int maxFailuresPerIp,
        Duration lockout,
        String ipHashPepper) {

    public static RateLimitProperties defaults(String ipHashPepper) {
        return new RateLimitProperties(Duration.ofMinutes(15), 5, 50, Duration.ofMinutes(15), ipHashPepper);
    }
}
