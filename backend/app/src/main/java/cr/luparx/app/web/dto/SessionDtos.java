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
import jakarta.validation.constraints.Past;
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

    /**
     * {@code PUT /{portal}/me} — every personal datum of CONTRACT.md §2 except the email address
     * (CONTRACT.md v0.3, "Perfil editable"). The field order is §2's, so this record, the form and
     * the registration DTO read alike.
     *
     * <p>A null section is left untouched rather than cleared: the profile is edited from several
     * screens and a client that owns one section must not wipe the others. A section that <em>is</em>
     * sent is validated in full, with the same rules registration applies.</p>
     *
     * <p>The email address is absent on purpose. Changing it is changing the identity of access, and
     * it goes through {@link ChangeEmailRequest}, confirmed from the new mailbox.</p>
     */
    public record UpdateProfileRequest(
            @NotBlank @Size(max = 100) String givenName,
            @NotBlank @Size(max = 100) String familyName,
            @Size(max = 100) String secondFamilyName,
            @Valid IdentityDocumentDto identityDocument,
            @Valid AddressDto address,
            @Valid PhoneDto phone,
            @Size(min = 2, max = 2) String nationalityCode,
            @Past LocalDate birthDate,
            @Size(max = 35) String locale,
            @Size(max = 64) String timeZone) {
    }

    /**
     * {@code POST /{portal}/me/password} (CONTRACT.md v0.3 §3).
     *
     * <p>The current password is required and is not a formality: a stolen session must not be enough
     * to lock the rightful owner out of their own account.</p>
     */
    public record ChangePasswordRequest(
            @NotBlank @Size(max = 200) String currentPassword,
            @NotBlank @Size(max = 200) String newPassword) {
    }

    /**
     * {@code POST /{portal}/me/email}. Nothing about the account moves yet: a link goes to the NEW
     * address and the change happens when it is opened from there.
     */
    public record ChangeEmailRequest(@NotBlank @Email @Size(max = 320) String newEmail) {

        /** Canonicalised in the record, exactly as registration and login do it. */
        public ChangeEmailRequest {
            newEmail = EmailAddress.normalize(newEmail);
        }
    }

    /**
     * The answer to a password change: the account's other sessions are gone and the caller is handed
     * a fresh pair, so the browser that changed the password is the one session that survives.
     */
    public record PasswordChangedResponse(AuthDtos.TokenPairResponse tokens) {
    }

    /** The answer to an email-change request: what was asked, not what has happened yet. */
    public record EmailChangeRequestedResponse(String pendingEmail) {
    }

    public record SessionTenantRequest(@NotNull UUID tenantId) {
    }

    public record MfaSetupResponse(String secret, String otpauthUri, List<String> recoveryCodes) {
    }

    public record MfaCodeRequest(@NotBlank @Size(min = 6, max = 16) String code) {
    }
}
