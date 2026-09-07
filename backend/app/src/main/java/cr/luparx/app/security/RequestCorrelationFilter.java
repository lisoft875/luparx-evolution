package cr.luparx.app.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * Establishes the correlation id carried by every log line, every Problem Details body and every
 * audit row of a request (docs/ARCHITECTURE.md §6).
 *
 * <p>An inbound {@code X-Request-Id} is honoured (after sanitising it, since it is client-controlled
 * input that ends up in log files) so a trace can be followed from the browser through the API.</p>
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestCorrelationFilter extends OncePerRequestFilter {

    public static final String TRACE_ID = "traceId";
    public static final String REQUEST_ID_HEADER = "X-Request-Id";
    private static final int MAX_TRACE_ID_LENGTH = 64;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String traceId = sanitize(request.getHeader(REQUEST_ID_HEADER));
        if (traceId == null) {
            traceId = UUID.randomUUID().toString();
        }
        MDC.put(TRACE_ID, traceId);
        response.setHeader(REQUEST_ID_HEADER, traceId);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(TRACE_ID);
        }
    }

    /** Keeps only characters that are safe to write into a log file, and bounds the length. */
    private String sanitize(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String cleaned = value.trim().replaceAll("[^A-Za-z0-9._-]", "");
        if (cleaned.isEmpty()) {
            return null;
        }
        return cleaned.length() > MAX_TRACE_ID_LENGTH ? cleaned.substring(0, MAX_TRACE_ID_LENGTH) : cleaned;
    }

    /** Current correlation id, or a placeholder when called outside a request. */
    public static String currentTraceId() {
        String traceId = MDC.get(TRACE_ID);
        return traceId == null ? "-" : traceId;
    }
}
