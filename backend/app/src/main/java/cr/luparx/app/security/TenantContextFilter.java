package cr.luparx.app.security;

import cr.luparx.core.domain.Portal;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ForbiddenException;
import cr.luparx.core.error.UnauthorizedException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.tenant.TenantContext;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.model.UserStatus;
import cr.luparx.identity.repository.UserRepository;
import cr.luparx.tenancy.service.AccessGrant;
import cr.luparx.tenancy.service.AccessResolver;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

/**
 * Builds the request-scoped {@link TenantContext} from the verified token, and re-checks server-side
 * everything the token merely asserts.
 *
 * <p>This is the heart of the multi-tenant defence (docs/ARCHITECTURE.md §4). A signed token is not
 * taken at face value:</p>
 * <ol>
 *   <li>the user must still exist and not be blocked;</li>
 *   <li>{@code ver} must match {@code users.credentials_version}, so a token issued before a password
 *       change, a forced reset or a block dies immediately rather than at its natural expiry;</li>
 *   <li>the roles and permissions are <b>re-resolved from the current memberships</b> through
 *       {@link AccessResolver} rather than trusted from the claims — a membership revoked one minute
 *       ago stops granting access on the very next request;</li>
 *   <li>the active tenant comes from the {@code tid} claim and must correspond to a real active
 *       membership for this portal;</li>
 *   <li>a session that ends up with <b>no tenant and no roles</b> is not allowed to wander on into
 *       every endpoint answering {@code ACCESS_DENIED}. See {@link #requireUsableSession}.</li>
 * </ol>
 *
 * <p>The context is always cleared in a {@code finally} block: a pooled request thread must never
 * carry one tenant into the next request.</p>
 */
public class TenantContextFilter extends OncePerRequestFilter {

    public static final String TENANT_ID_MDC = "tenantId";
    public static final String USER_ID_MDC = "userId";
    public static final String PORTAL_MDC = "portal";

    /**
     * Suffixes (relative to {@code /api/v1/{portal}}) that stay reachable without a municipality.
     *
     * <p>They are the endpoints of the <b>person</b>, not of the municipality: reading and editing
     * one's own profile, changing one's password or email address, seeing one's memberships, and
     * choosing a municipality. A name, a phone number and a password belong to the human being and
     * must stay editable whether or not any municipality currently admits them — locking somebody out
     * of their own account because a tenant was closed would be the platform punishing them for an
     * administrative act they had no part in.</p>
     *
     * <p>{@code /me/memberships} and {@code /session/tenant} are here for a related reason: they are
     * how a caller with no usable membership sees what is wrong and gets out of it.</p>
     */
    private static final List<String> ACCOUNT_PATHS = List.of(
            "/me",
            "/me/memberships",
            "/me/password",
            "/me/email",
            "/session/tenant");

    private final AccessResolver accessResolver;
    private final UserRepository userRepository;
    private final HandlerExceptionResolver handlerExceptionResolver;

