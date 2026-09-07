package cr.luparx.identity.service;

/**
 * Platform-level registration defaults, all configurable ({@code platform.defaults.*}).
 *
 * <p>These are <em>defaults</em>, never assumptions: a registration that supplies its own country,
 * locale or time zone uses those. They exist so that a form left partially filled still produces a
 * coherent record, and so that a new deployment in another country changes configuration, not code
 * (CONTRACT.md §7).</p>
 *
 * @param minimumAge      minimum age accepted, in years
 * @param defaultLocale   BCP 47 tag used when the client sends none
 * @param defaultTimeZone IANA zone used when the client sends none
 * @param defaultCountryCode ISO 3166-1 alpha-2 used to pre-fill the form
 * @param currentTermsVersion terms version a new registration must accept
 */
public record RegistrationPolicy(
        int minimumAge,
        String defaultLocale,
        String defaultTimeZone,
        String defaultCountryCode,
        String currentTermsVersion) {
}
