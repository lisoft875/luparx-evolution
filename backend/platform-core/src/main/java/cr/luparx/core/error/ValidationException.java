package cr.luparx.core.error;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Server-side validation failure (422). Always carries the offending fields so the client can place
 * each message next to its input; validation is always re-run on the server, the client validates
 * only for UX (CONTRACT.md §7).
 */
public class ValidationException extends DomainException {

    private static final long serialVersionUID = 1L;

    private final transient List<ProblemFieldError> fieldErrors;

    public ValidationException(List<ProblemFieldError> fieldErrors) {
        super(ErrorCode.VALIDATION_FAILED, "error.validation.failed", List.of(), Map.of());
        this.fieldErrors = fieldErrors == null ? List.of() : List.copyOf(fieldErrors);
    }

    public ValidationException(String field, String code, String messageKey) {
        this(List.of(new ProblemFieldError(field, code, messageKey)));
    }

    @Override
    public int httpStatus() {
        return 422;
    }

    @Override
    public List<ProblemFieldError> fieldErrors() {
        return fieldErrors;
    }

    /** Small builder for accumulating several field errors before failing once. */
    public static final class Collector {

        private final List<ProblemFieldError> errors = new ArrayList<>();

        public Collector add(String field, String code, String messageKey) {
            errors.add(new ProblemFieldError(field, code, messageKey));
            return this;
        }

        public boolean isEmpty() {
            return errors.isEmpty();
        }

        public void throwIfAny() {
            if (!errors.isEmpty()) {
                throw new ValidationException(errors);
            }
        }
    }
}
