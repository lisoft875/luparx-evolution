package cr.luparx.billing.model;

/**
 * Error codes of the gateway edge (ADR 0023).
 *
 * <h2>TEMPORAL: esto pertenece a cr.luparx.core.error.ErrorCode</h2>
 *
 * <p>These belong in the platform's single error-code registry beside {@code PAYMENT_NOT_FOUND}, and
 * they are here only because {@code ErrorCode} was being edited by concurrent work when this feature
 * landed. Two registries of error codes is a smell, and this one is meant to disappear: move these
 * constants into {@code ErrorCode}, re-point the imports, and delete this file. The patch note in
 * {@code docs/} carries the exact block.</p>
 */
public final class GatewayErrorCode {

    /** This municipality has no card provider configured; it collects at the counter. */
    public static final String PAYMENT_GATEWAY_NOT_CONFIGURED = "PAYMENT_GATEWAY_NOT_CONFIGURED";
    /** The provider could not be reached. Nothing is concluded about the money. */
    public static final String PAYMENT_GATEWAY_UNAVAILABLE = "PAYMENT_GATEWAY_UNAVAILABLE";
    /** No such checkout for this person in this municipality. Same answer as "belongs to somebody else". */
    public static final String PAYMENT_CHECKOUT_NOT_FOUND = "PAYMENT_CHECKOUT_NOT_FOUND";
    /** The hand-off is over: resolved or expired. A second attempt starts a new one. */
    public static final String PAYMENT_CHECKOUT_CLOSED = "PAYMENT_CHECKOUT_CLOSED";
    /** The return link was already used, or is not this checkout's. */
    public static final String PAYMENT_RETURN_TOKEN_INVALID = "PAYMENT_RETURN_TOKEN_INVALID";
    /** The amount is outside what this municipality accepts as a single top-up. */
    public static final String TOPUP_AMOUNT_NOT_ALLOWED = "TOPUP_AMOUNT_NOT_ALLOWED";

    private GatewayErrorCode() {
    }
}
