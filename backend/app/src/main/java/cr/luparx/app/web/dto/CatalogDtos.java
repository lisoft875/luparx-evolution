package cr.luparx.app.web.dto;

import cr.luparx.geo.model.IdentityDocumentTypeCode;

import java.util.UUID;

/**
 * Wire shapes of the public catalogue endpoints (CONTRACT.md §4 "Público / catálogos").
 *
 * <p>Names carry i18n <em>keys</em> ({@code nameKey}, {@code labelKey}) rather than translated text:
 * the client owns the translations, and the same response is cacheable for every language
 * (CONTRACT.md §7). Place names ({@code AdministrativeDivisionResponse.name}) are the exception —
 * proper nouns are not translated.</p>
 */
public final class CatalogDtos {

    private CatalogDtos() {
    }

    /** {@code GET /catalog/countries}. The flag is derived from the code, never stored as an image. */
    public record CountryResponse(
            String code,
            String nameKey,
            String dialCode,
            String flagEmoji,
            String defaultLocale,
            String defaultCurrency,
            String defaultTimeZone,
            String displayNameFormat) {
    }

    /** {@code GET /catalog/countries/{code}/admin-levels}. */
    public record AdminLevelResponse(int level, String labelKey, boolean required) {
    }

    /** {@code GET /catalog/countries/{code}/divisions}. */
    public record AdministrativeDivisionResponse(UUID id, String code, String name, int level, UUID parentId) {
    }

    /** {@code GET /catalog/countries/{code}/document-types}. */
    public record DocumentTypeResponse(
            IdentityDocumentTypeCode type,
            String labelKey,
            String pattern,
            String example) {
    }

    /** {@code GET /catalog/tenants}. Only publishable (active) municipalities are exposed. */
    public record TenantCatalogResponse(UUID id, String slug, String name, String countryCode) {
    }

    /**
     * {@code GET /catalog/tenants/{id}/locales} — the languages a municipality offers
     * (CONTRACT.md v0.3, "Idiomas por municipalidad").
     *
     * <p>Public because the login screen needs it before anybody has a token, and because a language
     * list discloses nothing: it is what the municipality prints on its own website. Only enabled
     * languages appear — a client is told what it may pick, not what an administrator is still
     * preparing.</p>
     *
     * @param locale     BCP 47 tag, canonicalised
     * @param isDefault  whether this is the municipality's fallback
     * @param sortOrder  the order the dropdown shows them in
     */
    public record TenantLocaleResponse(String locale, boolean isDefault, int sortOrder) {
    }
}
