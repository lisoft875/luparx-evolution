package cr.luparx.app.idempotency;

import com.fasterxml.jackson.databind.ObjectMapper;
import cr.luparx.app.security.RequestCorrelationFilter;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ProblemDetails;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.tenant.TenantContext;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.identity.service.Hashing;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingResponseWrapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * {@code Idempotency-Key} handling for sensitive writes (CONTRACT.md §4, ADR 0012).
 *
 * <p>Behaviour for a request on the protected list:</p>
 * <ol>
 *   <li>no key → {@code 400 IDEMPOTENCY_KEY_REQUIRED};</li>
 *   <li>first use → a row is inserted before the handler runs, and the response status and body are
 *       stored on the way out;</li>
 *   <li>replay with the same body → the stored response is returned without touching the domain;</li>
 *   <li>replay with a different body → {@code 409 IDEMPOTENCY_KEY_CONFLICT}, because that is a bug,
 *       not a retry;</li>
 *   <li>replay while the first attempt is still running → {@code 409 IDEMPOTENT_REQUEST_IN_PROGRESS}.</li>
 * </ol>
 *
 * <p>The insert relies on the unique index over {@code scope_hash}: two concurrent replicas racing on
 * the same key resolve it in the database, not in application memory, which is what makes this work
 * with any number of instances.</p>
 *
 * <p>The protected list is explicit rather than "every POST" so that the contract stays exactly what
 * CONTRACT.md §4 describes and clients are never surprised by a new mandatory header.</p>
 */
@Component
@Order(Ordered.LOWEST_PRECEDENCE - 10)
public class IdempotencyFilter extends OncePerRequestFilter {

    public static final String HEADER = "Idempotency-Key";
    private static final Duration RETENTION = Duration.ofHours(24);
    private static final int MAX_CACHED_BODY_BYTES = 64 * 1024;

    /** Writes that create resources or produce irreversible side effects (CONTRACT.md §4). */
    private static final List<String> PROTECTED_POST_PATTERNS = List.of(
            "/api/v1/admin/users",
            "/api/v1/admin/users/*/block",
            "/api/v1/admin/users/*/unblock",
            "/api/v1/admin/users/*/password-reset",
            "/api/v1/admin/memberships",
            "/api/v1/admin/memberships/*/approve",
            "/api/v1/admin/memberships/*/reject",
            "/api/v1/admin/exports",
            "/api/v1/platform/tenants",
            "/api/v1/platform/tenants/*/status",
            "/api/v1/platform/tenants/*/admins",
            "/api/v1/platform/users/*/block",
            "/api/v1/platform/users/*/unblock",
            "/api/v1/platform/users/*/password-reset",
            "/api/v1/platform/memberships");

    private final IdempotencyKeyRepository repository;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final AntPathMatcher pathMatcher = new AntPathMatcher();

    public IdempotencyFilter(IdempotencyKeyRepository repository, ObjectMapper objectMapper, Clock clock) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String key = request.getHeader(HEADER);
        boolean required = isProtected(request);
        if (!required && (key == null || key.isBlank())) {
            chain.doFilter(request, response);
            return;
        }
        if (key == null || key.isBlank()) {
            writeProblem(request, response, 400, ErrorCode.IDEMPOTENCY_KEY_REQUIRED, "Idempotency-Key is required");
            return;
        }
        if (key.length() > 200) {
            writeProblem(request, response, 400, ErrorCode.IDEMPOTENCY_KEY_REQUIRED, "Idempotency-Key is too long");
            return;
        }

        // The body is buffered so it can be hashed here and still be readable by the controller.
        CachedBodyHttpServletRequest cachedRequest = new CachedBodyHttpServletRequest(request);
        String requestHash = Hashing.sha256Hex(new String(cachedRequest.body(), StandardCharsets.UTF_8));

        Optional<TenantContext> context = TenantContextHolder.current();
        UUID userId = context.map(ctx -> ctx.userId().value()).orElse(null);
        UUID tenantId = context.map(TenantContext::tenantId).map(id -> id == null ? null : id.value()).orElse(null);
        String scopeHash = Hashing.sha256Hex(key + "|" + userId + "|" + request.getMethod() + "|"
                + request.getRequestURI());

        Optional<IdempotencyKeyEntity> existing = repository.findByScopeHash(scopeHash);
        if (existing.isPresent()) {
            replay(request, response, existing.get(), requestHash);
            return;
        }

        Instant now = clock.instant();
        IdempotencyKeyEntity record = new IdempotencyKeyEntity(Uuid7.generate(), scopeHash, key, tenantId, userId,
                request.getMethod(), request.getRequestURI(), requestHash, now, now.plus(RETENTION));
        try {
            repository.saveAndFlush(record);
        } catch (DataIntegrityViolationException concurrent) {
            // Another replica won the race on the unique index; treat this as a replay.
            Optional<IdempotencyKeyEntity> winner = repository.findByScopeHash(scopeHash);
            if (winner.isPresent()) {
                replay(request, response, winner.get(), requestHash);
            } else {
                writeProblem(request, response, 409, ErrorCode.IDEMPOTENT_REQUEST_IN_PROGRESS,
                        "A request with this Idempotency-Key is already in progress");
            }
            return;
        }

        ContentCachingResponseWrapper cachedResponse = new ContentCachingResponseWrapper(response);
        chain.doFilter(cachedRequest, cachedResponse);

        byte[] responseBody = cachedResponse.getContentAsByteArray();
        String stored = responseBody.length <= MAX_CACHED_BODY_BYTES
                ? new String(responseBody, StandardCharsets.UTF_8)
                : null;
        if (cachedResponse.getStatus() < 500) {
            record.complete(cachedResponse.getStatus(), stored, clock.instant());
            repository.save(record);
        } else {
            // A server error is not a settled outcome: drop the record so the client may retry.
            repository.delete(record);
        }
        cachedResponse.copyBodyToResponse();
    }

    private void replay(HttpServletRequest request, HttpServletResponse response, IdempotencyKeyEntity record,
                        String requestHash) throws IOException {
        if (!record.getRequestHash().equals(requestHash)) {
            writeProblem(request, response, 409, ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
                    "This Idempotency-Key was already used with a different request body");
            return;
        }
        if (!record.isCompleted()) {
            writeProblem(request, response, 409, ErrorCode.IDEMPOTENT_REQUEST_IN_PROGRESS,
                    "A request with this Idempotency-Key is already in progress");
            return;
        }
        response.setStatus(record.getResponseStatus() == null ? 200 : record.getResponseStatus());
        response.setHeader("Idempotent-Replay", "true");
        if (record.getResponseBody() != null && !record.getResponseBody().isEmpty()) {
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write(record.getResponseBody());
        }
    }

    private boolean isProtected(HttpServletRequest request) {
        if (!"POST".equalsIgnoreCase(request.getMethod())) {
            return false;
        }
        String path = request.getRequestURI();
        for (String pattern : PROTECTED_POST_PATTERNS) {
            if (pathMatcher.match(pattern, path)) {
                return true;
            }
        }
        return false;
    }

    private void writeProblem(HttpServletRequest request, HttpServletResponse response, int status, String code,
                              String detail) throws IOException {
        ProblemDetails problem = new ProblemDetails(
                ProblemDetails.typeFor(code),
                code,
                status,
                detail,
                request.getRequestURI(),
                code,
                RequestCorrelationFilter.currentTraceId(),
                null);
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(response.getOutputStream(), problem);
    }
}
