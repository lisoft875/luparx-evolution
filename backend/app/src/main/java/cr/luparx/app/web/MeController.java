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
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.tenant.TenantContext;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.port.NotificationSender;
import cr.luparx.identity.service.EmailChangeService;
import cr.luparx.identity.service.IssuedTokens;
import cr.luparx.identity.service.MfaPolicy;
import cr.luparx.identity.service.MfaService;
import cr.luparx.identity.service.MfaSetup;
import cr.luparx.identity.service.PasswordChangeService;
import cr.luparx.identity.service.ProfileUpdateCommand;
import cr.luparx.identity.service.UserDirectoryService;
import cr.luparx.identity.service.UserProfileService;
import cr.luparx.app.notification.SmtpNotificationSender;
import cr.luparx.tenancy.service.EffectiveLocaleService;
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
    private final UserProfileService userProfileService;
    private final PasswordChangeService passwordChangeService;
    private final EmailChangeService emailChangeService;
    private final EffectiveLocaleService effectiveLocaleService;
    private final NotificationSender notificationSender;
    private final SmtpNotificationSender portalUrls;
    private final AccessResolver accessResolver;
    private final TenantRepository tenantRepository;
    private final MfaService mfaService;
    private final MfaPolicy mfaPolicy;
    private final SessionService sessionService;
    private final AuditRecorder auditRecorder;
    private final ResponseMapper mapper;

    public MeController(UserDirectoryService userDirectoryService,
                        UserProfileService userProfileService,
                        PasswordChangeService passwordChangeService,
                        EmailChangeService emailChangeService,
                        EffectiveLocaleService effectiveLocaleService,
                        NotificationSender notificationSender,
                        SmtpNotificationSender portalUrls,
                        AccessResolver accessResolver,
                        TenantRepository tenantRepository,
                        MfaService mfaService,
                        MfaPolicy mfaPolicy,
                        SessionService sessionService,
                        AuditRecorder auditRecorder,
                        ResponseMapper mapper) {
        this.userDirectoryService = userDirectoryService;
        this.userProfileService = userProfileService;
        this.passwordChangeService = passwordChangeService;
        this.emailChangeService = emailChangeService;
        this.effectiveLocaleService = effectiveLocaleService;
        this.notificationSender = notificationSender;
        this.portalUrls = portalUrls;
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

    /**
     * Every personal datum of CONTRACT.md §2 except the email address (v0.3, "Perfil editable").
     *
     * <p>The controller does no validating of its own beyond the structural annotations: the rules
     * are {@link UserProfileService}'s, and they are the rules registration applies. A preferred
     * language the active municipality does not offer is refused here rather than stored, because a
     * stored preference nobody can serve is a silent downgrade the citizen never asked for.</p>
     */
    @PutMapping("/me")
    @Operation(summary = "Update one's own profile: name, document, address, phone, nationality, birth date")
    public SessionDtos.UserProfileResponse updateMe(@PathVariable String portal,
                                                    @Valid @RequestBody SessionDtos.UpdateProfileRequest request) {
        TenantContext context = requireContext(portal);
        if (request.locale() != null && !request.locale().isBlank() && context.tenantId() != null
                && !effectiveLocaleService.isOfferedBy(context.tenantId(), request.locale())) {
            throw new ValidationException("locale", ErrorCode.LOCALE_NOT_SUPPORTED, "error.locale.notOffered");
        }
        ProfileUpdateCommand command = new ProfileUpdateCommand(
                request.givenName(),
                request.familyName(),
                request.secondFamilyName(),
                request.identityDocument() == null ? null : request.identityDocument().countryCode(),
                request.identityDocument() == null ? null : request.identityDocument().type(),
                request.identityDocument() == null ? null : request.identityDocument().number(),
                request.address() == null ? null : request.address().countryCode(),
                request.address() == null ? null : request.address().level1Id(),
                request.address() == null ? null : request.address().level2Id(),
                request.address() == null ? null : request.address().level3Id(),
                request.address() == null ? null : request.address().line1(),
                request.address() == null ? null : request.address().line2(),
                request.address() == null ? null : request.address().postalCode(),
                request.phone() == null ? null : request.phone().countryCode(),
                request.phone() == null ? null : request.phone().nationalNumber(),
                request.nationalityCode(),
                request.birthDate(),
                request.locale(),
                request.timeZone());
        User user = userProfileService.update(context.userId(), command);
        // What changed is audited by section, never by value: an audit row must not become a second
        // copy of somebody's identity document (SECURITY.md §11).
        auditRecorder.record(AuditAction.USER_UPDATED, "user", user.getId().toString(),
                Map.of("self", "true",
                        "document", String.valueOf(request.identityDocument() != null),
                        "address", String.valueOf(request.address() != null),
                        "phone", String.valueOf(request.phone() != null),
                        "birthDate", String.valueOf(request.birthDate() != null)));
        return mapper.toProfile(user);
    }

    /**
     * Changes one's own password (CONTRACT.md v0.3 §3).
     *
     * <p>Every other session of this person is revoked and {@code credentials_version} is bumped, so
     * a token issued before this moment stops being accepted on its next call. That matters more now
     * than it used to: since v0.3 a refresh token does not expire on its own, so a password change is
     * one of the few things that actually ends a session, and it has to reach the device the password
     * is being changed because of.</p>
     *
     * <p>The caller is handed a brand new pair rather than being signed out with everybody else. The
     * browser doing the change proved it holds the current password one line ago; making that person
     * log in again would teach them that changing a password is a chore, which is how weak passwords
     * survive.</p>
     */
    @PostMapping("/me/password")
    @Operation(summary = "Change one's own password; every other session is revoked")
    public SessionDtos.PasswordChangedResponse changePassword(
            @PathVariable String portal,
            @Valid @RequestBody SessionDtos.ChangePasswordRequest request,
            HttpServletRequest httpRequest) {
        TenantContext context = requireContext(portal);
        User user = passwordChangeService.change(context.userId(), request.currentPassword(),
                request.newPassword());
        auditRecorder.record(AuditAction.USER_PASSWORD_CHANGED, "user", user.getId().toString(),
                Map.of("self", "true"));
        IssuedTokens tokens = sessionService.issue(user, context.portal(), context.tenantId(),
                mfaService.isActive(context.userId()), httpRequest);
        return new SessionDtos.PasswordChangedResponse(mapper.toTokensEnvelope(tokens).tokens());
    }

    /**
     * Starts a change of email address (CONTRACT.md v0.3, "Perfil editable").
     *
     * <p>Nothing about the account moves here. A single-use link is sent to the <b>new</b> address and
     * the change happens when it is opened from there — proving the person can read the mailbox they
     * are asking to move to. Sending it to the old address instead would prove nothing about the new
     * one, and letting a {@code PUT} do it would let anyone holding a session redirect password
     * recovery to a mailbox of their own.</p>
     */
    @PostMapping("/me/email")
    @Operation(summary = "Request a change of email address; confirmed from the new mailbox")
    public SessionDtos.EmailChangeRequestedResponse changeEmail(
            @PathVariable String portal,
            @Valid @RequestBody SessionDtos.ChangeEmailRequest request) {
        TenantContext context = requireContext(portal);
        EmailChangeService.Requested requested =
                emailChangeService.request(context.userId(), request.newEmail());
        notificationSender.send(
                requested.newEmail(),
                effectiveLocaleService.resolve(requested.user().getLocale(), context.tenantId()),
                "email.changeEmail",
                Map.of("name", requested.user().getGivenName(),
                        "link", portalUrls.portalBaseUrl(context.portal().slug())
                                + "/email/change/confirm?token=" + requested.token()));
        // The address it is moving TO is the point of the row; it is the person's own datum and the
        // only thing that makes this trail readable when they later ask what happened to their login.
        auditRecorder.record(AuditAction.USER_EMAIL_CHANGE_REQUESTED, "user",
                requested.user().getId().toString(), Map.of("newEmail", requested.newEmail()));
        return new SessionDtos.EmailChangeRequestedResponse(requested.newEmail());
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
        // The municipality that was switched to travels back with the tokens, branding included: the
        // client has to repaint the chip next to the LupaRX logo the moment the switch succeeds, and
        // sending it back to the catalogue to learn what it just chose would be a round trip for
        // something the server already has in its hand.
        return new AuthDtos.TokensEnvelope(mapper.toTokenPair(tokens), mapper.toTenantCatalog(tenant));
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
