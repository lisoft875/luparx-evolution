package cr.luparx.core.i18n;

import java.util.Currency;
import java.util.Locale;

/** ISO 4217 validation helper used when a currency code arrives from configuration or an API call. */
public final class CurrencyCodes {

    private CurrencyCodes() {
    }

    public static boolean isValid(String code) {
        if (code == null || code.length() != 3) {
            return false;
        }
        try {
            Currency.getInstance(code.toUpperCase(Locale.ROOT));
            return true;
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    public static String normalize(String code) {
        return code == null ? null : code.trim().toUpperCase(Locale.ROOT);
    }
}
