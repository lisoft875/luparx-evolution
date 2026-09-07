package cr.luparx.app.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Map;

/**
 * OAuth2/OIDC client configuration per provider ({@code luparx.federation.*}, ADR 0006).
 *
 * <p>A provider with a blank {@code clientId} is treated as not configured: its endpoints answer
 * {@code FEDERATION_NOT_CONFIGURED} instead of redirecting somewhere useless.</p>
 *
 * @param redirectBaseUrl public base URL used to build {@code redirect_uri} values
 * @param providers       keyed by provider slug ({@code google}, {@code microsoft}, {@code facebook})
 */
@ConfigurationProperties(prefix = "luparx.federation")
public record FederationProperties(String redirectBaseUrl, Map<String, Provider> providers) {

    /**
     * @param authorizationUri provider endpoint the user is redirected to
     * @param tokenUri         endpoint used to exchange the authorization code
     * @param userInfoUri      endpoint (or JWKS-backed id_token) used to read the subject and email
     * @param scopes           space-separated scope string
     */
    public record Provider(
            String clientId,
            String clientSecret,
            String authorizationUri,
            String tokenUri,
            String userInfoUri,
            String scopes) {

        public boolean isConfigured() {
            return clientId != null && !clientId.isBlank();
        }
    }
}
