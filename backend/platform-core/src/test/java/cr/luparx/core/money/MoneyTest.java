package cr.luparx.core.money;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * {@link Money} is the only representation of an amount in the platform (ADR 0009), so these tests
 * pin down the two properties everything else relies on: exactness and currency safety.
 */
class MoneyTest {

    @Test
    void keepsAmountsExactInMinorUnits() {
        Money amount = Money.ofMinor(150_050L, "CRC");

        assertThat(amount.minorUnits()).isEqualTo(150_050L);
        assertThat(amount.toMajor()).isEqualByComparingTo(new BigDecimal("1500.50"));
    }

    @Test
    void buildsFromDecimalMajorUnitsUsingTheCurrencyScale() {
        assertThat(Money.ofMajor(new BigDecimal("1500.50"), "CRC").minorUnits()).isEqualTo(150_050L);
        // A zero-decimal currency has no minor unit at all.
        assertThat(Money.ofMajor(new BigDecimal("1500"), "JPY").minorUnits()).isEqualTo(1_500L);
    }

    @Test
    void refusesMorePrecisionThanTheCurrencyAllows() {
        // Silently rounding money is how cent-level discrepancies are born.
        assertThatThrownBy(() -> Money.ofMajor(new BigDecimal("10.005"), "USD"))
                .isInstanceOf(ArithmeticException.class);
    }

    @Test
    void addsAndSubtractsWithinTheSameCurrency() {
        Money base = Money.ofMinor(1_000L, "USD");

        assertThat(base.plus(Money.ofMinor(250L, "USD")).minorUnits()).isEqualTo(1_250L);
        assertThat(base.minus(Money.ofMinor(250L, "USD")).minorUnits()).isEqualTo(750L);
        assertThat(base.multipliedBy(3).minorUnits()).isEqualTo(3_000L);
        assertThat(base.negated().isNegative()).isTrue();
    }

    @Test
    void refusesToMixCurrencies() {
        Money colones = Money.ofMinor(1_000L, "CRC");
        Money dollars = Money.ofMinor(1_000L, "USD");

        assertThatThrownBy(() -> colones.plus(dollars))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("currency mismatch");
        assertThatThrownBy(() -> colones.compareTo(dollars))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void normalisesAndValidatesTheCurrencyCode() {
        assertThat(Money.ofMinor(1L, "crc").currencyCode()).isEqualTo("CRC");
        assertThatThrownBy(() -> Money.ofMinor(1L, "ZZZ")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Money.ofMinor(1L, "EU")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void comparesWithinTheSameCurrency() {
        assertThat(Money.ofMinor(100L, "EUR")).isLessThan(Money.ofMinor(200L, "EUR"));
        assertThat(Money.zero("EUR").isZero()).isTrue();
        assertThat(Money.ofMinor(1L, "EUR").isPositive()).isTrue();
    }
}
