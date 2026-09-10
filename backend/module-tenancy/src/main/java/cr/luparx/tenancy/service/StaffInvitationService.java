package cr.luparx.tenancy.service;

import cr.luparx.core.domain.Role;
import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.tenancy.entity.StaffInvitation;
import cr.luparx.tenancy.model.InvitationStatus;
import cr.luparx.tenancy.repository.StaffInvitationRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * The lifecycle of a staff invitation (CONTRACT.md v0.27).
 *
 * <p>This service never sees the token in clear. The caller mints it, keeps it for the email, and
 * hands over only its hash — so the module that stores invitations is structurally incapable of
 * leaking the secret it stores, and there is exactly one place in the codebase where the plaintext
 * exists.</p>
 *
 * <p>It also knows nothing about users, accounts or registration: accepting an invitation creates a
 * person, and that is the identity module's business, composed by the application layer. What lives
 * here is only the promise and its state, which is what keeps tenancy extractable as a service.</p>
 */
@Service
public class StaffInvitationService {

    /**
     * How long an invitation stays usable. Long enough for somebody who is starting a job next week,
     * short enough that a link forgotten in an inbox is not a permanent way in.
     */
    public static final Duration TTL = Duration.ofDays(14);

    private final StaffInvitationRepository invitationRepository;
    private final TenantService tenantService;
    private final Clock clock;

    public StaffInvitationService(StaffInvitationRepository invitationRepository,
                                  TenantService tenantService,
                                  Clock clock) {
        this.invitationRepository = invitationRepository;
        this.tenantService = tenantService;
        this.clock = clock;
    }

    /**
     * Offers a post to an address.
     *
     * <p>Re-inviting an address that already has a live invitation <b>replaces its token</b> instead
     * of adding a row: two live invitations are two working ways into the same post, and revoking the
     * one an administrator can see would leave the other one open. The old link stops working the
     * moment the new one is sent, which is the honest reading of "send it again".</p>
     *
     * <p>The role must be one a municipal administrator may hand out; that ceiling is checked here as
     * well as at the endpoint, because an invitation is a grant with a delay and the delay must not
     * be a way around the rule.</p>
     */
    @Transactional
    public StaffInvitation invite(TenantId tenantId, String normalizedEmail, Role role, String tokenHash,
                                  UserId invitedBy) {
        tenantService.requireActive(tenantId);
        requireGrantable(role);
        Instant now = clock.instant();
        Instant expiresAt = now.plus(TTL);

        return invitationRepository
                .findByTenantIdAndEmailAndStatus(tenantId.value(), normalizedEmail, InvitationStatus.PENDING)
                .map(existing -> {
                    existing.reissue(tokenHash, now, expiresAt);
                    return existing;
                })
                .orElseGet(() -> invitationRepository.save(new StaffInvitation(Uuid7.generate(),
                        tenantId.value(), normalizedEmail, role, tokenHash, invitedBy.value(), now, expiresAt)));
    }

    /**
     * The invitation behind a link, or nothing.
     *
     * <p>Answers only for a usable one. An invitation that was revoked, already accepted or has run
     * out of time is reported through {@link #requireUsable}, which distinguishes the cases for a
     * person who is looking at a link and needs to know whether to ask for a new one.</p>
     */
    @Transactional(readOnly = true)
    public StaffInvitation requireUsable(String tokenHash) {
        StaffInvitation invitation = invitationRepository.findByTokenHash(tokenHash)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.INVITATION_NOT_FOUND,
                        "error.invitation.notFound"));
        Instant now = clock.instant();
        if (invitation.getStatus() == InvitationStatus.ACCEPTED) {
            throw ConflictException.of(ErrorCode.INVITATION_ALREADY_ACCEPTED, "error.invitation.alreadyAccepted");
        }
        if (invitation.getStatus() == InvitationStatus.REVOKED) {
            // Reported as "not found" on purpose: a revoked invitation is one the municipality took
            // back, and whoever holds the link has no business learning any more than that.
            throw NotFoundException.of(ErrorCode.INVITATION_NOT_FOUND, "error.invitation.notFound");
        }
        if (invitation.isExpiredAt(now)) {
            throw ConflictException.of(ErrorCode.INVITATION_EXPIRED, "error.invitation.expired");
        }
        return invitation;
    }

    /** Marks the promise kept. The row stays: it is who gave this person access, and when. */
    @Transactional
    public StaffInvitation markAccepted(UUID invitationId, UserId acceptedBy) {
        StaffInvitation invitation = invitationRepository.findById(invitationId)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.INVITATION_NOT_FOUND,
                        "error.invitation.notFound"));
        invitation.accept(acceptedBy.value(), clock.instant());
        return invitation;
    }

    /** Calls an invitation back. Only a live one; an accepted one is undone by revoking the post. */
    @Transactional
    public StaffInvitation revoke(TenantId tenantId, UUID invitationId) {
        StaffInvitation invitation = requireInScope(tenantId, invitationId);
        if (invitation.getStatus() == InvitationStatus.ACCEPTED) {
            throw ConflictException.of(ErrorCode.INVITATION_ALREADY_ACCEPTED, "error.invitation.alreadyAccepted");
        }
        if (invitation.getStatus() == InvitationStatus.REVOKED) {
            return invitation;
        }
        invitation.revoke(clock.instant());
        return invitation;
    }

    /** For re-sending: the live invitation of this municipality, ready to be given a new token. */
    @Transactional
    public StaffInvitation reissue(TenantId tenantId, UUID invitationId, String tokenHash) {
        StaffInvitation invitation = requireInScope(tenantId, invitationId);
        if (invitation.getStatus() != InvitationStatus.PENDING) {
            throw ConflictException.of(ErrorCode.INVITATION_NOT_PENDING, "error.invitation.notPending");
        }
        Instant now = clock.instant();
        invitation.reissue(tokenHash, now, now.plus(TTL));
        return invitation;
    }

    @Transactional(readOnly = true)
    public PageResponse<StaffInvitation> list(TenantId tenantId, InvitationStatus status, PageRequest request) {
        Pageable pageable = org.springframework.data.domain.PageRequest.of(request.page(), request.size());
        Page<StaffInvitation> page = status == null
                ? invitationRepository.findByTenantIdOrderByCreatedAtDesc(tenantId.value(), pageable)
                : invitationRepository.findByTenantIdAndStatusOrderByCreatedAtDesc(tenantId.value(), status,
                        pageable);
        return PageResponse.of(page.getContent(), request.page(), request.size(), page.getTotalElements());
    }

    /** Cross-tenant addressing is a not-found, never a forbidden (docs/ARCHITECTURE.md §4). */
    @Transactional(readOnly = true)
    public StaffInvitation requireInScope(TenantId tenantId, UUID invitationId) {
        return invitationRepository.findByIdAndTenantId(invitationId, tenantId.value())
                .orElseThrow(() -> NotFoundException.of(ErrorCode.INVITATION_NOT_FOUND,
                        "error.invitation.notFound"));
    }

    private static void requireGrantable(Role role) {
        if (role == null || !role.grantableByTenantAdmin()) {
            throw new ValidationException("role", ErrorCode.ROLE_NOT_ALLOWED_FOR_PORTAL,
                    "error.membership.role.notGrantableByTenant");
        }
    }
}
