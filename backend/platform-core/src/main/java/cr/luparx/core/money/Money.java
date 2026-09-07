package cr.luparx.core.money;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Currency;
import java.util.Objects;

/**
 * An exact monetary amount: integer minor units plus an ISO 4217 currency (ADR 0009).
 * Floating point is never used for money anywhere in the platform.
 *
 * <p>The currency travels with the amount because several currencies coexist as soon as the
 * platform serves more than one country; an amount without a currency is meaningless.</p>
 */
public record Money(long minorUnits, String currencyCode) implements Comparable<Money> {

    public Money {
        Objects.requireNonNull(currencyCode, "currencyCode must not be null");
        if (currencyCode.length() != 3) {
            throw new IllegalArgumentException("currencyCode must be a 3-letter ISO 4217 code: " + currencyCode);
        }
        currencyCode = currencyCode.toUpperCase(java.util.Locale.ROOT);
        // Validates the code against the JDK's ISO 4217 table; throws IllegalArgumentException otherwise.
        Currency.getInstance(currencyCode);
    }

    public static Money ofMinor(long minorUnits, String currencyCode) {
        return new Money(minorUnits, currencyCode);
    }

    public static Money zero(String currencyCode) {
        return new Money(0L, currencyCode);
    }

    /**
     * Builds an amount from a decimal representation (for example an operator typing "1500.50").
     * The value is scaled to the currency's fraction digits and must be exact — a value with more
     * precision than the currency allows is rejected rather than silently rounded.
     */
    public static Money ofMajor(BigDecimal major, String currencyCode) {
        Objects.requireNonNull(major, "major must not be null");
        Currency currency = Currency.getInstance(currencyCode.toUpperCase(java.util.Locale.ROOT));
        BigDecimal scaled = major.setScale(currency.getDefaultFractionDigits(), RoundingMode.UNNECESSARY);
        return new Money(scaled.movePointRight(currency.getDefaultFractionDigits()).longValueExact(), currencyCode);
    }

    public Currency currency() {
        return Currency.getInstance(currencyCode);
    }

    public BigDecimal toMajor() {
        return BigDecimal.valueOf(minorUnits, currency().getDefaultFractionDigits());
    }

    public Money plus(Money other) {
        requireSameCurrency(other);
        return new Money(Math.addExact(minorUnits, other.minorUnits), currencyCode);
    }

    public Money minus(Money other) {
        requireSameCurrency(other);
        return new Money(Math.subtractExact(minorUnits, other.minorUnits), currencyCode);
    }

    public Money multipliedBy(long factor) {
        return new Money(Math.multiplyExact(minorUnits, factor), currencyCode);
    }

    public Money negated() {
        return new Money(Math.negateExact(minorUnits), currencyCode);
    }

    public boolean isZero() {
        return minorUnits == 0L;
    }

    public boolean isNegative() {
        return minorUnits < 0L;
    }

    public boolean isPositive() {
        return minorUnits > 0L;
    }

    @Override
    public int compareTo(Money other) {
        requireSameCurrency(other);
        return Long.compare(minorUnits, other.minorUnits);
    }

    private void requireSameCurrency(Money other) {
        Objects.requireNonNull(other, "other must not be null");
        if (!currencyCode.equals(other.currencyCode)) {
            throw new IllegalArgumentException(
                    "currency mismatch: " + currencyCode + " vs " + other.currencyCode);
        }
    }

    @Override
    public String toString() {
        return toMajor().toPlainString() + " " + currencyCode;
    }
}
