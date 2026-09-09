package cr.luparx.identity.service;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import cr.luparx.core.domain.Permission;
import cr.luparx.core.domain.Portal;
import cr.luparx.core.domain.Role;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.UnauthorizedException;
import cr.luparx.core.id.UserId;
import cr.luparx.identity.port.JwtKeySource;

import java.text.ParseException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Issues and verifies the signed tokens of the platform (CONTRACT.md §3, ADR 0005).
 *
 * <p>Three kinds of signed token are produced, all RS256 and all carrying the {@code kid} of the
 * signing key so that keys can be rotated without downtime:</p>
 * <ul>
 *   <li>the <b>access token</b>, whose {@code aud} and {@code portal} claims bind it to exactly one
 *       portal — a citizen token presented to {@code /api/v1/admin/**} is rejected by the resource
 *       server before any controller runs;</li>
 *   <li>the <b>OAuth state token</b>, which keeps the federation round-trip stateless while still
 *       being tamper-evident.</li>
 * </ul>
 */
public class TokenService {

    private static final String PURPOSE_CLAIM = "purpose";
    private static final String PURPOSE_OAUTH_STATE = "oauth_state";

    private final JwtKeySource keySource;
    private final TokenProperties properties;
    private final Clock clock;

    public TokenService(JwtKeySource keySource, TokenProperties properties, Clock clock) {
        this.keySource = keySource;
        this.properties = properties;
        this.clock = clock;
    }

    public TokenProperties properties() {
        return properties;
    }

    /** Signed access token with the claim set of CONTRACT.md §3. */
    public String issueAccessToken(TokenIssueRequest request) {
        Instant now = clock.instant();
        Instant expiry = now.plus(properties.accessTokenTtl());

        List<String> roles = new ArrayList<>();
        for (Role role : request.roles()) {
            roles.add(role.name());
        }
        List<String> permissions = new ArrayList<>();
        for (Permission permission : request.permissions()) {
            permissions.add(permission.name());
        }

        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .issuer(properties.issuer())
                .subject(request.userId().toString())
                .audience(request.portal().audience())
                .issueTime(Date.from(now))
                .expirationTime(Date.from(expiry))
                .jwtID(UUID.randomUUID().toString())
                .claim("portal", request.portal().slug())
                .claim("tid", request.tenantId() == null ? null : request.tenantId().toString())
                .claim("roles", roles)
                .claim("perms", permissions)
                .claim("locale", request.locale())
                .claim("ver", request.credentialsVersion())
                .build();
        return sign(claims);
    }

    public long accessTokenTtlSeconds() {
        return properties.accessTokenTtl().toSeconds();
    }

    /** Tamper-evident OAuth {@code state}: keeps the federation round-trip stateless. */
    public String issueOauthStateToken(Portal portal, String provider, String redirectUri, String nonce) {
        Instant now = clock.instant();
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .issuer(properties.issuer())
                .audience(portal.audience())
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plus(properties.oauthStateTtl())))
                .jwtID(UUID.randomUUID().toString())
                .claim(PURPOSE_CLAIM, PURPOSE_OAUTH_STATE)
                .claim("portal", portal.slug())
                .claim("provider", provider)
                .claim("redirectUri", redirectUri)
                .claim("nonce", nonce)
                .build();
        return sign(claims);
    }

    public Map<String, Object> verifyOauthStateToken(String state, Portal portal) {
        JWTClaimsSet claims = verify(state, ErrorCode.UNAUTHENTICATED, "error.oauth.state.invalid");
        requirePurpose(claims, PURPOSE_OAUTH_STATE, ErrorCode.UNAUTHENTICATED, "error.oauth.state.invalid");
        requireAudience(claims, portal, ErrorCode.UNAUTHENTICATED, "error.oauth.state.invalid");
        return claims.getClaims();
    }

    // --- internals -------------------------------------------------------------------------------

    private String sign(JWTClaimsSet claims) {
        RSAKey key = keySource.activeKey();
        JWSHeader header = new JWSHeader.Builder(JWSAlgorithm.RS256)
                .keyID(key.getKeyID())
                .type(JOSEObjectType.JWT)
                .build();
        SignedJWT jwt = new SignedJWT(header, claims);
        try {
            jwt.sign(new RSASSASigner(key));
        } catch (JOSEException exception) {
            throw new IllegalStateException("unable to sign token", exception);
        }
        return jwt.serialize();
    }

    /**
     * Verifies signature and expiry against every published key, so a token signed with the previous
     * key keeps working during a rotation window.
     */
    private JWTClaimsSet verify(String token, String errorCode, String messageKey) {
        if (token == null || token.isBlank()) {
            throw UnauthorizedException.of(errorCode, messageKey);
        }
        SignedJWT jwt;
        try {
            jwt = SignedJWT.parse(token);
        } catch (ParseException exception) {
            throw UnauthorizedException.of(errorCode, messageKey);
        }
        if (!JWSAlgorithm.RS256.equals(jwt.getHeader().getAlgorithm())) {
            // Explicitly refuse anything but RS256, including `none` (SECURITY.md §2).
            throw UnauthorizedException.of(errorCode, messageKey);
        }
        boolean verified = false;
        for (JWK jwk : keySource.publicJwkSet().getKeys()) {
            if (!(jwk instanceof RSAKey rsaKey)) {
                continue;
            }
            try {
                if (jwt.verify(new RSASSAVerifier(rsaKey))) {
                    verified = true;
                    break;
                }
            } catch (JOSEException exception) {
                // Try the next key; a mismatch here is not an error by itself.
            }
        }
        if (!verified) {
            throw UnauthorizedException.of(errorCode, messageKey);
        }
        JWTClaimsSet claims;
        try {
            claims = jwt.getJWTClaimsSet();
        } catch (ParseException exception) {
            throw UnauthorizedException.of(errorCode, messageKey);
        }
        Date expiration = claims.getExpirationTime();
        if (expiration == null || !clock.instant().isBefore(expiration.toInstant())) {
            throw UnauthorizedException.of(errorCode, messageKey);
        }
        if (!properties.issuer().equals(claims.getIssuer())) {
            throw UnauthorizedException.of(errorCode, messageKey);
        }
        return claims;
    }

    private void requirePurpose(JWTClaimsSet claims, String expected, String errorCode, String messageKey) {
        Object purpose = claims.getClaim(PURPOSE_CLAIM);
        if (!expected.equals(purpose)) {
            throw UnauthorizedException.of(errorCode, messageKey);
        }
    }

    private void requireAudience(JWTClaimsSet claims, Portal portal, String errorCode, String messageKey) {
        List<String> audience = claims.getAudience();
        if (audience == null || !audience.contains(portal.audience())) {
            throw UnauthorizedException.of(errorCode, messageKey);
        }
    }
}
