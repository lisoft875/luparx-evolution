package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.notification.SmtpNotificationSender;
import cr.luparx.app.outbox.OutboxRecorder;
import cr.luparx.app.service.SessionService;
import cr.luparx.app.web.dto.AuthDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.domain.Portal;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ForbiddenException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.i18n.Locales;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.outbox.OutboxEventType;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.model.UserStatus;
import cr.luparx.identity.service.AuthenticationService;
import cr.luparx.identity.service.EmailChangeService;
import cr.luparx.identity.service.EmailVerificationService;
import cr.luparx.identity.service.IssuedTokens;
import cr.luparx.identity.service.MfaService;
import cr.luparx.identity.service.PasswordAuthentication;
import cr.luparx.identity.service.PasswordResetService;
import cr.luparx.identity.service.RegistrationCommand;
import cr.luparx.identity.service.RegistrationResult;
import cr.luparx.identity.service.TokenService;
import cr.luparx.identity.service.UserRegistrationService;
import cr.luparx.identity.port.NotificationSender;
import cr.luparx.tenancy.entity.TenantMembership;
import cr.luparx.tenancy.model.MembershipStatus;
import cr.luparx.tenancy.service.MembershipService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Authentication endpoints, one root per portal (CONTRACT.md §4).
 *
 * <p>Every route here is unauthenticated by necessity, so the protections live inside: the
 * database-backed rate limiter, constant-time credential verification, and answers that never
 * disclose whether an email address exists.</p>
 */
@RestController
@RequestMapping("/api/v1/auth/{portal}")
@Tag(name = "Authentication", description = "Registration, login, MFA, refresh, logout, password and "
        + "email verification — separately per portal.")
public class AuthController {

    private final UserRegistrationService registrationService;
    private final AuthenticationService authenticationService;
    private final MembershipService membershipService;
    private final MfaService mfaService;
    private final SessionService sessionService;
    private final TokenService tokenService;
    private final EmailVerificationService emailVerificationService;
    private final EmailChangeService emailChangeService;
    private final PasswordResetService passwordResetService;
    private final NotificationSender notificationSender;
    private final SmtpNotificationSender portalUrls;
    private final AuditRecorder auditRecorder;
    private final OutboxRecorder outboxRecorder;
    private final ResponseMapper mapper;

    public AuthController(UserRegistrationService registrationService,
                          AuthenticationService authenticationService,
                          MembershipService membershipService,
                          MfaService mfaService,
                          SessionService sessionService,
                          TokenService tokenService,
                          EmailVerificationService emailVerificationService,
                          EmailChangeService emailChangeService,
                          PasswordResetService passwordResetService,
                          NotificationSender notificationSender,
                          SmtpNotificationSender portalUrls,
                          AuditRecorder auditRecorder,
                          OutboxRecorder outboxRecorder,
                          ResponseMapper mapper) {
        this.registrationService = registrationService;
        this.authenticationService = authenticationService;
        this.membershipService = membershipService;
        this.mfaService = mfaService;
        this.sessionService = sessionService;
        this.tokenService = tokenService;
        this.emailVerificationService = emailVerificationService;
        this.emailChangeService = emailChangeService;
        this.passwordResetService = passwordResetService;
        this.notificationSender = notificationSender;
        this.portalUrls = portalUrls;
        this.auditRecorder = auditRecorder;
        this.outboxRecorder = outboxRecorder;
        this.mapper = mapper;
    }

