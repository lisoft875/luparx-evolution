package cr.luparx.core.error;

import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Base class for every expected, business-level failure. Carries a stable {@link ErrorCode}, an i18n
 * message key and its arguments — never a user-facing string, which is resolved from the message
 * bundle at the edge according to the caller's locale (CONTRACT.md §7).
 */
public abstract class DomainException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final String code;
    private final String messageKey;
    private final transient List<Object> messageArguments;
    private final transient Map<String, Object> metadata;

    protected DomainException(String code, String messageKey, List<Object> messageArguments,
                              Map<String, Object> metadata) {
        super(code + " (" + messageKey + ")");
        this.code = code;
        this.messageKey = messageKey;
        this.messageArguments = messageArguments == null ? List.of() : List.copyOf(messageArguments);
        this.metadata = metadata == null ? Map.of() : Map.copyOf(metadata);
    }

    protected DomainException(String code, String messageKey) {
        this(code, messageKey, List.of(), Map.of());
    }

    /** HTTP status this failure maps to. */
    public abstract int httpStatus();

    public String code() {
        return code;
    }

    public String messageKey() {
        return messageKey;
    }

    public List<Object> messageArguments() {
        return messageArguments;
    }

    /** Non-sensitive extra context for logging/auditing. Never contains secrets or personal data. */
    public Map<String, Object> metadata() {
        return metadata;
    }

    /** Field-level errors; empty except for {@link ValidationException}. */
    public List<ProblemFieldError> fieldErrors() {
        return Collections.emptyList();
    }
}
