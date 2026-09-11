package cr.luparx.identity.service;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import cr.luparx.core.domain.Permission;
import cr.luparx.core.domain.Portal;
import cr.luparx.core.domain.Role;
import cr.luparx.identity.port.JwtKeySource;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.UUID;

/**
 * Issues the signed access tokens of the platform (CONTRACT.md §3, ADR 0005).
 *
 * <p>Every token is RS256 and carries the {@code kid} of the signing key, so keys can be rotated
 * without downtime. Its {@code aud} and {@code portal} claims bind it to exactly one portal: a
 * citizen token presented to {@code /api/v1/admin/**} is rejected by the resource server before any
 * controller runs.</p>
 *
 * <p>This class used to mint a second kind of token, the OAuth {@code state} of the federated
 * sign-in. That whole flow was retired in v0.39 (ADR 0022): the platform issues its own credentials
 * and nothing else, so there is one kind of signed token here and no verification path at all —
 * verifying an access token is the resource server's job, not this one's.</p>
 */
public class TokenService {

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
}
