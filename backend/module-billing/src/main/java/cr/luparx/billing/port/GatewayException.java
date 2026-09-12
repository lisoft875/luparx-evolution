package cr.luparx.billing.port;

/**
 * A gateway could not be talked to, or said something that cannot be acted on (ADR 0023).
 *
 * <h2>Por qué no es una DomainException</h2>
 *
 * <p>This is not a rule of the business being broken; it is the outside world being unavailable or
 * wrong. Keeping it its own type is what lets the callers make the distinction that matters with
 * money: a failure to <em>reach</em> a provider must never be recorded as a payment that failed. A
 * timeout means we do not know, and "we do not know" leaves the attempt pending so it is asked about
 * again — turning it into {@code FAILED} would tell a citizen their payment was refused while their
 * card statement says otherwise.</p>
 *
 * @see #retryable() the flag callers use to decide between asking again and giving up
 */
public class GatewayException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final String provider;
    private final boolean retryable;

    public GatewayException(String provider, String message, boolean retryable, Throwable cause) {
        super(message, cause);
        this.provider = provider;
        this.retryable = retryable;
    }

    /** The provider is up but refused to be understood: bad signature, unparseable body. */
    public static GatewayException rejected(String provider, String message) {
        return new GatewayException(provider, message, false, null);
    }

    /** We could not find out. Nothing is concluded about the money. */
    public static GatewayException unavailable(String provider, String message, Throwable cause) {
        return new GatewayException(provider, message, true, cause);
    }

    public String provider() {
        return provider;
    }

    /** True when asking again later could give a different answer. */
    public boolean retryable() {
        return retryable;
    }
}
