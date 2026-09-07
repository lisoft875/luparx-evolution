package cr.luparx.core.error;

import java.util.List;
import java.util.Map;

/** The requested resource does not exist, or is not visible to the caller (404). */
public class NotFoundException extends DomainException {

    private static final long serialVersionUID = 1L;

    public NotFoundException(String code, String messageKey) {
        super(code, messageKey);
    }

    public NotFoundException(String code, String messageKey, List<Object> messageArguments) {
        super(code, messageKey, messageArguments, Map.of());
    }

    @Override
    public int httpStatus() {
        return 404;
    }

    public static NotFoundException of(String code, String messageKey, Object... arguments) {
        return new NotFoundException(code, messageKey, List.of(arguments));
    }
}
