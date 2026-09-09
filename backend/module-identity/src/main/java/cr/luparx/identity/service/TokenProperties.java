package cr.luparx.identity.service;

import java.time.Duration;

/**
 * Token lifetimes and issuer identity (CONTRACT.md §3: 15-minute access token, 30-day refresh).
 *
 * @param issuer            {@code iss} claim; also the expected issuer on the resource-server side
 * @param accessTokenTtl    lifetime of the signed access token
 * @param refreshTokenTtl   lifetime of the opaque refresh token; {@link Duration#ZERO} (or anything
 *                          non-positive) means the refresh token never expires (CONTRACT.md v0.3 §2)
 * @param oauthStateTtl     lifetime of the signed OAuth {@code state} value
 */
public record TokenProperties(
        String issuer,
        Duration accessTokenTtl,
        Duration refreshTokenTtl,
        Duration oauthStateTtl) {

    public static TokenProperties defaults(String issuer) {
        return new TokenProperties(issuer, Duration.ofMinutes(15), Duration.ZERO, Duration.ofMinutes(10));
    }

    /**
     * Whether a refresh token is minted without an expiry.
     *
     * <p>This is THE switch behind "the session does not expire" (CONTRACT.md v0.3 §2). It changes
     * nothing else: rotation still happens on every refresh and reuse detection still revokes the
     * whole family. What ends a session stays explicit — logging out, changing the password, and an
     * administrator blocking the account.</p>
     */
    public boolean refreshTokenNeverExpires() {
        return refreshTokenTtl == null || refreshTokenTtl.isZero() || refreshTokenTtl.isNegative();
    }
}
