package cr.luparx.app.web.dto;

import cr.luparx.core.email.EmailAddress;
import cr.luparx.geo.model.IdentityDocumentTypeCode;
import cr.luparx.identity.model.UserStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Wire shapes of {@code /api/v1/auth/{portal}/**} (CONTRACT.md §4).
 *
 * <p>{@link RegisterRequest} follows the field order of CONTRACT.md §2 exactly, because that order is
 * normative for both the DTO and the UI. Bean Validation here is a fast structural check only — every
 * rule that matters (document pattern, address consistency, phone validity, minimum age, uniqueness)
 * is re-applied by the domain services (CONTRACT.md §7).</p>
 */
public final class AuthDtos {

    private AuthDtos() {
    }

    public record IdentityDocumentDto(
            @NotBlank @Size(min = 2, max = 2) String countryCode,
            @NotNull IdentityDocumentTypeCode type,
            @NotBlank @Size(max = 64) String number) {
    }

    public record AddressDto(
            @NotBlank @Size(min = 2, max = 2) String countryCode,
            UUID level1Id,
            UUID level2Id,
            UUID level3Id,
            @NotBlank @Size(max = 200) String line1,
            @Size(max = 200) String line2,
            @Size(max = 32) String postalCode) {
    }

    public record PhoneDto(
            @NotBlank @Size(min = 2, max = 2) String countryCode,
            @NotBlank @Size(max = 32) String nationalNumber) {
    }

    /** {@code POST /auth/{portal}/register} — field order is normative (CONTRACT.md §2). */
    public record RegisterRequest(
            @NotBlank @Size(max = 100) String givenName,
            @NotBlank @Size(max = 100) String familyName,
            @Size(max = 100) String secondFamilyName,
            @NotNull @Valid IdentityDocumentDto identityDocument,
            @NotNull @Valid AddressDto address,
            @NotNull @Valid PhoneDto phone,
            @NotBlank @Size(min = 2, max = 2) String nationalityCode,
            @NotBlank @Email @Size(max = 320) String email,
            @NotNull @Past LocalDate birthDate,
            @NotBlank @Size(max = 200) String password,
            @Size(max = 35) String locale,
            @Size(max = 64) String timeZone,
            @Size(max = 32) String acceptedTermsVersion,
            UUID tenantId) {

        /**
         * The address is canonicalised before any validation runs: a leading space from autofill or
         * a capitalised spelling is the same mailbox, and refusing it (or storing a second variant of
         * it) would be a defect, not a security measure. Normalising in the record itself means every
         * caller of this DTO gets it, without repeating the rule in each controller.
         */
        public RegisterRequest {
            email = EmailAddress.normalize(email);
        }
    }

    public record RegisterResponse(
            UUID userId,
            UserStatus status,
            boolean requiresEmailVerification,
            boolean requiresApproval) {
    }

    public record LoginRequest(
            @NotBlank @Size(max = 320) String email,
            @NotBlank @Size(max = 200) String password) {

        /**
         * The address is canonicalised before any validation runs: a leading space from autofill or
         * a capitalised spelling is the same mailbox, and refusing it (or storing a second variant of
         * it) would be a defect, not a security measure. Normalising in the record itself means every
         * caller of this DTO gets it, without repeating the rule in each controller.
         */
        public LoginRequest {
            email = EmailAddress.normalize(email);
        }
    }

    /**
     * {@code POST /auth/{portal}/login}. Either the tokens are present, or {@code mfaRequired} is
     * true and {@code mfaToken} carries the short-lived challenge — never both.
     */
    public record LoginResponse(
            String accessToken,
            String refreshToken,
            Long expiresIn,
            boolean mfaRequired,
            String mfaToken,
            boolean mfaEnrolmentRequired) {
    }

    public record TokenPairResponse(String accessToken, String refreshToken, long expiresIn) {
    }

    /**
     * Envelope used by the endpoints the contract documents as returning {@code {tokens}}.
     *
     * <p>{@code activeTenant} travels with it since v0.4 so that switching municipality answers with
     * the municipality that was switched to — name, logo and colour included. The client has to
     * repaint the chip next to the LupaRX logo the moment the switch succeeds, and making it fetch
     * the catalogue again to learn what it just chose would be a round trip for information the
     * server already had in its hand. Null on the endpoints that issue a session without one.</p>
     */
    public record TokensEnvelope(TokenPairResponse tokens, CatalogDtos.TenantCatalogResponse activeTenant) {

        public TokensEnvelope(TokenPairResponse tokens) {
            this(tokens, null);
        }
    }

    public record MfaVerifyRequest(
            @NotBlank String mfaToken,
            @NotBlank @Size(min = 6, max = 16) String code) {
    }

    public record RefreshRequest(@NotBlank String refreshToken) {
    }

    public record LogoutRequest(@NotBlank String refreshToken) {
    }

    public record ForgotPasswordRequest(@NotBlank @Size(max = 320) String email) {

        /** Same canonicalisation as login: the address a person types here must find their account. */
        public ForgotPasswordRequest {
            email = EmailAddress.normalize(email);
        }
    }

    public record ResetPasswordRequest(
            @NotBlank String token,
            @NotBlank @Size(max = 200) String newPassword) {
    }

    public record VerifyEmailRequest(@NotBlank String token) {
    }

    /**
     * {@code POST /auth/{portal}/email/change/confirm} — completes a change started from the profile
     * (CONTRACT.md v0.3, "Perfil editable").
     *
     * <p>Unauthenticated on purpose: the link is opened in the NEW mailbox, which may well be on a
     * device that has never signed in. The token is the authorisation, and it is single-use.</p>
     */
    public record ConfirmEmailChangeRequest(@NotBlank String token) {
    }
}
