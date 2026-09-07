package cr.luparx.app.web.dto;

import cr.luparx.core.domain.Role;
import cr.luparx.tenancy.model.SelfRegistrationPolicy;
import cr.luparx.tenancy.model.TenantStatus;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Wire shapes of the platform back-office {@code /api/v1/platform/**} (CONTRACT.md §4). */
public final class PlatformDtos {

    private PlatformDtos() {
    }

    public record CreateTenantRequest(
            @NotBlank @Size(max = 64) @Pattern(regexp = "^[a-z0-9]+(-[a-z0-9]+)*$") String slug,
            @NotBlank @Size(max = 200) String legalName,
            @NotBlank @Size(max = 160) String displayName,
            @NotBlank @Size(min = 2, max = 2) String countryCode,
            @NotBlank @Size(min = 3, max = 3) String currencyCode,
            @NotBlank @Size(max = 35) String locale,
            @NotBlank @Size(max = 64) String timeZone,
            SelfRegistrationPolicy selfRegistrationPolicy) {
    }

    public record UpdateTenantRequest(
            @NotBlank @Size(max = 200) String legalName,
            @NotBlank @Size(max = 160) String displayName,
            @NotBlank @Size(min = 3, max = 3) String currencyCode,
            @NotBlank @Size(max = 35) String locale,
            @NotBlank @Size(max = 64) String timeZone,
            SelfRegistrationPolicy selfRegistrationPolicy) {
    }

    public record TenantStatusRequest(
            @NotNull TenantStatus status,
            @Size(max = 500) String reason) {
    }

    public record TenantResponse(
            UUID id,
            String slug,
            String name,
            String legalName,
            String countryCode,
            String currencyCode,
            String locale,
            String timeZone,
            TenantStatus status,
            SelfRegistrationPolicy selfRegistrationPolicy,
            Instant createdAt) {
    }

    public record TenantSettingResponse(String key, Map<String, Object> value, Instant updatedAt) {
    }

    public record TenantSettingRequest(
            @NotBlank @Size(max = 128) String key,
            @NotNull Map<String, Object> value) {
    }

    /** {@code POST /platform/tenants/{id}/admins}: creates or invites the first TENANT_ADMIN. */
    public record CreateTenantAdminRequest(
            @NotBlank @Email @Size(max = 320) String email,
            Role role) {
    }

    public record CreateTenantAdminResponse(
            UUID userId,
            UUID membershipId,
            boolean invitationSent,
            boolean userCreated) {
    }

    public record FeatureFlagsResponse(Map<String, Boolean> flags) {
    }

    public record JobsResponse(List<JobStatus> jobs) {
    }

    public record JobStatus(String name, String state, Instant lastRunAt, long pending) {
    }
}
