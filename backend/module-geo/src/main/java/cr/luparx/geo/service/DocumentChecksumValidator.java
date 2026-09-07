package cr.luparx.geo.service;

import cr.luparx.geo.model.IdentityDocumentTypeCode;

/**
 * Optional per-country checksum rule, plugged in on top of the regex from the catalogue.
 *
 * <p>Several countries encode a check digit in the national id or tax id. Rather than hardcoding
 * one country's algorithm inside the validator, each rule is a bean discovered at startup; a country
 * with no registered rule is validated by pattern alone.</p>
 */
public interface DocumentChecksumValidator {

    /** Whether this rule applies to the given country and document kind. */
    boolean supports(String countryCode, IdentityDocumentTypeCode type);

    /** @param normalizedNumber the already-normalised number (never null) */
    boolean isValid(String normalizedNumber);
}
