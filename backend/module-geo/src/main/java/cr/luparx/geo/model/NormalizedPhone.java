package cr.luparx.geo.model;

/**
 * Result of validating a phone number.
 *
 * @param e164          the canonical stored form, e.g. {@code +50622223333}
 * @param countryCode   ISO 3166-1 alpha-2 region the number belongs to
 * @param nationalNumber the national significant number, without the country calling code
 */
public record NormalizedPhone(String e164, String countryCode, String nationalNumber) {
}
