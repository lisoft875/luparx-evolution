package cr.luparx.app.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ProblemDetails;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;

import java.io.IOException;

/**
 * Renders a missing or invalid bearer token as RFC 9457 instead of Spring's default empty 401, so
 * that a client sees the same body shape for every failure (ADR 0011).
 */
public class ProblemAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private final ObjectMapper objectMapper;

    public ProblemAuthenticationEntryPoint(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                         AuthenticationException authException) throws IOException {
        ProblemDetails problem = new ProblemDetails(
                ProblemDetails.typeFor(ErrorCode.UNAUTHENTICATED),
                "Unauthenticated",
                HttpServletResponse.SC_UNAUTHORIZED,
                null,
                request.getRequestURI(),
                ErrorCode.UNAUTHENTICATED,
                RequestCorrelationFilter.currentTraceId(),
                null);
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(response.getOutputStream(), problem);
    }
}
