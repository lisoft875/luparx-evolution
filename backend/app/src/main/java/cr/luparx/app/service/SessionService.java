package cr.luparx.app.service;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.config.SecurityProperties;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.domain.Portal;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.identity.entity.RefreshToken;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.service.Hashing;
import cr.luparx.identity.service.IssuedTokens;
import cr.luparx.identity.service.RefreshTokenService;
import cr.luparx.identity.service.TokenIssueRequest;
import cr.luparx.identity.service.TokenService;
import cr.luparx.tenancy.service.AccessGrant;
import cr.luparx.tenancy.service.AccessResolver;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

/**
 * Composes identity and tenancy into a session.
 *
 * <p>This orchestration lives in the application layer precisely because module-identity must not
 * depend on module-tenancy: the roles and permissions written into a token are resolved here through
 * {@link AccessResolver} and handed to the token issuer as data (docs/ARCHITECTURE.md §5).</p>
 */
@Service
public class SessionService {

    private final TokenService tokenService;
    private final RefreshTokenService refreshTokenService;
    private final AccessResolver accessResolver;
    private final AuditRecorder auditRecorder;
    private final SecurityProperties securityProperties;

    public SessionService(TokenService tokenService,
                          RefreshTokenService refreshTokenService,
                          AccessResolver accessResolver,
                          AuditRecorder auditRecorder,
                          SecurityProperties securityProperties) {
        this.tokenService = tokenService;
        this.refreshTokenService = refreshTokenService;
        this.accessResolver = accessResolver;
        this.auditRecorder = auditRecorder;
        this.securityProperties = securityProperties;
    }

    /**
     * Issues a token pair for a user that has already proved who they are.
     *
     * @param tenantId active municipality, or null to let the resolver pick the only one available
     */
    @Transactional
    public IssuedTokens issue(User user, Portal portal, TenantId tenantId,
                              HttpServletRequest request) {
        TenantId effectiveTenantId = tenantId != null
                ? tenantId
                : accessResolver.defaultTenant(user.userId(), portal).orElse(null);
        AccessGrant grant = accessResolver.resolve(user.userId(), portal, effectiveTenantId);

        String accessToken = tokenService.issueAccessToken(new TokenIssueRequest(
                user.userId(),
                portal,
                grant.tenantId(),
                grant.roles(),
                grant.permissions(),
                user.getLocale(),
                user.getCredentialsVersion()));

        RefreshTokenService.Issued refresh = refreshTokenService.issue(
                user.userId(), portal, grant.tenantId(), userAgent(request), ipHash(request));

        return new IssuedTokens(accessToken, refresh.rawToken(), tokenService.accessTokenTtlSeconds());
    }

    /** Rotates a refresh token and re-issues an access token with freshly resolved authority. */
    @Transactional
    public IssuedTokens refresh(String rawRefreshToken, Portal portal, User user,
                                HttpServletRequest request) {
        RefreshToken current = refreshTokenService.require(rawRefreshToken, portal);
        TenantId tenantId = TenantId.ofNullable(current.getTenantId());
        AccessGrant grant = accessResolver.resolve(user.userId(), portal, tenantId);

        RefreshTokenService.Issued rotated = refreshTokenService.rotate(
                rawRefreshToken, portal, grant.tenantId(), userAgent(request), ipHash(request));

        String accessToken = tokenService.issueAccessToken(new TokenIssueRequest(
                user.userId(),
                portal,
                grant.tenantId(),
                grant.roles(),
                grant.permissions(),
                user.getLocale(),
                user.getCredentialsVersion()));
        return new IssuedTokens(accessToken, rotated.rawToken(), tokenService.accessTokenTtlSeconds());
    }

    /**
     * Switches the active municipality (CONTRACT.md §3): the membership is re-validated, the previous
     * sessions of this portal are revoked so no token keeps the old {@code tid}, and a brand new pair
     * is issued.
     */
    @Transactional
    public IssuedTokens switchTenant(User user, Portal portal, TenantId tenantId,
                                     HttpServletRequest request) {
        AccessGrant grant = accessResolver.resolve(user.userId(), portal, tenantId);
        refreshTokenService.revokeAllForUserAndPortal(user.userId(), portal);

        String accessToken = tokenService.issueAccessToken(new TokenIssueRequest(
                user.userId(),
                portal,
                grant.tenantId(),
                grant.roles(),
                grant.permissions(),
                user.getLocale(),
                user.getCredentialsVersion()));
        RefreshTokenService.Issued refresh = refreshTokenService.issue(
                user.userId(), portal, grant.tenantId(), userAgent(request), ipHash(request));

        auditRecorder.record(AuditAction.SESSION_TENANT_SWITCHED, "session", user.getId().toString(),
                grant.tenantId(), UserId.of(user.getId()), portal,
                Map.of("tenantId", grant.tenantId() == null ? "-" : grant.tenantId().toString()));

        return new IssuedTokens(accessToken, refresh.rawToken(), tokenService.accessTokenTtlSeconds());
    }

    /** Owner of a presented refresh token, validated against the portal it was minted for. */
    @Transactional(readOnly = true)
    public UserId ownerOf(String rawRefreshToken, Portal portal) {
        RefreshToken token = refreshTokenService.require(rawRefreshToken, portal);
        return UserId.of(token.getUserId());
    }

    @Transactional
    public void logout(String rawRefreshToken, Portal portal) {
        refreshTokenService.revoke(rawRefreshToken, portal);
    }

    public String ipHash(HttpServletRequest request) {
        if (request == null) {
            return null;
        }
        return Hashing.ipHash(AuditRecorder.clientIp(request), securityProperties.ipHashPepper());
    }

    public String userAgent(HttpServletRequest request) {
        return request == null ? null : request.getHeader("User-Agent");
    }
}
