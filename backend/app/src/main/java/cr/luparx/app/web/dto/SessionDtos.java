package cr.luparx.app.web.dto;

import cr.luparx.app.web.dto.AuthDtos.AddressDto;
import cr.luparx.app.web.dto.AuthDtos.IdentityDocumentDto;
import cr.luparx.app.web.dto.AuthDtos.PhoneDto;
import cr.luparx.core.domain.Portal;
import cr.luparx.core.domain.Role;
import cr.luparx.identity.model.UserStatus;
import cr.luparx.tenancy.model.MembershipStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Wire shapes of {@code /api/v1/{portal}/me} and the session endpoints (CONTRACT.md §4). */
public final class SessionDtos {

    private SessionDtos() {
    }

    public record UserProfileResponse(
            UUID id,
            String email,
            boolean emailVerified,
            String givenName,
            String familyName,
            String secondFamilyName,
            LocalDate birthDate,
            String nationalityCode,
            PhoneDto phone,
            IdentityDocumentDto identityDocument,
            AddressDto address,
            String locale,
            String timeZone,
            UserStatus status,
            boolean mfaRequired,
            boolean mfaEnabled) {
    }

    public record MembershipSummaryResponse(
            UUID id,
            UUID tenantId,
            String tenantName,
            Portal portal,
            Role role,
            MembershipStatus status) {
    }

    public record MeResponse(
            UserProfileResponse user,
            List<MembershipSummaryResponse> memberships,
            CatalogDtos.TenantCatalogResponse activeTenant) {
    }

    /** {@code PUT /{portal}/me}: only the editable subset of CONTRACT.md §2. */
    public record UpdateProfileRequest(
            @NotBlank @Size(max = 100) String givenName,
            @NotBlank @Size(max = 100) String familyName,
            @Size(max = 100) String secondFamilyName,
            @Valid AddressDto address,
            @Valid PhoneDto phone,
            @Size(min = 2, max = 2) String nationalityCode,
            @Size(max = 35) String locale,
            @Size(max = 64) String timeZone) {
    }

    public record SessionTenantRequest(@NotNull UUID tenantId) {
    }

    public record MfaSetupResponse(String secret, String otpauthUri, List<String> recoveryCodes) {
    }

    public record MfaCodeRequest(@NotBlank @Size(min = 6, max = 16) String code) {
    }
}
