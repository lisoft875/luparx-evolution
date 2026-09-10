package cr.luparx.billing.model;

import java.util.Locale;
import java.util.Optional;

/**
 * How the money arrived (CONTRACT.md v0.35).
 *
 * <p>Every channel is here and not only the ones with a gateway behind them. A municipality's
 * counter takes a real amount of a small council's money, and a payment model that only covered the
 * card would leave half of what came in outside the one table where "what did we collect" can be
 * proved. The controls around each channel are different, which is exactly why they are not
 * interchangeable values.</p>
 */
public enum PaymentMethod {

    /** A card, through a gateway. Carries a fee and settles days later. */
    CARD,
    /** Costa Rica's interbank transfer. Named for what it is rather than folded into a generic one. */
    SINPE,
    /** A plain bank transfer, reconciled against the statement rather than a gateway's report. */
    BANK_TRANSFER,
    /** Cash at the municipality's own window, keyed by a cashier under their own account. */
    COUNTER_CASH,
    /** An external network — a supermarket chain — authenticated server to server. */
    PARTNER,
    /**
     * An operator correction.
     *
     * <p>Here because a correction moves money in the ledger and somebody has to answer for it. It
     * settles against nothing, which is why it is the one method that is never expected to appear in
     * a provider's statement.</p>
     */
    ADJUSTMENT;

    /** True when a provider is expected to report this payment in a settlement. */
    public boolean isSettledByProvider() {
        return this == CARD || this == SINPE || this == BANK_TRANSFER || this == PARTNER;
    }

    public String labelKey() {
        return "payment.method." + name().toLowerCase(Locale.ROOT);
    }

    public static Optional<PaymentMethod> parse(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        for (PaymentMethod method : values()) {
            if (method.name().equals(normalized)) {
                return Optional.of(method);
            }
        }
        return Optional.empty();
    }
}
