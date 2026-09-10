package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.notification.SmtpNotificationSender;
import cr.luparx.app.web.dto.AdminDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.i18n.Locales;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContext;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.identity.port.NotificationSender;
import cr.luparx.identity.repository.UserRepository;
import cr.luparx.identity.service.Hashing;
import cr.luparx.tenancy.entity.StaffInvitation;
import cr.luparx.tenancy.model.InvitationStatus;
import cr.luparx.tenancy.service.StaffInvitationService;
import cr.luparx.tenancy.service.TenantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Inviting a member of staff (CONTRACT.md v0.27).
 *
 * <h2>Why an invitation rather than a form</h2>
 *
 * <p>Opening an account for somebody used to mean an administrator transcribing their whole
 * employment file: name, identity document, address, phone, date of birth. It works, and it puts a
 * third person in charge of spelling values that are <b>unique across the whole platform</b>. A typo
 * in a national identity number is not a formatting slip that a later edit fixes — it is the wrong
 * identity, occupying a number that belongs to somebody else, and it is discovered months later by
 * whoever tries to register with it.</p>
 *
 * <p>So the municipality states the only two things it can actually vouch for — the address it is
 * writing to and the post it is offering — and the person fills in their own particulars.</p>
 *
 * <h2>What an invitation is not</h2>
 *
 * <p>It is not a membership and it grants nothing. However long the link sits in a mailbox, the
 * authority is created when it is accepted, and by then the person exists and can be audited.</p>
 */
@RestController
@RequestMapping("/api/v1/admin/staff-invitations")
@Tag(name = "Admin · Staff invitations", description = "Posts offered to people who have no account yet.")
public class AdminStaffInvitationController {

    private final StaffInvitationService invitationService;
    private final TenantService tenantService;
    private final UserRepository userRepository;
    private final NotificationSender notificationSender;
    private final SmtpNotificationSender portalUrls;
    private final AuditRecorder auditRecorder;
    private final Clock clock;

    public AdminStaffInvitationController(StaffInvitationService invitationService,
                                          TenantService tenantService,
                                          UserRepository userRepository,
                                          NotificationSender notificationSender,
                                          SmtpNotificationSender portalUrls,
                                          AuditRecorder auditRecorder,
                                          Clock clock) {
        this.invitationService = invitationService;
        this.tenantService = tenantService;
        this.userRepository = userRepository;
        this.notificationSender = notificationSender;
        this.portalUrls = portalUrls;
        this.auditRecorder = auditRecorder;
        this.clock = clock;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('PERM_USER_READ')")
    @Operation(summary = "Invitations of the active municipality (paginated)")
    public PageResponse<AdminDtos.StaffInvitationResponse> list(
            @RequestParam(required = false) InvitationStatus status,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        PageRequest request = PageRequest.parse(page, size, null);
        return invitationService.list(tenantId, status, request).map(this::toResponse);
    }

    /**
     * Offers a post to an address that has no account yet.
     *
     * <p>An address that <b>is</b> already registered is refused with
     * {@code EMAIL_ALREADY_REGISTERED}, and that is the right answer rather than a nuisance: that
     * person needs no invitation and must not be asked for their particulars a second time. The
     * screen sends the administrator to the lookup of v0.26, which gives them the post on the account
     * they already have.</p>
     *
     * <p>Inviting an address that already has a live invitation replaces its link instead of adding a
     * second one — see {@link StaffInvitationService#invite}.</p>
     */
    @PostMapping
    @PreAuthorize("hasAuthority('PERM_ROLE_ASSIGN')")
    @Operation(summary = "Invite somebody to hold a post in the active municipality")
    public ResponseEntity<AdminDtos.StaffInvitationResponse> invite(
            @Valid @RequestBody AdminDtos.CreateStaffInvitationRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        UserId actor = TenantContextHolder.current().map(TenantContext::userId).orElse(null);
        if (userRepository.existsByEmail(request.email())) {
            throw ConflictException.of(ErrorCode.EMAIL_ALREADY_REGISTERED, "error.invitation.emailRegistered");
        }

        // The one place the plaintext token exists. It goes into the mail and is never stored, never
        // logged and never returned to the administrator: the link belongs to the invited mailbox.
        String rawToken = Hashing.randomToken();
        StaffInvitation invitation = invitationService.invite(tenantId, request.email(), request.role(),
                Hashing.sha256Hex(rawToken), actor);

        send(invitation, rawToken);
        auditRecorder.record(AuditAction.STAFF_INVITATION_SENT, "staff-invitation",
                invitation.getId().toString(),
                Map.of("role", invitation.getRole().name(), "portal", invitation.getPortal().slug()));
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(invitation));
    }

    /**
     * Sends it again, with a new link and a new deadline.
     *
     * <p>The previous link stops working. That is the honest reading of "send it again", and it is
     * also what keeps the count of ways into a post at one.</p>
     */
    @PostMapping("/{id}/resend")
    @PreAuthorize("hasAuthority('PERM_ROLE_ASSIGN')")
    @Operation(summary = "Send an invitation again; the previous link stops working")
    public AdminDtos.StaffInvitationResponse resend(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        String rawToken = Hashing.randomToken();
        StaffInvitation invitation = invitationService.reissue(tenantId, id, Hashing.sha256Hex(rawToken));
        send(invitation, rawToken);
        auditRecorder.record(AuditAction.STAFF_INVITATION_SENT, "staff-invitation", id.toString(),
                Map.of("resent", "true"));
        return toResponse(invitation);
    }

    /** Calls an invitation back before it is used. The link stops working immediately. */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('PERM_ROLE_ASSIGN')")
    @Operation(summary = "Revoke an invitation that has not been accepted")
    public AdminDtos.StaffInvitationResponse revoke(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        StaffInvitation invitation = invitationService.revoke(tenantId, id);
        auditRecorder.record(AuditAction.STAFF_INVITATION_REVOKED, "staff-invitation", id.toString(), Map.of());
        return toResponse(invitation);
    }

    /**
     * The mail, in the language of the municipality that is writing.
     *
     * <p>The recipient has no account yet, so there is no locale of theirs to honour; the
     * municipality's own is the closest true thing and is what the rest of its correspondence uses.</p>
     */
    private void send(StaffInvitation invitation, String rawToken) {
        cr.luparx.tenancy.entity.Tenant tenant = tenantService.require(invitation.tenant());
        String tenantName = tenant.getDisplayName();
        notificationSender.send(invitation.getEmail(),
                Locales.parse(tenant.getLocale()).orElse(Locale.ROOT),
                "email.staffInvitation",
                Map.of("name", "",
                        "link", portalUrls.portalBaseUrl(invitation.getPortal().slug())
                                + "/invitation/" + rawToken,
                        "tenant", tenantName == null ? "" : tenantName));
    }

    private AdminDtos.StaffInvitationResponse toResponse(StaffInvitation invitation) {
        return new AdminDtos.StaffInvitationResponse(
                invitation.getId(),
                invitation.getEmail(),
                invitation.getPortal(),
                invitation.getRole(),
                invitation.getStatus(),
                invitation.getCreatedAt(),
                invitation.getExpiresAt(),
                invitation.isExpiredAt(clock.instant()),
                invitation.getAcceptedAt(),
                invitation.getRevokedAt());
    }
}
