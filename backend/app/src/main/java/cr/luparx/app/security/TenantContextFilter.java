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
 *       membership for this portal.</li>
 * </ol>
 *
 * <p>The context is always cleared in a {@code finally} block: a pooled request thread must never
 * carry one tenant into the next request.</p>
 */
public class TenantContextFilter extends OncePerRequestFilter {

    public static final String TENANT_ID_MDC = "tenantId";
    public static final String USER_ID_MDC = "userId";
    public static final String PORTAL_MDC = "portal";

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
