package cr.luparx.core.error;

/**
 * A declared but not yet implemented extension point (501). Used by the parking-domain stubs and by
 * the federation callback, so the contract surface exists from v0.1 without pretending to work.
 */
public class NotImplementedException extends DomainException {

    private static final long serialVersionUID = 1L;

    public NotImplementedException(String messageKey) {
        super(ErrorCode.NOT_IMPLEMENTED, messageKey);
    }

    @Override
    public int httpStatus() {
        return 501;
    }
}
