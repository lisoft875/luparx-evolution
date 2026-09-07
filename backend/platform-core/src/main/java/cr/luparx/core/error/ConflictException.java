package cr.luparx.core.error;

import java.util.List;
import java.util.Map;

/** The request collides with the current state of the resource (409). */
public class ConflictException extends DomainException {

    private static final long serialVersionUID = 1L;

    public ConflictException(String code, String messageKey) {
        super(code, messageKey);
    }

    public ConflictException(String code, String messageKey, List<Object> messageArguments) {
        super(code, messageKey, messageArguments, Map.of());
    }

    @Override
    public int httpStatus() {
        return 409;
    }

    public static ConflictException of(String code, String messageKey, Object... arguments) {
        return new ConflictException(code, messageKey, List.of(arguments));
    }
}