    /**
     * Self-registration. Not available on the platform portal, whose accounts are created from the
     * back-office only (CONTRACT.md §4 → {@code SELF_REGISTRATION_DISABLED}).
     */
    @PostMapping("/register")
    @Operation(summary = "Register a new person and request access to a municipality")
    public ResponseEntity<AuthDtos.RegisterResponse> register(@PathVariable String portal,
                                                              @Valid @RequestBody AuthDtos.RegisterRequest request) {
        Portal target = PortalPathVariable.require(portal);
        if (!target.selfRegistrationAllowed()) {
            throw ForbiddenException.of(ErrorCode.SELF_REGISTRATION_DISABLED, "error.registration.portal.disabled");
        }
        if (target != Portal.CITIZEN && request.tenantId() == null) {
            // An admin or inspector account is meaningless without the municipality it belongs to.
            throw new ValidationException("tenantId", ErrorCode.VALIDATION_FAILED, "error.registration.tenantRequired");
        }

        RegistrationCommand command = new RegistrationCommand(
                request.givenName(),
                request.familyName(),
                request.secondFamilyName(),
                request.identityDocument().countryCode(),
                request.identityDocument().type(),
                request.identityDocument().number(),
                request.address().countryCode(),
                request.address().level1Id(),
                request.address().level2Id(),
                request.address().level3Id(),
                request.address().line1(),
                request.address().line2(),
                request.address().postalCode(),
                request.phone().countryCode(),
                request.phone().nationalNumber(),
                request.nationalityCode(),
                request.email(),
                request.birthDate(),
                request.password(),
                request.locale(),
                request.timeZone(),
                request.acceptedTermsVersion(),
                request.tenantId(),
                target);

        RegistrationResult result = registrationService.register(command);

        boolean requiresApproval = false;
        if (request.tenantId() != null) {
            TenantMembership membership = membershipService.requestSelfRegistration(
                    result.userId(), TenantId.of(request.tenantId()), target);
            requiresApproval = membership.getStatus() == MembershipStatus.PENDING_APPROVAL;
            auditRecorder.record(AuditAction.MEMBERSHIP_REQUESTED, "membership", membership.getId().toString(),
                    TenantId.of(request.tenantId()), result.userId(), target,
                    Map.of("role", membership.getRole().name(), "status", membership.getStatus().name()));
        }

        auditRecorder.record(AuditAction.USER_REGISTERED, "user", result.userId().toString(),
                TenantId.ofNullable(request.tenantId()), result.userId(), target,
                Map.of("portal", target.slug()));
        outboxRecorder.record("user", result.userId().toString(), TenantId.ofNullable(request.tenantId()),
                OutboxEventType.USER_REGISTERED, Map.of("userId", result.userId().toString(),
                        "portal", target.slug()));

        sendVerificationEmail(request.email(), request.givenName(), request.locale(), target,
                result.emailVerificationToken());

        return ResponseEntity.status(HttpStatus.CREATED).body(new AuthDtos.RegisterResponse(
                result.userId().value(), result.status(), result.requiresEmailVerification(), requiresApproval));
    }

    @PostMapping("/login")
    @Operation(summary = "Exchange email and password for tokens, or for an MFA challenge")
    public AuthDtos.LoginResponse login(@PathVariable String portal,
                                        @Valid @RequestBody AuthDtos.LoginRequest request,
                                        HttpServletRequest httpRequest) {
        Portal target = PortalPathVariable.require(portal);
        String ip = AuditRecorder.clientIp(httpRequest);
        PasswordAuthentication authentication =
                authenticationService.authenticate(request.email(), request.password(), target, ip);
        User user = authentication.user();

        if (authentication.secondFactorRequired()) {
            String mfaToken = tokenService.issueMfaChallengeToken(user.userId(), target);
            auditRecorder.record(AuditAction.LOGIN_SUCCEEDED, "session", user.getId().toString(), null,
                    user.userId(), target, Map.of("stage", "password", "mfa", "pending"));
            return new AuthDtos.LoginResponse(null, null, null, true, mfaToken, false);
        }

        IssuedTokens tokens = sessionService.issue(user, target, null, false, httpRequest);
        auditRecorder.record(AuditAction.LOGIN_SUCCEEDED, "session", user.getId().toString(), null,
                user.userId(), target, Map.of("stage", "complete",
                        "mfaEnrolmentRequired", String.valueOf(authentication.enrolmentRequired())));
        return new AuthDtos.LoginResponse(tokens.accessToken(), tokens.refreshToken(), tokens.expiresIn(),
                false, null, authentication.enrolmentRequired());
    }

    @PostMapping("/mfa/verify")
    @Operation(summary = "Complete a login by answering the TOTP (or recovery code) challenge")
    public AuthDtos.TokensEnvelope verifyMfa(@PathVariable String portal,
                                             @Valid @RequestBody AuthDtos.MfaVerifyRequest request,
                                             HttpServletRequest httpRequest) {
        Portal target = PortalPathVariable.require(portal);
        UserId userId = tokenService.verifyMfaChallengeToken(request.mfaToken(), target);
        if (!mfaService.verifyCode(userId, request.code())) {
            throw cr.luparx.core.error.UnauthorizedException.of(ErrorCode.INVALID_MFA_CODE, "error.mfa.code.invalid");
        }
        User user = authenticationService.requireUser(userId);
        IssuedTokens tokens = sessionService.issue(user, target, null, true, httpRequest);
        auditRecorder.record(AuditAction.LOGIN_SUCCEEDED, "session", user.getId().toString(), null, userId,
                target, Map.of("stage", "mfa"));
        return mapper.toTokensEnvelope(tokens);
    }

    @PostMapping("/refresh")
    @Operation(summary = "Rotate a refresh token and obtain a new access token")
    public AuthDtos.TokensEnvelope refresh(@PathVariable String portal,
                                           @Valid @RequestBody AuthDtos.RefreshRequest request,
                                           HttpServletRequest httpRequest) {
        Portal target = PortalPathVariable.require(portal);
        UserId userId = sessionService.ownerOf(request.refreshToken(), target);
        User user = authenticationService.requireUser(userId);
        if (user.getStatus() == UserStatus.BLOCKED) {
            throw cr.luparx.core.error.UnauthorizedException.of(ErrorCode.ACCOUNT_BLOCKED, "error.auth.blocked");
        }
        boolean mfaSatisfied = mfaService.isActive(userId);
        IssuedTokens tokens = sessionService.refresh(request.refreshToken(), target, user, mfaSatisfied, httpRequest);
        return mapper.toTokensEnvelope(tokens);
    }

