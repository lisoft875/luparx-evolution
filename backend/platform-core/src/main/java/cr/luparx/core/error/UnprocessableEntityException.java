package cr.luparx.core.error;

import java.util.List;
import java.util.Map;

/**
 * The request was understood and is well formed, but a business rule refuses the value (422).
 *
 * <p>It exists next to {@link ValidationException} because the two say different things.
 * {@code ValidationException} always reports {@link ErrorCode#VALIDATION_FAILED} plus a list of
 * offending fields, which is what a form needs. This one carries a <em>stable, specific</em> code
 * that the client branches on — {@code INVALID_INCREMENT}, {@code EXTENSION_EXCEEDS_MAX} — where the
 * value is syntactically fine and the domain configuration is what rejects it. Answering 409 for
 * those would be wrong: nothing collides with the current state of a resource.</p>
 */
public class UnprocessableEntityException extends DomainException {

    private static final long serialVersionUID = 1L;

    public UnprocessableEntityException(String code, String messageKey) {
        super(code, messageKey);
    }

    public UnprocessableEntityException(String code, String messageKey, List<Object> messageArguments) {
        super(code, messageKey, messageArguments, Map.of());
    }

    @Override
    public int httpStatus() {
        return 422;
    }

    public static UnprocessableEntityException of(String code, String messageKey, Object... arguments) {
        return new UnprocessableEntityException(code, messageKey, List.of(arguments));
    }
}
