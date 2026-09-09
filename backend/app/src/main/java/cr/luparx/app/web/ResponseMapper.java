package cr.luparx.app.web;

import cr.luparx.app.audit.AuditEventEntity;
import cr.luparx.app.web.dto.AdminDtos;
import cr.luparx.app.web.dto.AuthDtos;
import cr.luparx.app.web.dto.CatalogDtos;
import cr.luparx.app.web.dto.PlatformDtos;
import cr.luparx.app.web.dto.SessionDtos;
import cr.luparx.core.i18n.CountryCodes;
import cr.luparx.core.id.UserId;
import cr.luparx.geo.entity.AdministrativeDivision;
import cr.luparx.geo.entity.Country;
import cr.luparx.geo.entity.CountryAdminLevel;
import cr.luparx.geo.entity.IdentityDocumentType;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.service.IssuedTokens;
import cr.luparx.identity.service.MfaService;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.entity.TenantLocale;
import cr.luparx.tenancy.model.TenantBranding;
import cr.luparx.tenancy.entity.TenantMembership;
import cr.luparx.tenancy.entity.TenantSetting;
import cr.luparx.tenancy.repository.TenantRepository;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Explicit entity → DTO mapping.
 *
 * <p>Written by hand rather than generated: the mapping is where data minimisation is decided (which
 * fields a list view may carry, which ones only the detail view exposes), and that decision deserves
 * to be readable. Entities are never serialised directly (CONTRACT.md §4).</p>
 */
@Component
public class ResponseMapper {

    private final TenantRepository tenantRepository;
    private final MfaService mfaService;

    public ResponseMapper(TenantRepository tenantRepository, MfaService mfaService) {
        this.tenantRepository = tenantRepository;
        this.mfaService = mfaService;
    }

    // --- catalogue -------------------------------------------------------------------------------

    public CatalogDtos.CountryResponse toCountry(Country country) {
        return new CatalogDtos.CountryResponse(
                country.getCode(),
                country.getNameKey(),
                country.getDialCode(),
                CountryCodes.flagEmoji(country.getCode()),
                country.getDefaultLocale(),
                country.getDefaultCurrency(),
                country.getDefaultTimeZone(),
                country.getDisplayNameFormat());
    }

    public CatalogDtos.AdminLevelResponse toAdminLevel(CountryAdminLevel level) {
        return new CatalogDtos.AdminLevelResponse(level.getLevel(), level.getLabelKey(), level.isRequired());
    }

    public CatalogDtos.AdministrativeDivisionResponse toDivision(AdministrativeDivision division) {
        return new CatalogDtos.AdministrativeDivisionResponse(division.getId(), division.getCode(),
                division.getName(), division.getLevel(), division.getParentId());
    }

    public CatalogDtos.DocumentTypeResponse toDocumentType(IdentityDocumentType type) {
        return new CatalogDtos.DocumentTypeResponse(type.getType(), type.getLabelKey(), type.getPattern(),
                type.getExample(), type.isDefaultType());
    }

    public CatalogDtos.TenantCatalogResponse toTenantCatalog(Tenant tenant) {
        return new CatalogDtos.TenantCatalogResponse(
                tenant.getId(),
                tenant.getSlug(),
                tenant.getDisplayName(),
                tenant.getCountryCode(),
                tenant.getShortName(),
                logoUrlOf(tenant),
                tenant.getBrandColor());
    }

    /**
     * Turns the stored logo key into something a client can put in an {@code <img src>}.
     *
     * <p>The one place this resolution happens, so the catalogue, the membership list and the
     * active-municipality chip can never disagree about where a logo lives. Three cases and no
     * fourth:</p>
     * <ul>
     *   <li>no key — <b>null</b>, and the client draws a monogram over the brand colour. This is the
     *       normal state of a municipality that has not provided its emblem yet, not an error;</li>
     *   <li>{@code generated:monogram} — the platform's own endpoint, which draws that monogram
     *       server-side for anything that cannot (an email, a PDF, an {@code <img>} with no
     *       JavaScript behind it);</li>
     *   <li>an https address — itself, because that is the emblem the municipality provided.</li>
     * </ul>
     */
    public String logoUrlOf(Tenant tenant) {
        String key = tenant == null ? null : tenant.getLogoAssetKey();
        if (key == null || key.isBlank()) {
            return null;
        }
        if (TenantBranding.GENERATED_MONOGRAM.equals(key)) {
            return TenantLogoController.pathFor(tenant.getId());
        }
        return key;
    }

