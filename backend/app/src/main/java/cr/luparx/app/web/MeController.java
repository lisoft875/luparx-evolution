package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.service.SessionService;
import cr.luparx.app.web.dto.AuthDtos;
import cr.luparx.app.web.dto.CatalogDtos;
import cr.luparx.app.web.dto.SessionDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.domain.Portal;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ForbiddenException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.tenant.TenantContext;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.geo.model.AddressInput;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.service.IssuedTokens;
import cr.luparx.identity.service.MfaPolicy;
import cr.luparx.identity.service.MfaService;
import cr.luparx.identity.service.MfaSetup;
import cr.luparx.identity.service.UserDirectoryService;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.entity.TenantMembership;
import cr.luparx.tenancy.repository.TenantRepository;
import cr.luparx.tenancy.service.AccessResolver;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * Profile and session of the authenticated caller (CONTRACT.md §4 "Sesión / perfil").
 *
 * <p>Every operation acts on {@code TenantContextHolder.require().userId()} — the identity the
 * verified token resolved to — never on an id taken from the path or body, which is what makes these
 * endpoints immune to IDOR by construction.</p>
 */
@RestController
@RequestMapping("/api/v1/{portal}")
@Tag(name = "Session", description = "Own profile, memberships, active municipality and MFA enrolment.")
public class MeController {

    private final UserDirectoryService userDirectoryService;
    private final AccessResolver accessResolver;
    private final TenantRepository tenantRepository;
    private final MfaService mfaService;
    private final MfaPolicy mfaPolicy;
    private final SessionService sessionService;
    private final AuditRecorder auditRecorder;
    private final ResponseMapper mapper;

    public MeController(UserDirectoryService userDirectoryService,
                        AccessResolver accessResolver,
                        TenantRepository tenantRepository,
                        MfaService mfaService,
                        MfaPolicy mfaPolicy,
                        SessionService sessionService,
                        AuditRecorder auditRecorder,
                        ResponseMapper mapper) {
        this.userDirectoryService = userDirectoryService;
        this.accessResolver = accessResolver;
        this.tenantRepository = tenantRepository;
        this.mfaService = mfaService;
        this.mfaPolicy = mfaPolicy;
        this.sessionService = sessionService;
        this.auditRecorder = auditRecorder;
        this.mapper = mapper;
    }

    @GetMapping("/me")
    @Operation(summary = "Own profile, memberships and active municipality")
    public SessionDtos.MeResponse me(@PathVariable String portal) {
        TenantContext context = requireContext(portal);
        User user = userDirectoryService.require(context.userId());
        List<TenantMembership> memberships = accessResolver.allMemberships(context.userId());
        CatalogDtos.TenantCatalogResponse activeTenant = context.tenantId() == null
                ? null
                : tenantRepository.findById(context.tenantId().value()).map(mapper::toTenantCatalog).orElse(null);
        return new SessionDtos.MeResponse(mapper.toProfile(user), mapper.toMembershipSummaries(memberships),
                activeTenant);
    }

    @PutMapping("/me")
    @Operation(summary = "Update the editable part of one's own profile")
    public SessionDtos.UserProfileResponse updateMe(@PathVariable String portal,
                                                    @Valid @RequestBody SessionDtos.UpdateProfileRequest request) {
        TenantContext context = requireContext(portal);
        AddressInput address = request.address() == null ? null : new AddressInput(
                request.address().countryCode(),
                request.address().level1Id(),
                request.address().level2Id(),
                request.address().level3Id(),
                request.address().line1(),
                request.address().line2(),
                request.address().postalCode());
        User user = userDirectoryService.updateProfile(
                context.userId(),
                request.givenName(),
                request.familyName(),
                request.secondFamilyName(),
                request.phone() == null ? null : request.phone().countryCode(),
                request.phone() == null ? null : request.phone().nationalNumber(),
                address,
                request.nationalityCode(),
                request.locale(),
                request.timeZone());
        auditRecorder.record(AuditAction.USER_UPDATED, "user", user.getId().toString(), Map.of("self", "true"));
        return mapper.toProfile(user);
    }

