package cr.luparx.billing.port;

import java.util.Locale;

/**
 * The card scheme a payment ran on (ADR 0023).
 *
 * <p>Recorded and not inferred: the citizen's own statement says "VISA" or "MASTERCARD", and when
 * somebody rings the municipality about a charge that is the word they will use. Deriving it here
 * from a BIN range would mean shipping a copy of somebody else's table and being wrong about it
 * eventually — the provider already knows, so the provider is asked.</p>
 *
 * <p>{@link #UNKNOWN} exists because a channel that is not a card at all (a counter, an adjustment)
 * still passes through the same payment table, and because a provider is allowed to not tell us.
 * Absence is a legitimate answer here, so it has a value instead of a null.</p>
 */
public enum CardNetwork {

    VISA,
    MASTERCARD,
    AMERICAN_EXPRESS,
    DISCOVER,
    /** A domestic or regional scheme the platform has not needed to name yet. */
    OTHER,
    /** Not a card, or the provider did not say. */
    UNKNOWN;

    public String labelKey() {
        return "payment.network." + name().toLowerCase(Locale.ROOT);
    }

    /**
     * Reads a provider's own word for the scheme.
     *
     * <p>Deliberately lenient about spelling — providers write "visa", "VISA", "Mastercard" and
     * "master-card" — and deliberately never guesses: anything unrecognised is {@link #OTHER}, which
     * says "a scheme we did not map" rather than pretending to know which.</p>
     */
    public static CardNetwork parse(String value) {
        if (value == null || value.isBlank()) {
            return UNKNOWN;
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT).replace("-", "").replace("_", "")
                .replace(" ", "");
        return switch (normalized) {
            case "VISA", "VISAELECTRON", "VISADEBIT" -> VISA;
            case "MASTERCARD", "MC", "MAESTRO" -> MASTERCARD;
            case "AMEX", "AMERICANEXPRESS" -> AMERICAN_EXPRESS;
            case "DISCOVER", "DINERS", "DINERSCLUB" -> DISCOVER;
            default -> OTHER;
        };
    }
}
