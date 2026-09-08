package cr.luparx.app.security;

import cr.luparx.core.domain.Portal;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ForbiddenException;
import cr.luparx.identity.service.MfaPolicy;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;

import java.io.IOException;
import java.util.List;

/**
 * Enforces mandatory MFA on the portals a deployment configures as requiring it (CONTRACT.md §3).
 *
 * <p>Which portals those are is not written here: the filter asks {@link MfaPolicy}, built from
 * {@code luparx.security.mfa-enforced-portals}. The default is {@code admin,inspector,platform};
 * only a developer laptop is expected to run with an empty list, and the application warns about it
 * on every start.</p>
 *
 * <p>A token whose {@code mfa} claim is false reaches only the enrolment endpoints — reading one's
 * own profile, starting a TOTP setup, activating it and logging out. Everything else is refused with
 * {@code MFA_REQUIRED}. This is what lets a brand-new administrator enrol without ever holding a
 * usable session that skipped the second factor.</p>
 */
public class MfaEnforcementFilter extends OncePerRequestFilter {

    /** Suffixes (relative to {@code /api/v1/{portal}}) reachable before MFA is satisfied. */
    private static final List<String> ENROLMENT_PATHS = List.of(
            "/me",
            "/me/memberships",
            "/me/mfa/setup",
            "/me/mfa/activate");

    private final HandlerExceptionResolver handlerExceptionResolver;
    private final MfaPolicy mfaPolicy;

    public MfaEnforcementFilter(@Qualifier("handlerExceptionResolver") HandlerExceptionResolver resolver,
                                MfaPolicy mfaPolicy) {
        this.handlerExceptionResolver = resolver;
        this.mfaPolicy = mfaPolicy;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (!(authentication instanceof JwtAuthenticationToken jwtAuthentication)) {
            chain.doFilter(request, response);
            return;
        }
        Jwt jwt = jwtAuthentication.getToken();
        Portal portal = Portal.fromSlug(jwt.getClaimAsString("portal")).orElse(null);
        if (portal == null || !mfaPolicy.isEnforcedFor(portal)) {
            chain.doFilter(request, response);
            return;
        }
        Boolean mfaSatisfied = jwt.getClaim("mfa") instanceof Boolean value ? value : Boolean.FALSE;
        if (Boolean.TRUE.equals(mfaSatisfied) || isEnrolmentPath(portal, request.getRequestURI())) {
            chain.doFilter(request, response);
            return;
        }
        handlerExceptionResolver.resolveException(request, response, null,
                ForbiddenException.of(ErrorCode.MFA_REQUIRED, "error.mfa.required"));
    }

    private boolean isEnrolmentPath(Portal portal, String uri) {
        String base = PortalRoutes.API_PREFIX + "/" + portal.slug();
        for (String suffix : ENROLMENT_PATHS) {
            if ((base + suffix).equals(uri)) {
                return true;
            }
        }
        return false;
    }
}
