package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.outbox.OutboxRecorder;
import cr.luparx.app.web.dto.AdminDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.outbox.OutboxEventType;
import cr.luparx.identity.service.EmailVerificationService;
import cr.luparx.identity.service.Hashing;
import cr.luparx.identity.service.RegistrationCommand;
import cr.luparx.identity.service.RegistrationResult;
import cr.luparx.identity.service.UserRegistrationService;
import cr.luparx.tenancy.entity.StaffInvitation;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.entity.TenantMembership;
import cr.luparx.tenancy.model.MembershipStatus;
import cr.luparx.tenancy.service.MembershipService;
import cr.luparx.tenancy.service.StaffInvitationService;
import cr.luparx.tenancy.service.TenantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Accepting a staff invitation (CONTRACT.md v0.27). <b>Unauthenticated</b>, like the password-reset
 * routes: the person following the link has no account yet — that is the whole point.
 *
 * <h2>What the token is allowed to do</h2>
 *
 * <p>Exactly one thing: create the account the invitation was addressed to, and give it the post the
 * invitation named. It is a one-time capability and every part of the outcome comes from the stored
 * invitation, never from the request:</p>
 *
 * <ul>
 *   <li><b>the email</b> is the invited address, and the request body has no email field at all.
 *       Otherwise an invitation would be a way to open an account on somebody else's mailbox;</li>
 *   <li><b>the municipality and the role</b> are the invited ones, so a body cannot ask for a better
 *       post than the one offered;</li>
 *   <li><b>the password</b> is the person's own and nobody else ever sees it — the same reason an
 *       administrator may not set one when creating an account by hand.</li>
 * </ul>
 *
 * <p>The account is created verified. Following a link that was mailed to that address is proof of
 * the mailbox — the same proof a verification mail asks for — and sending a second "confirm your
 * address" message after it would be asking twice for something already given.</p>
 */
@RestController
@RequestMapping("/api/v1/invitations")
@Tag(name = "Invitations", description = "Accepting a post offered by a municipality. No authentication.")
public class InvitationController {

    private final StaffInvitationService invitationService;
    private final TenantService tenantService;
    private final MembershipService membershipService;
    private final UserRegistrationService registrationService;
    private final EmailVerificationService emailVerificationService;
    private final AuditRecorder auditRecorder;
    private final OutboxRecorder outboxRecorder;

    public InvitationController(StaffInvitationService invitationService,
                                TenantService tenantService,
                                MembershipService membershipService,
                                UserRegistrationService registrationService,
                                EmailVerificationService emailVerificationService,
                                AuditRecorder auditRecorder,
                                OutboxRecorder outboxRecorder) {
        this.invitationService = invitationService;
        this.tenantService = tenantService;
        this.membershipService = membershipService;
        this.registrationService = registrationService;
        this.emailVerificationService = emailVerificationService;
        this.auditRecorder = auditRecorder;
        this.outboxRecorder = outboxRecorder;
    }

    /**
     * What the invitation says, so the page can be drawn before anything is typed.
     *
     * <p>The municipality, the post and the address it was sent to — enough for the person to see
     * that it is meant for them. Nothing about who invited them and nothing about the municipality's
     * staff: whoever holds this link has authenticated as nobody.</p>
     */
    @GetMapping("/{token}")
    @Operation(summary = "What a staff invitation offers, for the acceptance page")
    public AdminDtos.InvitationPreviewResponse preview(@PathVariable String token) {
        StaffInvitation invitation = invitationService.requireUsable(Hashing.sha256Hex(token));
        Tenant tenant = tenantService.require(invitation.tenant());
        return new AdminDtos.InvitationPreviewResponse(
                tenant.getDisplayName(),
                invitation.getEmail(),
                invitation.getPortal(),
                invitation.getRole(),
                invitation.getExpiresAt());
    }

    /**
     * Creates the account and the post, in one transaction.
     *
     * <p>One transaction on purpose: an account created without its post would leave somebody able to
     * sign in with no authority and no way to explain it, and a post granted to an account that was
     * not written is impossible. Either both exist or neither does, and the invitation is marked used
     * inside the same boundary so a double submit cannot produce two accounts.</p>
     */
    @PostMapping("/{token}/accept")
    @Transactional
    @Operation(summary = "Accept an invitation: create the account and the post it offers")
    public ResponseEntity<AdminDtos.AcceptInvitationResponse> accept(
            @PathVariable String token,
            @Valid @RequestBody AdminDtos.AcceptInvitationRequest request) {
        StaffInvitation invitation = invitationService.requireUsable(Hashing.sha256Hex(token));
        Tenant tenant = tenantService.requireActive(invitation.tenant());
        TenantId tenantId = invitation.tenant();

        RegistrationCommand command = new RegistrationCommand(
                request.givenName(),
                request.familyName(),
                request.secondFamilyName(),
                request.identityDocument().countryCode(),
                request.identityDocument().type(),
                request.identityDocument().number(),
                // La dirección es opcional desde la v0.42 (V40_0): el formulario dejó de pedirla
                // y estos endpoints comparten esos campos. Sin la guarda, un registro sin
                // dirección terminaría en NullPointerException en vez de en una cuenta creada.
                request.address() == null ? null : request.address().countryCode(),
                request.address() == null ? null : request.address().level1Id(),
                request.address() == null ? null : request.address().level2Id(),
                request.address() == null ? null : request.address().level3Id(),
                request.address() == null ? null : request.address().line1(),
                request.address() == null ? null : request.address().line2(),
                request.address() == null ? null : request.address().postalCode(),
                request.phone().countryCode(),
                request.phone().nationalNumber(),
                request.nationalityCode(),
                // From the invitation, never from the body: see the class comment.
                invitation.getEmail(),
                request.birthDate(),
                request.password(),
                request.locale(),
                request.timeZone(),
                null,
                tenantId.value(),
                invitation.getPortal());

        // createByOperator rather than register: the invited portals are exactly the ones that do not
        // self-register (CONTRACT.md v0.13), and what stands in for that gate here is the invitation
        // itself. The password is the person's own, which is what makes this not an operator-opened
        // account despite the method's name.
        RegistrationResult result = registrationService.createByOperator(command);

        // Following a link mailed to that address already proved the mailbox, so the token that was
        // just issued is consumed here instead of being sent out as a second "confirm your address".
        emailVerificationService.verify(result.emailVerificationToken());

        TenantMembership membership = membershipService.create(result.userId(), tenantId,
                invitation.getPortal(), invitation.getRole(), MembershipStatus.ACTIVE);
        invitationService.markAccepted(invitation.getId(), result.userId());

        // The actor is the invited person themselves — there is no session yet, so the recorder is
        // told explicitly rather than reading a context that is empty.
        auditRecorder.record(AuditAction.STAFF_INVITATION_ACCEPTED, "staff-invitation",
                invitation.getId().toString(), tenantId, result.userId(), invitation.getPortal(),
                Map.of("role", invitation.getRole().name(), "membershipId", membership.getId().toString()));
        outboxRecorder.record("user", result.userId().toString(), tenantId, OutboxEventType.USER_REGISTERED,
                Map.of("userId", result.userId().toString(), "portal", invitation.getPortal().slug()));

        return ResponseEntity.status(HttpStatus.CREATED).body(new AdminDtos.AcceptInvitationResponse(
                result.userId().value(),
                invitation.getPortal(),
                invitation.getRole(),
                tenant.getDisplayName()));
    }
}