    @GetMapping("/me/memberships")
    @Operation(summary = "Every membership of the caller, in any status")
    public List<SessionDtos.MembershipSummaryResponse> memberships(@PathVariable String portal) {
        TenantContext context = requireContext(portal);
        return mapper.toMembershipSummaries(accessResolver.allMemberships(context.userId()));
    }

    /**
     * Switches the active municipality. The membership is validated server-side and a brand new token
     * pair is issued — a token's {@code tid} is never mutated in place (CONTRACT.md §3).
     */
    @PostMapping("/session/tenant")
    @Operation(summary = "Switch the active municipality and receive a new token pair")
    public AuthDtos.TokensEnvelope switchTenant(@PathVariable String portal,
                                                @Valid @RequestBody SessionDtos.SessionTenantRequest request,
                                                HttpServletRequest httpRequest) {
        TenantContext context = requireContext(portal);
        User user = userDirectoryService.require(context.userId());
        Tenant tenant = tenantRepository.findById(request.tenantId())
                .orElseThrow(() -> ForbiddenException.of(ErrorCode.TENANT_NOT_FOUND, "error.tenant.notFound"));
        boolean mfaSatisfied = mfaService.isActive(context.userId());
        IssuedTokens tokens = sessionService.switchTenant(user, context.portal(),
                TenantId.of(tenant.getId()), mfaSatisfied, httpRequest);
        return mapper.toTokensEnvelope(tokens);
    }

    @PostMapping("/me/mfa/setup")
    @Operation(summary = "Start TOTP enrolment; the secret and recovery codes are shown only once")
    public SessionDtos.MfaSetupResponse setupMfa(@PathVariable String portal) {
        TenantContext context = requireContext(portal);
        MfaSetup setup = mfaService.startSetup(context.userId());
        // The secret itself is never audited or logged (SECURITY.md §11).
        auditRecorder.record(AuditAction.USER_MFA_ACTIVATED, "user", context.userId().toString(),
                Map.of("stage", "setup"));
        return new SessionDtos.MfaSetupResponse(setup.secret(), setup.otpauthUri(), setup.recoveryCodes());
    }

    @PostMapping("/me/mfa/activate")
    @Operation(summary = "Confirm TOTP enrolment with a current code")
    public ResponseEntity<Void> activateMfa(@PathVariable String portal,
                                            @Valid @RequestBody SessionDtos.MfaCodeRequest request) {
        TenantContext context = requireContext(portal);
        mfaService.activate(context.userId(), request.code());
        auditRecorder.record(AuditAction.USER_MFA_ACTIVATED, "user", context.userId().toString(),
                Map.of("stage", "activated"));
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/me/mfa")
    @Operation(summary = "Disable TOTP; requires a current code or a recovery code")
    public ResponseEntity<Void> disableMfa(@PathVariable String portal,
                                           @Valid @RequestBody SessionDtos.MfaCodeRequest request) {
        TenantContext context = requireContext(portal);
        if (mfaPolicy.isEnforcedFor(context.portal())) {
            // Turning off a second factor the deployment mandates is not a user decision.
            throw ForbiddenException.of(ErrorCode.MFA_REQUIRED, "error.mfa.required");
        }
        mfaService.disable(context.userId(), request.code());
        auditRecorder.record(AuditAction.USER_MFA_DISABLED, "user", context.userId().toString(), Map.of());
        return ResponseEntity.noContent().build();
    }

    /** Guards against a token of one portal reaching another portal's route via the path variable. */
    private TenantContext requireContext(String portalSlug) {
        Portal requested = PortalPathVariable.require(portalSlug);
        TenantContext context = TenantContextHolder.require();
        if (context.portal() != requested) {
            throw ForbiddenException.of(ErrorCode.PORTAL_MISMATCH, "error.auth.portalMismatch");
        }
        return context;
    }

    /** Convenience for subclasses/tests needing the caller id without the whole context. */
    protected UserId currentUserId() {
        return TenantContextHolder.requireUserId();
    }
}
