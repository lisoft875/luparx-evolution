package cr.luparx.core.error;

import java.util.List;
import java.util.Map;

/** Authentication failed or is missing (401). Never discloses which half of a credential was wrong. */
public class UnauthorizedException extends DomainException {

    private static final long serialVersionUID = 1L;

    public UnauthorizedException(String code, String messageKey) {
        super(code, messageKey);
    }

    public UnauthorizedException(String code, String messageKey, List<Object> messageArguments) {
        super(code, messageKey, messageArguments, Map.of());
    }

    @Override
    public int httpStatus() {
        return 401;
    }

    public static UnauthorizedException of(String code, String messageKey, Object... arguments) {
        return new UnauthorizedException(code, messageKey, List.of(arguments));
    }
}
