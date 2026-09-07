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
                type.getExample());
    }

    public CatalogDtos.TenantCatalogResponse toTenantCatalog(Tenant tenant) {
        return new CatalogDtos.TenantCatalogResponse(tenant.getId(), tenant.getSlug(), tenant.getDisplayName(),
                tenant.getCountryCode());
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
        Map<UUID, String> names = tenantNames(memberships);
        List<SessionDtos.MembershipSummaryResponse> result = new ArrayList<>(memberships.size());
        for (TenantMembership membership : memberships) {
            result.add(new SessionDtos.MembershipSummaryResponse(
                    membership.getId(),
                    membership.getTenantId(),
                    membership.getTenantId() == null ? null : names.get(membership.getTenantId()),
                    membership.getPortal(),
                    membership.getRole(),
                    membership.getStatus()));
        }
        return result;
    }

    /** One query for every tenant referenced by the list, instead of one per membership (no N+1). */
    private Map<UUID, String> tenantNames(List<TenantMembership> memberships) {
        List<UUID> ids = memberships.stream()
                .map(TenantMembership::getTenantId)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        Map<UUID, String> names = new HashMap<>();
        if (ids.isEmpty()) {
            return names;
        }
        for (Tenant tenant : tenantRepository.findAllById(ids)) {
            names.put(tenant.getId(), tenant.getDisplayName());
        }
        return names;
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
                tenant.getCreatedAt());
    }

    public PlatformDtos.TenantSettingResponse toTenantSetting(TenantSetting setting) {
        return new PlatformDtos.TenantSettingResponse(setting.getSettingKey(), setting.getValue(),
                setting.getUpdatedAt());
    }
}
