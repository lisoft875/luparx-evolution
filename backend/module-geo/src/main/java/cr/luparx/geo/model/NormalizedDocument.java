package cr.luparx.geo.model;

/**
 * Result of validating an identity document.
 *
 * @param countryCode  issuing country (ISO 3166-1 alpha-2)
 * @param type         document kind
 * @param raw          the number exactly as the person typed it (kept for display)
 * @param normalized   canonical form used by the uniqueness constraint
 */
public record NormalizedDocument(String countryCode, IdentityDocumentTypeCode type, String raw, String normalized) {
}