    // --- tokens ----------------------------------------------------------------------------------

    public AuthDtos.TokenPairResponse toTokenPair(IssuedTokens tokens) {
        return new AuthDtos.TokenPairResponse(tokens.accessToken(), tokens.refreshToken(), tokens.expiresIn());
    }

    public AuthDtos.TokensEnvelope toTokensEnvelope(IssuedTokens tokens) {
        return new AuthDtos.TokensEnvelope(toTokenPair(tokens));
    }

    // --- users -----------------------------------------------------------------------------------

    /**
     * The stored form is E.164, which is what is returned here: the national number is not persisted
     * separately, and re-deriving it would mean re-parsing on every read. Clients format for display
     * from the E.164 value and the country code, exactly as they do for a number they never typed.
     */
    public AuthDtos.PhoneDto toPhone(User user) {
        return new AuthDtos.PhoneDto(user.getPhoneCountryCode(), user.getPhoneE164());
    }

    public AuthDtos.IdentityDocumentDto toDocument(User user) {
        return new AuthDtos.IdentityDocumentDto(user.getDocumentCountryCode(), user.getDocumentType(),
                user.getDocumentNumber());
    }

    public AuthDtos.AddressDto toAddress(User user) {
        return new AuthDtos.AddressDto(user.getAddressCountryCode(), user.getAddressLevel1Id(),
                user.getAddressLevel2Id(), user.getAddressLevel3Id(), user.getAddressLine1(),
                user.getAddressLine2(), user.getAddressPostalCode());
    }

    public SessionDtos.UserProfileResponse toProfile(User user) {
        return new SessionDtos.UserProfileResponse(
                user.getId(),
                user.getEmail(),
                user.isEmailVerified(),
                user.getGivenName(),
                user.getFamilyName(),
                user.getSecondFamilyName(),
                user.getBirthDate(),
                user.getNationalityCode(),
                toPhone(user),
                toDocument(user),
                toAddress(user),
                user.getLocale(),
                user.getTimeZone(),
                user.getStatus(),
                user.isMfaRequired(),
                mfaService.isActive(UserId.of(user.getId())));
    }

    /** One language a municipality offers, for the public catalogue and the admin form. */
    public CatalogDtos.TenantLocaleResponse toTenantLocale(TenantLocale locale) {
        return new CatalogDtos.TenantLocaleResponse(locale.getLocale(), locale.isDefaultLocale(),
                locale.getSortOrder());
    }

    /** Display name; the presentation order is a locale concern the client resolves. */
    public String fullName(User user) {
        StringBuilder builder = new StringBuilder(user.getGivenName()).append(' ').append(user.getFamilyName());
        if (user.getSecondFamilyName() != null && !user.getSecondFamilyName().isBlank()) {
            builder.append(' ').append(user.getSecondFamilyName());
        }
        return builder.toString();
    }

    /** List projection: no identity document, no birth date (SECURITY.md §11 data minimisation). */
    public AdminDtos.AdminUserListItem toUserListItem(User user, List<TenantMembership> memberships) {
        return new AdminDtos.AdminUserListItem(
                user.getId(),
                user.getEmail(),
                fullName(user),
                user.getStatus(),
                user.getCreatedAt(),
                toMembershipSummaries(memberships));
    }

    public AdminDtos.AdminUserDetail toUserDetail(User user, List<TenantMembership> memberships) {
        return new AdminDtos.AdminUserDetail(
                user.getId(),
                user.getEmail(),
                fullName(user),
                user.getStatus(),
                user.getCreatedAt(),
                toMembershipSummaries(memberships),
                user.getGivenName(),
                user.getFamilyName(),
                user.getSecondFamilyName(),
                user.getBirthDate(),
                user.getNationalityCode(),
                toPhone(user),
                toDocument(user),
                toAddress(user),
                user.isMfaRequired(),
                mfaService.isActive(UserId.of(user.getId())),
                user.getBlockedReason());
    }