    public TenantContextFilter(AccessResolver accessResolver,
                               UserRepository userRepository,
                               @Qualifier("handlerExceptionResolver") HandlerExceptionResolver resolver) {
        this.accessResolver = accessResolver;
        this.userRepository = userRepository;
        this.handlerExceptionResolver = resolver;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (!(authentication instanceof JwtAuthenticationToken jwtAuthentication)) {
            chain.doFilter(request, response);
            return;
        }

        try {
            Jwt jwt = jwtAuthentication.getToken();
            Portal portal = Portal.fromSlug(jwt.getClaimAsString("portal"))
                    .orElseThrow(() -> UnauthorizedException.of(ErrorCode.PORTAL_MISMATCH,
                            "error.auth.portalMismatch"));
            Portal routePortal = PortalRoutes.fromRequestPath(request.getRequestURI())
                    .orElseThrow(() -> ForbiddenException.of(ErrorCode.ACCESS_DENIED, "error.access.denied"));
            if (portal != routePortal) {
                throw ForbiddenException.of(ErrorCode.PORTAL_MISMATCH, "error.auth.portalMismatch");
            }

            UserId userId = UserId.parse(jwt.getSubject());
            User user = userRepository.findById(userId.value())
                    .orElseThrow(() -> UnauthorizedException.of(ErrorCode.USER_NOT_FOUND, "error.user.notFound"));
            if (user.getStatus() == UserStatus.BLOCKED) {
                throw UnauthorizedException.of(ErrorCode.ACCOUNT_BLOCKED, "error.auth.blocked");
            }
            Integer tokenVersion = jwt.getClaim("ver") instanceof Number number ? number.intValue() : null;
            if (tokenVersion == null || tokenVersion != user.getCredentialsVersion()) {
                throw UnauthorizedException.of(ErrorCode.UNAUTHENTICATED, "error.auth.credentialsChanged");
            }

            TenantId tenantId = parseTenantId(jwt.getClaimAsString("tid"));
            AccessGrant grant = accessResolver.resolve(userId, portal, tenantId);

            requireUsableSession(grant, userId, portal, request.getRequestURI());

            TenantContext context = new TenantContext(userId, portal, grant.tenantId(), grant.roles(),
                    grant.permissions(), grant.platformScope());
            TenantContextHolder.set(context);
            MDC.put(USER_ID_MDC, userId.toString());
            MDC.put(PORTAL_MDC, portal.slug());
            MDC.put(TENANT_ID_MDC, grant.tenantId() == null ? "-" : grant.tenantId().toString());

            chain.doFilter(request, response);
        } catch (RuntimeException exception) {
            // Filters run outside the @ControllerAdvice, so the exception is routed through the same
            // resolver to produce one consistent application/problem+json body.
            handlerExceptionResolver.resolveException(request, response, null, exception);
        } finally {
            TenantContextHolder.clear();
            MDC.remove(USER_ID_MDC);
            MDC.remove(PORTAL_MDC);
            MDC.remove(TENANT_ID_MDC);
        }
    }

    /**
     * Turns "this session can do nothing" into an answer somebody can act on.
     *
     * <p>A grant with no tenant and no roles used to be waved through, and then every tenant-owned
     * endpoint refused the call at its {@code @PreAuthorize} with a bare {@code ACCESS_DENIED}. That
     * answer is the same one a genuine permission violation produces, so it told the user nothing,
     * told support nothing, and sent whoever was debugging looking for a missing permission that was
     * never the problem. Two very different situations were hiding behind it:</p>
     *
     * <ul>
     *   <li><b>{@code NO_ACTIVE_MEMBERSHIP}</b> — the account belongs to no municipality that is open
     *       to it: every membership was revoked, or the only municipality it had was suspended or
     *       closed. Nothing the caller does with this session will work, and the fix is
     *       administrative: somebody has to grant them access.</li>
     *   <li><b>{@code TENANT_CONTEXT_REQUIRED}</b> — the account belongs to several municipalities and
     *       has not chosen one. Nothing is broken; the caller has to pick, with
     *       {@code POST /session/tenant}.</li>
     * </ul>
     *
     * <p>The check is here rather than at login on purpose. Refusing the login would lock a person out
     * of their own account for an administrative act they had no part in — and CONTRACT.md §1 has a
     * citizen legitimately signing in before belonging to any municipality. So the token is issued,
     * the account endpoints keep working (see {@link #ACCOUNT_PATHS}), and the explicit refusal
     * arrives on the first request that genuinely needs a municipality.</p>
     */
    private void requireUsableSession(AccessGrant grant, UserId userId, Portal portal, String uri) {
        if (grant.tenantId() != null || !grant.roles().isEmpty() || isAccountPath(portal, uri)) {
            return;
        }
        if (accessResolver.hasUsableMembership(userId, portal)) {
            throw ForbiddenException.of(ErrorCode.TENANT_CONTEXT_REQUIRED, "error.tenant.context.required");
        }
        throw ForbiddenException.of(ErrorCode.NO_ACTIVE_MEMBERSHIP, "error.membership.none");
    }

    private boolean isAccountPath(Portal portal, String uri) {
        String base = PortalRoutes.API_PREFIX + "/" + portal.slug();
        for (String suffix : ACCOUNT_PATHS) {
            if ((base + suffix).equals(uri)) {
                return true;
            }
        }
        return false;
    }

    private TenantId parseTenantId(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        return Optional.of(raw)
                .map(value -> {
                    try {
                        return TenantId.parse(value);
                    } catch (IllegalArgumentException exception) {
                        throw UnauthorizedException.of(ErrorCode.UNAUTHENTICATED, "error.auth.tokenInvalid");
                    }
                })
                .orElse(null);
    }
}
