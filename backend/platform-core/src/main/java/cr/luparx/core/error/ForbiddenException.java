package cr.luparx.core.error;

import java.util.List;
import java.util.Map;

/**
 * The caller is authenticated but not allowed to perform the operation on this resource (403).
 * Used for missing permissions and, critically, for cross-tenant access attempts (SECURITY.md §3).
 */
public class ForbiddenException extends DomainException {

    private static final long serialVersionUID = 1L;

    public ForbiddenException(String code, String messageKey) {
        super(code, messageKey);
    }

    public ForbiddenException(String code, String messageKey, List<Object> messageArguments) {
        super(code, messageKey, messageArguments, Map.of());
    }

    @Override
    public int httpStatus() {
        return 403;
    }

    public static ForbiddenException of(String code, String messageKey, Object... arguments) {
        return new ForbiddenException(code, messageKey, List.of(arguments));
    }
}
