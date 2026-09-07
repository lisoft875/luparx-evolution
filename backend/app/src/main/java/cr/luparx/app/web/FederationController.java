package cr.luparx.app.web;

import cr.luparx.app.config.FederationProperties;
import cr.luparx.core.domain.Portal;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.NotImplementedException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.identity.model.FederatedProvider;
import cr.luparx.identity.service.TokenService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * OAuth2/OIDC entry points (CONTRACT.md §4, ADR 0006).
 *
 * <p>{@code /start} is fully implemented: it validates the portal and provider, refuses a provider
 * with no configured client, pins the {@code redirect_uri} to this deployment's own callback (never
 * to a caller-supplied URL — that is the classic open-redirect and token-theft vector), and carries
 * the requested return address inside a <b>signed</b> {@code state} so the round-trip stays stateless
 * yet tamper-evident.</p>
 *
 * <p>{@code /callback} is deliberately <b>not implemented</b> in v0.1 and answers
 * {@code 501 NOT_IMPLEMENTED}. The linking rules it will use already exist and are tested
 * ({@code FederatedIdentityService}); what is missing is the provider-specific code exchange and
 * id_token verification, which must not be improvised — a half-verified id_token is an account
 * takeover, not a partial feature. See backend/README.md, "Pending".</p>
 */
@RestController
@RequestMapping("/api/v1/auth/{portal}/oauth2/{provider}")
@Tag(name = "Federation", description = "Google, Microsoft Entra ID and Facebook sign-in.")
public class FederationController {

    private final FederationProperties federationProperties;
    private final TokenService tokenService;
    private final SecureRandom random = new SecureRandom();

    public FederationController(FederationProperties federationProperties, TokenService tokenService) {
        this.federationProperties = federationProperties;
        this.tokenService = tokenService;
    }

    @GetMapping("/start")
    @Operation(summary = "Redirect to the identity provider's authorization endpoint")
    public ResponseEntity<Void> start(@PathVariable String portal,
                                      @PathVariable String provider,
                                      @RequestParam(required = false) String redirectUri) {
        Portal target = PortalPathVariable.require(portal);
        FederatedProvider federatedProvider = FederatedProvider.fromSlug(provider)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.FEDERATION_PROVIDER_UNKNOWN,
                        "error.federation.provider.unknown"));
        FederationProperties.Provider configuration = configuration(federatedProvider);

        String allowedReturn = validateReturnUri(target, redirectUri);
        String nonce = randomNonce();
        String state = tokenService.issueOauthStateToken(target, federatedProvider.slug(), allowedReturn, nonce);

        URI authorization = UriComponentsBuilder.fromUriString(configuration.authorizationUri())
                .queryParam("response_type", "code")
                .queryParam("client_id", configuration.clientId())
                .queryParam("redirect_uri", callbackUri(target, federatedProvider))
                .queryParam("scope", configuration.scopes())
                .queryParam("state", state)
                .queryParam("nonce", nonce)
                // build().encode(): scope values contain spaces, so the URI must be encoded here.
                .build()
                .encode()
                .toUri();
        return ResponseEntity.status(HttpStatus.FOUND).location(authorization).build();
    }

    @GetMapping("/callback")
    @Operation(summary = "Provider callback — reserved, not implemented in v0.1")
    public ResponseEntity<Void> callback(@PathVariable String portal,
                                         @PathVariable String provider,
                                         @RequestParam(required = false) String code,
                                         @RequestParam(required = false) String state) {
        PortalPathVariable.require(portal);
        FederatedProvider.fromSlug(provider)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.FEDERATION_PROVIDER_UNKNOWN,
                        "error.federation.provider.unknown"));
        throw new NotImplementedException("error.notImplemented.federationCallback");
    }

    private FederationProperties.Provider configuration(FederatedProvider provider) {
        FederationProperties.Provider configuration = federationProperties.providers() == null
                ? null
                : federationProperties.providers().get(provider.slug());
        if (configuration == null || !configuration.isConfigured()) {
            throw new ValidationException("provider", ErrorCode.FEDERATION_NOT_CONFIGURED,
                    "error.federation.notConfigured");
        }
        return configuration;
    }

    /** The callback always points back at this deployment, never at anything the caller supplied. */
    private String callbackUri(Portal portal, FederatedProvider provider) {
        return federationProperties.redirectBaseUrl()
                + "/api/v1/auth/" + portal.slug() + "/oauth2/" + provider.slug() + "/callback";
    }

    /**
     * Anti open-redirect: the front-end return address must be one of the portal base URLs this
     * deployment is configured with (SECURITY.md §10 applied to the inbound direction).
     */
    private String validateReturnUri(Portal portal, String redirectUri) {
        if (redirectUri == null || redirectUri.isBlank()) {
            return null;
        }
        String base = federationProperties.redirectBaseUrl();
        if (base != null && redirectUri.startsWith(base)) {
            return redirectUri;
        }
        throw new ValidationException("redirectUri", ErrorCode.VALIDATION_FAILED,
                "error.oauth.redirectUri.notAllowed");
    }

    private String randomNonce() {
        byte[] bytes = new byte[24];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
