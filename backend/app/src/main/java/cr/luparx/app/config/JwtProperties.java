package cr.luparx.app.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.List;

/**
 * RS256 signing configuration ({@code luparx.jwt.*}, ADR 0005).
 *
 * <p>Keys are read from the filesystem paths the deployment platform mounts them at, never from the
 * repository (SECURITY.md §5). {@code previousPublicKeyPaths} lets a retired key stay in the JWKS
 * while the tokens it signed expire, which is what makes rotation possible without downtime.</p>
 *
 * @param issuer                 {@code iss} claim and expected issuer on verification
 * @param keyId                  {@code kid} of the active signing key
 * @param privateKeyPath         PEM (PKCS#8) private key of the active key
 * @param publicKeyPath          PEM public key of the active key
 * @param previousPublicKeyPaths retired public keys still accepted, as {@code kid:path} pairs
 * @param accessTokenTtl         lifetime of an access token (contract: 15 minutes)
 * @param refreshTokenTtl        lifetime of a refresh token (contract: 30 days)
 * @param oauthStateTtl          lifetime of the signed OAuth state value
 * @param ephemeralKeysWhenMissing generate a throwaway in-memory key pair when the configured PEM
 *                                 files are absent. Development convenience only: every restart
 *                                 invalidates the tokens signed by the previous key, so it must stay
 *                                 {@code false} anywhere shared.
 */
@ConfigurationProperties(prefix = "luparx.jwt")
public record JwtProperties(
        String issuer,
        String keyId,
        String privateKeyPath,
        String publicKeyPath,
        List<String> previousPublicKeyPaths,
        Duration accessTokenTtl,
        Duration refreshTokenTtl,
        Duration oauthStateTtl,
        boolean ephemeralKeysWhenMissing) {
}
