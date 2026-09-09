package cr.luparx.app.web.dto;

import cr.luparx.app.web.dto.AuthDtos.AddressDto;
import cr.luparx.app.web.dto.AuthDtos.IdentityDocumentDto;
import cr.luparx.app.web.dto.AuthDtos.PhoneDto;
import cr.luparx.core.domain.Portal;
import cr.luparx.core.domain.Role;
import cr.luparx.core.email.EmailAddress;
import cr.luparx.identity.model.UserStatus;
import cr.luparx.tenancy.model.MembershipStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Wire shapes of {@code /api/v1/admin/**} (CONTRACT.md §4).
 *
 * <p>Data minimisation is part of the contract here: {@link AdminUserListItem} carries no identity
 * document and no birth date, because a list view does not need them. The full record is only
 * available on {@code GET /admin/users/{id}} to a caller holding {@code USER_READ}
 * (SECURITY.md §11).</p>
 */
public final class AdminDtos {

    private AdminDtos() {
    }

    public record AdminUserListItem(
            UUID id,
            String email,
            String fullName,
            UserStatus status,
            Instant createdAt,
            List<SessionDtos.MembershipSummaryResponse> memberships) {
    }

    public record AdminUserDetail(
            UUID id,
            String email,
            String fullName,
            UserStatus status,
            Instant createdAt,
            List<SessionDtos.MembershipSummaryResponse> memberships,
            String givenName,
            String familyName,
            String secondFamilyName,
            LocalDate birthDate,
            String nationalityCode,
            PhoneDto phone,
            IdentityDocumentDto identityDocument,
            AddressDto address,
            boolean mfaRequired,
            boolean mfaEnabled,
            String blockedReason) {
    }

    /** {@code POST /admin/users}: manual creation / invitation of a member of this tenant. */
    public record CreateUserRequest(
            @NotBlank @Email @Size(max = 320) String email,
            @NotBlank @Size(max = 100) String givenName,
            @NotBlank @Size(max = 100) String familyName,
            @Size(max = 100) String secondFamilyName,
            @NotNull @Valid IdentityDocumentDto identityDocument,
            @NotNull @Valid AddressDto address,
            @NotNull @Valid PhoneDto phone,
            @NotBlank @Size(min = 2, max = 2) String nationalityCode,
            @NotNull LocalDate birthDate,
            @Size(max = 35) String locale,
            @Size(max = 64) String timeZone,
            @NotNull Portal portal,
            @NotNull Role role) {

        /**
         * Administrative creation goes through the same canonical form as self-registration, so a
         * back-office typo cannot produce a second account for an address that already exists.
         */
        public CreateUserRequest {
            email = EmailAddress.normalize(email);
        }
    }

    public record UpdateUserRequest(
            @NotBlank @Size(max = 100) String givenName,
            @NotBlank @Size(max = 100) String familyName,
            @Size(max = 100) String secondFamilyName,
            @Valid AddressDto address,
            @Valid PhoneDto phone,
            @Size(min = 2, max = 2) String nationalityCode,
            @Size(max = 35) String locale,
            @Size(max = 64) String timeZone) {
    }

    public record BlockUserRequest(@NotBlank @Size(max = 500) String reason) {
    }

    public record RequireMfaRequest(@NotNull Boolean required) {
    }

    public record CreateMembershipRequest(
            @NotNull UUID userId,
            UUID tenantId,
            @NotNull Portal portal,
            @NotNull Role role) {
    }

    public record UpdateMembershipRequest(Role role, MembershipStatus status) {
    }

    /** {@code POST /admin/memberships/{id}/suspend}: pause an access, reversibly. */
    public record SuspendMembershipRequest(@Size(max = 500) String reason) {
    }

    /**
     * {@code PUT /admin/memberships/{id}/zones}: the whole assignment, replaced.
     *
     * <p>An empty list is meaningful and is not the same as not calling this: it clears every
     * restriction, and the officer covers the municipality again.</p>
     */
    public record AssignZonesRequest(@NotNull List<UUID> zoneIds) {
    }

    /**
     * One member of staff as the administration panel reads them (CONTRACT.md v0.15): the person,
     * their post, the sectors it covers and whether the account is being used.
     *
     * <p>A shape of its own rather than a user plus a membership, because the panel's unit is the
     * post: the same person can hold two, and the question asked of each — who is this, what may
     * they do, where, and are they still here — is one row's worth of answer.</p>
     */
    public record StaffMemberResponse(
            UUID membershipId,
            UUID userId,
            String fullName,
            String email,
            Portal portal,
            Role role,
            MembershipStatus status,
            String statusReason,
            Instant suspendedAt,
            Instant revokedAt,
            /** Empty means every zone of this municipality, never none (CONTRACT.md v0.15). */
            List<ZoneAssignmentResponse> zones,
            Instant lastLoginAt,
            String lastLoginPortal,
            UserStatus accountStatus) {
    }

    /** A sector, named, so the panel does not have to resolve ids against another call. */
    public record ZoneAssignmentResponse(UUID zoneId, String code, String name) {
    }

    public record RejectMembershipRequest(@NotBlank @Size(max = 500) String reason) {
    }

    public record MembershipResponse(
            UUID id,
            UUID tenantId,
            UUID userId,
            Portal portal,
            Role role,
            MembershipStatus status,
            Instant requestedAt,
            Instant approvedAt,
            UUID approvedBy,
            String statusReason) {
    }

    public record AuditEventResponse(
            UUID id,
            UUID tenantId,
            UUID actorUserId,
            Portal actorPortal,
            String action,
            String resourceType,
            String resourceId,
            Instant occurredAt,
            Map<String, Object> metadata) {
    }

    public record RegisteredUsersRow(String group, long count) {
    }

    public record RegisteredUsersReportResponse(String groupBy, List<RegisteredUsersRow> rows) {
    }

    public record CreateExportRequest(
            @NotBlank @Size(max = 64) String type,
            Map<String, Object> filters) {
    }

    public record CreateExportResponse(String exportId) {
    }

    // --- languages of the municipality (CONTRACT.md v0.3) -----------------------------------------

    /**
     * One language in {@code GET|PUT /admin/settings/locales}.
     *
     * @param locale    BCP 47 tag; canonicalised by the domain before it is stored
     * @param enabled   whether citizens may pick it
     * @param isDefault whether it is this municipality\'s fallback; exactly one row carries it
     * @param sortOrder position in the dropdown; omit to keep the order sent
     */
    public record TenantLocaleItem(
            @NotBlank @Size(max = 35) String locale,
            @NotNull Boolean enabled,
            @NotNull Boolean isDefault,
            Integer sortOrder) {
    }

    /** {@code GET /admin/settings/locales}. */
    public record TenantLocalesResponse(List<TenantLocaleItem> locales, String platformDefaultLocale) {
    }

    /** {@code PUT /admin/settings/locales} — the whole list, replaced as one form. */
    public record UpdateTenantLocalesRequest(@NotNull @Valid List<TenantLocaleItem> locales) {
    }

    // --- visual identity of the municipality (CONTRACT.md v0.4) -----------------------------------

    /**
     * {@code GET|PUT /admin/settings/branding}.
     *
     * <p>{@code logoAssetKey} is what is stored and edited; {@code logoUrl} is what the same value
     * resolves to and is read-only. Returning both is what lets the admin screen show the logo it is
     * about to save without having to know how the platform resolves a key.</p>
     *
     * @param logoAssetKey {@code generated:monogram} for the built-in placeholder, or an absolute
     *                     {@code https://} address of the municipality's own emblem; null for none
     * @param brandColor   {@code #rrggbb}; {@code #abc} is accepted and expanded
     * @param shortName    what fits in a top bar; null falls back to the display name
     */
    public record TenantBrandingResponse(
            String logoAssetKey,
            String logoUrl,
            String brandColor,
            String shortName) {
    }

    /**
     * {@code PUT /admin/settings/branding} — the whole identity, replaced as one form.
     *
     * <p>A null field means "this municipality has none", not "leave the old one": clearing a logo
     * has to be possible, and a partial update would make it unexpressible.</p>
     */
    public record UpdateTenantBrandingRequest(
            @Size(max = 400) String logoAssetKey,
            @Size(max = 7) String brandColor,
            @Size(max = 40) String shortName) {
    }
}