    // --- memberships -----------------------------------------------------------------------------

    public List<SessionDtos.MembershipSummaryResponse> toMembershipSummaries(List<TenantMembership> memberships) {
        if (memberships == null || memberships.isEmpty()) {
            return List.of();
        }
        Map<UUID, Tenant> tenants = tenantsOf(memberships);
        List<SessionDtos.MembershipSummaryResponse> result = new ArrayList<>(memberships.size());
        for (TenantMembership membership : memberships) {
            Tenant tenant = membership.getTenantId() == null ? null : tenants.get(membership.getTenantId());
            result.add(new SessionDtos.MembershipSummaryResponse(
                    membership.getId(),
                    membership.getTenantId(),
                    tenant == null ? null : tenant.getDisplayName(),
                    tenant == null ? null : tenant.getShortName(),
                    logoUrlOf(tenant),
                    tenant == null ? null : tenant.getBrandColor(),
                    membership.getPortal(),
                    membership.getRole(),
                    membership.getStatus()));
        }
        return result;
    }

    /**
     * One query for every tenant referenced by the list, instead of one per membership (no N+1).
     *
     * <p>The whole tenant is loaded rather than just its name, because the membership list now has to
     * carry the logo and the colour as well — and the alternative, one lookup per municipality to
     * paint a picker, is exactly the shape this method exists to avoid.</p>
     */
    private Map<UUID, Tenant> tenantsOf(List<TenantMembership> memberships) {
        List<UUID> ids = memberships.stream()
                .map(TenantMembership::getTenantId)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        Map<UUID, Tenant> tenants = new HashMap<>();
        if (ids.isEmpty()) {
            return tenants;
        }
        for (Tenant tenant : tenantRepository.findAllById(ids)) {
            tenants.put(tenant.getId(), tenant);
        }
        return tenants;
    }

    public AdminDtos.MembershipResponse toMembership(TenantMembership membership) {
        return new AdminDtos.MembershipResponse(
                membership.getId(),
                membership.getTenantId(),
                membership.getUserId(),
                membership.getPortal(),
                membership.getRole(),
                membership.getStatus(),
                membership.getRequestedAt(),
                membership.getApprovedAt(),
                membership.getApprovedBy(),
                membership.getStatusReason());
    }

    // --- audit and tenants -----------------------------------------------------------------------

    public AdminDtos.AuditEventResponse toAuditEvent(AuditEventEntity event) {
        return new AdminDtos.AuditEventResponse(
                event.getId(),
                event.getTenantId(),
                event.getActorUserId(),
                event.getActorPortal(),
                event.getAction(),
                event.getResourceType(),
                event.getResourceId(),
                event.getOccurredAt(),
                event.getMetadata());
    }

    public PlatformDtos.TenantResponse toTenant(Tenant tenant) {
        return new PlatformDtos.TenantResponse(
                tenant.getId(),
                tenant.getSlug(),
                tenant.getDisplayName(),
                tenant.getLegalName(),
                tenant.getCountryCode(),
                tenant.getCurrencyCode(),
                tenant.getLocale(),
                tenant.getTimeZone(),
                tenant.getStatus(),
                tenant.getSelfRegistrationPolicy(),
                tenant.getCreatedAt(),
                tenant.getShortName(),
                tenant.getLogoAssetKey(),
                logoUrlOf(tenant),
                tenant.getBrandColor());
    }

    /** The visual identity as the admin form edits it: the stored key, plus what it resolves to. */
    public AdminDtos.TenantBrandingResponse toBranding(Tenant tenant) {
        return new AdminDtos.TenantBrandingResponse(
                tenant.getLogoAssetKey(),
                logoUrlOf(tenant),
                tenant.getBrandColor(),
                tenant.getShortName());
    }

    public PlatformDtos.TenantSettingResponse toTenantSetting(TenantSetting setting) {
        return new PlatformDtos.TenantSettingResponse(setting.getSettingKey(), setting.getValue(),
                setting.getUpdatedAt());
    }
}
