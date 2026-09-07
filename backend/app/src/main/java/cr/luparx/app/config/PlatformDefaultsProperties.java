package cr.luparx.app.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Platform-wide <b>defaults</b> ({@code platform.defaults.*}).
 *
 * <p>CONTRACT.md §7 forbids {@code CRC}, {@code +506}, {@code Costa Rica} or
 * {@code America/Costa_Rica} appearing as assumptions in code. They are allowed to exist as the
 * configured default of a deployment and as seed data — which is exactly what this class is. Nothing
 * in the domain reads these values directly: they only fill in what a request or a tenant did not
 * specify, and a deployment in another country changes a YAML file, not a line of Java.</p>
 *
 * @param countryCode  ISO 3166-1 alpha-2 pre-selected in registration forms
 * @param currencyCode ISO 4217 used when a tenant does not define its own
 * @param locale       BCP 47 tag used when neither the user nor the tenant has one
 * @param timeZone     IANA zone used for the same purpose
 * @param dialCode     E.164 calling code pre-filled in the phone field
 * @param minimumAge   minimum registration age in years
 * @param termsVersion version of the terms a new registration must accept
 */
@ConfigurationProperties(prefix = "platform.defaults")
public record PlatformDefaultsProperties(
        String countryCode,
        String currencyCode,
        String locale,
        String timeZone,
        String dialCode,
        int minimumAge,
        String termsVersion) {
}
