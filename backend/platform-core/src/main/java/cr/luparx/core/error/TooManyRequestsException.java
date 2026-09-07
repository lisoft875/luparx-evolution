package cr.luparx.core.error;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/** The caller exceeded a rate limit or is temporarily locked out (429). */
public class TooManyRequestsException extends DomainException {

    private static final long serialVersionUID = 1L;

    private final Duration retryAfter;

    public TooManyRequestsException(String code, String messageKey, Duration retryAfter) {
        super(code, messageKey, List.of(), Map.of("retryAfterSeconds", retryAfter.toSeconds()));
        this.retryAfter = retryAfter;
    }

    public Duration retryAfter() {
        return retryAfter;
    }

    @Override
    public int httpStatus() {
        return 429;
    }
}
