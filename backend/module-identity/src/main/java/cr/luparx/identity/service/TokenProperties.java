package cr.luparx.identity.service;

import java.time.Duration;

/**
 * Token lifetimes and issuer identity (CONTRACT.md §3: 15-minute access token, 30-day refresh).
 *
 * @param issuer            {@code iss} claim; also the expected issuer on the resource-server side
 * @param accessTokenTtl    lifetime of the signed access token
 * @param refreshTokenTtl   lifetime of the opaque refresh token
 * @param mfaChallengeTtl   lifetime of the short-lived token handed out between password and TOTP
 * @param oauthStateTtl     lifetime of the signed OAuth {@code state} value
 */
public record TokenProperties(
        String issuer,
        Duration accessTokenTtl,
        Duration refreshTokenTtl,
        Duration mfaChallengeTtl,
        Duration oauthStateTtl) {

    public static TokenProperties defaults(String issuer) {
        return new TokenProperties(issuer, Duration.ofMinutes(15), Duration.ofDays(30),
                Duration.ofMinutes(5), Duration.ofMinutes(10));
    }
}
