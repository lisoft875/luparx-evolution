package cr.luparx.app.security;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import cr.luparx.core.domain.Portal;
import cr.luparx.identity.port.JwtKeySource;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * One {@link JwtDecoder} per portal.
 *
 * <p>Each decoder accepts only RS256, verifies against every published key (so rotation is
 * transparent), and then applies the validators that make portal isolation real: the token's
 * {@code aud} must be this portal's audience <em>and</em> its {@code portal} claim must match. A
 * citizen token presented to {@code /api/v1/admin/**} therefore fails at the resource server, before
 * any controller or authorization rule runs (SECURITY.md §2).</p>
 */
public class PortalJwtDecoders {

    private final Map<Portal, JwtDecoder> decoders = new EnumMap<>(Portal.class);

    public PortalJwtDecoders(JwtKeySource keySource, String issuer) {
        JWKSource<SecurityContext> jwkSource = new ImmutableJWKSet<>(keySource.publicJwkSet());
        for (Portal portal : Portal.values()) {
            decoders.put(portal, build(jwkSource, issuer, portal));
        }
    }

    public JwtDecoder forPortal(Portal portal) {
        return decoders.get(portal);
    }

    private JwtDecoder build(JWKSource<SecurityContext> jwkSource, String issuer, Portal portal) {
        DefaultJWTProcessor<SecurityContext> processor = new DefaultJWTProcessor<>();
        processor.setJWSKeySelector(new JWSVerificationKeySelector<>(JWSAlgorithm.RS256, jwkSource));
        // Claim checking is delegated to the Spring validators below, which produce the error format
        // the rest of the application already knows how to render.
        processor.setJWTClaimsSetVerifier((claims, context) -> {
        });

        NimbusJwtDecoder decoder = new NimbusJwtDecoder(processor);
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                new JwtTimestampValidator(),
                new JwtIssuerValidator(issuer),
                new JwtClaimValidator<List<String>>("aud",
                        audience -> audience != null && audience.contains(portal.audience())),
                new JwtClaimValidator<String>("portal", portal.slug()::equals)));
        return decoder;
    }
}
