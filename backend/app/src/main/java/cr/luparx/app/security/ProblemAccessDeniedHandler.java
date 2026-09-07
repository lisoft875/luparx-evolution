package cr.luparx.app.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ProblemDetails;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;

import java.io.IOException;

/** Renders an authorization failure as RFC 9457 with the stable {@code ACCESS_DENIED} code. */
public class ProblemAccessDeniedHandler implements AccessDeniedHandler {

    private final ObjectMapper objectMapper;

    public ProblemAccessDeniedHandler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
                       AccessDeniedException accessDeniedException) throws IOException {
        ProblemDetails problem = new ProblemDetails(
                ProblemDetails.typeFor(ErrorCode.ACCESS_DENIED),
                "Access denied",
                HttpServletResponse.SC_FORBIDDEN,
                null,
                request.getRequestURI(),
                ErrorCode.ACCESS_DENIED,
                RequestCorrelationFilter.currentTraceId(),
                null);
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(response.getOutputStream(), problem);
    }
}
