package cr.luparx.app.web;

import cr.luparx.app.security.RequestCorrelationFilter;
import cr.luparx.core.error.DomainException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ProblemDetails;
import cr.luparx.core.error.ProblemFieldError;
import cr.luparx.core.error.TooManyRequestsException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.ArrayList;
import java.util.List;

/**
 * Single place where every failure becomes an RFC 9457 {@code application/problem+json} body
 * (CONTRACT.md §4, ADR 0011).
 *
 * <p>Two rules are enforced here and nowhere else:</p>
 * <ul>
 *   <li>the {@code code} member is always a stable {@link ErrorCode} constant — clients branch on it
 *       and map it to their own translations;</li>
 *   <li>user-visible text is resolved from the message bundle in the caller's locale; the domain only
 *       ever carries i18n keys (CONTRACT.md §7).</li>
 * </ul>
 *
 * <p>Unexpected exceptions are logged with the trace id and answered with a generic body: an internal
 * message could disclose schema details or another tenant's data.</p>
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private final MessageSource messageSource;

    public GlobalExceptionHandler(MessageSource messageSource) {
        this.messageSource = messageSource;
    }

    @ExceptionHandler(DomainException.class)
    public ResponseEntity<ProblemDetails> handleDomain(DomainException exception, HttpServletRequest request) {
        List<ProblemFieldError> fieldErrors = exception.fieldErrors().isEmpty()
                ? null
                : localize(exception.fieldErrors());
        ProblemDetails problem = problem(
                exception.httpStatus(),
                exception.code(),
                message(exception.messageKey(), exception.messageArguments().toArray()),
                request);
        ProblemDetails withFields = new ProblemDetails(problem.type(), problem.title(), problem.status(),
                problem.detail(), problem.instance(), problem.code(), problem.traceId(), fieldErrors);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PROBLEM_JSON);
        if (exception instanceof TooManyRequestsException tooMany) {
            headers.set(HttpHeaders.RETRY_AFTER, String.valueOf(tooMany.retryAfter().toSeconds()));
        }
        return new ResponseEntity<>(withFields, headers, HttpStatus.valueOf(exception.httpStatus()));
    }

    /** Bean Validation failures on a request body. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ProblemDetails> handleBodyValidation(MethodArgumentNotValidException exception,
                                                               HttpServletRequest request) {
        List<ProblemFieldError> errors = new ArrayList<>();
        for (FieldError fieldError : exception.getBindingResult().getFieldErrors()) {
            errors.add(new ProblemFieldError(fieldError.getField(), ErrorCode.VALIDATION_FAILED,
                    fieldError.getDefaultMessage() == null
                            ? message("error.validation.field", new Object[0])
                            : fieldError.getDefaultMessage()));
        }
        return withFields(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED,
                message("error.validation.failed", new Object[0]), request, errors);
    }

    /** Bean Validation failures on path variables and query parameters. */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ProblemDetails> handleParameterValidation(ConstraintViolationException exception,
                                                                    HttpServletRequest request) {
        List<ProblemFieldError> errors = new ArrayList<>();
        for (ConstraintViolation<?> violation : exception.getConstraintViolations()) {
            errors.add(new ProblemFieldError(String.valueOf(violation.getPropertyPath()),
                    ErrorCode.VALIDATION_FAILED, violation.getMessage()));
        }
        return withFields(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED,
                message("error.validation.failed", new Object[0]), request, errors);
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class, IllegalArgumentException.class})
    public ResponseEntity<ProblemDetails> handleMalformed(Exception exception, HttpServletRequest request) {
        LOGGER.debug("Malformed request on {}", request.getRequestURI(), exception);
        return respond(HttpStatus.BAD_REQUEST, ErrorCode.MALFORMED_REQUEST,
                message("error.request.malformed", new Object[0]), request);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ProblemDetails> handleAccessDenied(AccessDeniedException exception,
                                                             HttpServletRequest request) {
        return respond(HttpStatus.FORBIDDEN, ErrorCode.ACCESS_DENIED,
                message("error.access.denied", new Object[0]), request);
    }

    /**
     * Concurrent modification of a versioned row (users, memberships, tenants). Answering 409 lets
     * the client reload and retry instead of silently overwriting somebody else's change.
     */
    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<ProblemDetails> handleOptimisticLock(OptimisticLockingFailureException exception,
                                                               HttpServletRequest request) {
        return respond(HttpStatus.CONFLICT, ErrorCode.OPTIMISTIC_LOCK_CONFLICT,
                message("error.conflict.optimisticLock", new Object[0]), request);
    }

    /**
     * A database constraint caught what the application check could not, because of a race. The
     * detail is deliberately generic: constraint names would leak schema information.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ProblemDetails> handleIntegrity(DataIntegrityViolationException exception,
                                                          HttpServletRequest request) {
        LOGGER.warn("Data integrity violation on {} traceId={}", request.getRequestURI(),
                RequestCorrelationFilter.currentTraceId(), exception);
        return respond(HttpStatus.CONFLICT, ErrorCode.CONFLICT,
                message("error.conflict.generic", new Object[0]), request);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ProblemDetails> handleNoResource(NoResourceFoundException exception,
                                                           HttpServletRequest request) {
        return respond(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND,
                message("error.notFound", new Object[0]), request);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetails> handleUnexpected(Exception exception, HttpServletRequest request) {
        LOGGER.error("Unhandled exception on {} traceId={}", request.getRequestURI(),
                RequestCorrelationFilter.currentTraceId(), exception);
        return respond(HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR,
                message("error.internal", new Object[0]), request);
    }

    // --- helpers ---------------------------------------------------------------------------------

    private ResponseEntity<ProblemDetails> respond(HttpStatus status, String code, String detail,
                                                   HttpServletRequest request) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PROBLEM_JSON);
        return new ResponseEntity<>(problem(status.value(), code, detail, request), headers, status);
    }

    private ResponseEntity<ProblemDetails> withFields(HttpStatus status, String code, String detail,
                                                      HttpServletRequest request,
                                                      List<ProblemFieldError> errors) {
        ProblemDetails base = problem(status.value(), code, detail, request);
        ProblemDetails problem = new ProblemDetails(base.type(), base.title(), base.status(), base.detail(),
                base.instance(), base.code(), base.traceId(), errors);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PROBLEM_JSON);
        return new ResponseEntity<>(problem, headers, status);
    }

    private ProblemDetails problem(int status, String code, String detail, HttpServletRequest request) {
        return new ProblemDetails(
                ProblemDetails.typeFor(code),
                message("error.title." + code, new Object[0]),
                status,
                detail,
                request == null ? null : request.getRequestURI(),
                code,
                RequestCorrelationFilter.currentTraceId(),
                null);
    }

    /** Field errors carry i18n keys inside the domain; they are resolved here. */
    private List<ProblemFieldError> localize(List<ProblemFieldError> errors) {
        List<ProblemFieldError> localized = new ArrayList<>(errors.size());
        for (ProblemFieldError error : errors) {
            localized.add(new ProblemFieldError(error.field(), error.code(),
                    message(error.message(), new Object[0])));
        }
        return localized;
    }

    private String message(String key, Object[] arguments) {
        if (key == null) {
            return null;
        }
        // The message source is configured with useCodeAsDefaultMessage, so a missing translation
        // degrades to the key instead of throwing.
        return messageSource.getMessage(key, arguments, LocaleContextHolder.getLocale());
    }
}