    @PostMapping("/logout")
    @Operation(summary = "Revoke the presented refresh token")
    public ResponseEntity<Void> logout(@PathVariable String portal,
                                       @Valid @RequestBody AuthDtos.LogoutRequest request) {
        Portal target = PortalPathVariable.require(portal);
        sessionService.logout(request.refreshToken(), target);
        return ResponseEntity.noContent().build();
    }

    /**
     * Always answers 202, whether or not the address is registered: a different answer would be an
     * account-enumeration oracle (SECURITY.md §2).
     */
    @PostMapping("/password/forgot")
    @Operation(summary = "Request a password reset link")
    public ResponseEntity<Void> forgotPassword(@PathVariable String portal,
                                               @Valid @RequestBody AuthDtos.ForgotPasswordRequest request) {
        Portal target = PortalPathVariable.require(portal);
        Optional<PasswordResetService.Issued> issued = passwordResetService.requestReset(request.email());
        issued.ifPresent(value -> notificationSender.send(
                value.user().getEmail(),
                localeOf(value.user().getLocale()),
                "email.passwordReset",
                Map.of("name", value.user().getGivenName(),
                        "link", portalUrls.portalBaseUrl(target.slug()) + "/password/reset?token=" + value.token())));
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/password/reset")
    @Operation(summary = "Set a new password using a reset token")
    public ResponseEntity<Void> resetPassword(@PathVariable String portal,
                                              @Valid @RequestBody AuthDtos.ResetPasswordRequest request) {
        Portal target = PortalPathVariable.require(portal);
        User user = passwordResetService.reset(request.token(), request.newPassword());
        auditRecorder.record(AuditAction.USER_PASSWORD_CHANGED, "user", user.getId().toString(), null,
                user.userId(), target, Map.of());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/email/verify")
    @Operation(summary = "Confirm ownership of the registered email address")
    public ResponseEntity<Void> verifyEmail(@PathVariable String portal,
                                            @Valid @RequestBody AuthDtos.VerifyEmailRequest request) {
        Portal target = PortalPathVariable.require(portal);
        User user = emailVerificationService.verify(request.token());
        auditRecorder.record(AuditAction.USER_EMAIL_VERIFIED, "user", user.getId().toString(), null,
                user.userId(), target, Map.of());
        outboxRecorder.record("user", user.getId().toString(), null, OutboxEventType.USER_EMAIL_VERIFIED,
                Map.of("userId", user.getId().toString()));
        return ResponseEntity.noContent().build();
    }

    /**
     * Completes a change of email address started from the profile (CONTRACT.md v0.3, "Perfil
     * editable").
     *
     * <p>It lives on the unauthenticated auth chain, next to {@code /email/verify}, because the link
     * is opened in the <b>new</b> mailbox — very possibly on a device that has never signed in. The
     * single-use token is the authorisation.</p>
     *
     * <p>Confirming replaces the address, marks it verified (the token proved the mailbox is
     * readable) and revokes every session of that person: from this moment the account answers to a
     * different identity, and a session opened under the old one has no business surviving.</p>
     */
    @PostMapping("/email/change/confirm")
    @Operation(summary = "Confirm a change of email address from the new mailbox")
    public ResponseEntity<Void> confirmEmailChange(@PathVariable String portal,
                                                   @Valid @RequestBody AuthDtos.ConfirmEmailChangeRequest request) {
        Portal target = PortalPathVariable.require(portal);
        User user = emailChangeService.confirm(request.token());
        auditRecorder.record(AuditAction.USER_EMAIL_CHANGED, "user", user.getId().toString(), null,
                user.userId(), target, Map.of("email", user.getEmail()));
        outboxRecorder.record("user", user.getId().toString(), null, OutboxEventType.USER_EMAIL_VERIFIED,
                Map.of("userId", user.getId().toString(), "reason", "emailChanged"));
        return ResponseEntity.noContent().build();
    }

    // --- helpers ---------------------------------------------------------------------------------

    private void sendVerificationEmail(String email, String givenName, String locale, Portal portal, String token) {
        notificationSender.send(
                email,
                localeOf(locale),
                "email.verifyEmail",
                Map.of("name", givenName == null ? "" : givenName,
                        "link", portalUrls.portalBaseUrl(portal.slug()) + "/email/verify?token=" + token));
    }

    private Locale localeOf(String tag) {
        return Locales.parse(tag).orElse(Locale.ROOT);
    }
}
