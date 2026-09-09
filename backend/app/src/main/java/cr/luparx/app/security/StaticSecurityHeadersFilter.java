package cr.luparx.app.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Response headers that Spring Security's {@code headers()} DSL does not cover, applied to every
 * response regardless of which filter chain handled it (SECURITY.md §6).
 *
 * <p>The API itself never needs the camera, the microphone or geolocation; the inspector <em>app</em>
 * does, and grants them in its own hosting configuration — a browser policy served by the API would
 * not affect the app's origin anyway.</p>
 *
 * <p>{@code Vary: Authorization} is added to every API response. Almost everything this API returns
 * depends on who asked — the caller's municipality, their wallet, their vehicles — and several reads
 * are deliberately cacheable. A cache that stored one of those without knowing the answer varies by
 * credential would hand one person what we computed for another: a cross-tenant leak produced by an
 * intermediary nobody in this codebase controls. The header is cheap, it is the standard way to say
 * "this depends on who is asking", and it belongs on the responses that carry no {@code
 * Cache-Control} of their own as much as on the ones that do — a shared cache is allowed to store a
 * plain 200 on its own initiative.</p>
 *
 * <p>Cross-Origin-Resource-Policy is {@code cross-origin} and not {@code same-origin}: the four
 * portals are served from their own origins and call this API from the browser, which is the whole
 * point of the CORS configuration. {@code same-origin} makes the browser discard every response
 * that the CORS layer just allowed — the request leaves, the server answers, and {@code fetch}
 * still rejects with a bare "Failed to fetch". What actually protects these responses is CORS plus
 * the bearer token, not CORP.</p>
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class StaticSecurityHeadersFilter extends OncePerRequestFilter {

    /** Everything below this path is an API response whose content depends on the caller. */
    private static final String API_PREFIX = "/api/";

    private static final String PERMISSIONS_POLICY =
            "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), "
                    + "payment=(), usb=()";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        response.setHeader("Permissions-Policy", PERMISSIONS_POLICY);
        response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        if (request.getRequestURI() != null && request.getRequestURI().startsWith(API_PREFIX)) {
            // Added, never set: the CORS layer puts Origin and the request headers in Vary, and
            // replacing that would trade one caching bug for another.
            response.addHeader("Vary", "Authorization");
        }
        chain.doFilter(request, response);
    }
}
