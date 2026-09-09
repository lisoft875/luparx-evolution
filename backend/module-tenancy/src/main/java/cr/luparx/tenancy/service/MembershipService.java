package cr.luparx.tenancy.service;

import cr.luparx.core.domain.Portal;
import cr.luparx.core.domain.Role;
import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ForbiddenException;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.entity.TenantMembership;
import cr.luparx.tenancy.model.MembershipStatus;
import cr.luparx.tenancy.model.SelfRegistrationPolicy;
import cr.luparx.tenancy.repository.TenantMembershipRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Membership lifecycle: request, approve, reject, revoke and role changes (CONTRACT.md §1 and §4).
 *
 * <p>The self-registration rule lives here, not in a controller: a citizen membership becomes ACTIVE
 * immediately, while admin and inspector requests land in PENDING_APPROVAL unless the tenant's
 * {@code self_registration_policy} says otherwise. The platform portal never accepts a
 * self-registration at all.</p>
 */
@Service
public class MembershipService {

    private final TenantMembershipRepository membershipRepository;
    private final TenantService tenantService;
    private final Clock clock;

    public MembershipService(TenantMembershipRepository membershipRepository, TenantService tenantService,
                             Clock clock) {
        this.membershipRepository = membershipRepository;
        this.tenantService = tenantService;
        this.clock = clock;
    }

    /**
     * Creates the membership that accompanies a self-registration.
     *
     * @throws ForbiddenException when the portal or the tenant policy forbids self-registration
     * @throws ConflictException  when the user already has a membership for this tenant and portal
     */
    @Transactional
    public TenantMembership requestSelfRegistration(UserId userId, TenantId tenantId, Portal portal) {
        if (!portal.selfRegistrationAllowed()) {
            throw ForbiddenException.of(ErrorCode.SELF_REGISTRATION_DISABLED, "error.registration.portal.disabled");
        }
        Tenant tenant = tenantService.requireActive(tenantId);
        SelfRegistrationPolicy policy = tenant.getSelfRegistrationPolicy();
        if (policy == SelfRegistrationPolicy.INVITE_ONLY) {
            throw ForbiddenException.of(ErrorCode.SELF_REGISTRATION_DISABLED, "error.registration.tenant.inviteOnly");
        }

        membershipRepository.findByTenantIdAndUserIdAndPortal(tenantId.value(), userId.value(), portal)
                .ifPresent(existing -> {
                    throw ConflictException.of(ErrorCode.MEMBERSHIP_ALREADY_EXISTS, "error.membership.exists");
                });

        MembershipStatus status = resolveInitialStatus(portal);
        Role role = Role.defaultSelfRegistrationRole(portal);
        Instant now = clock.instant();
        TenantMembership membership = new TenantMembership(Uuid7.generate(), tenantId.value(), userId.value(),
                portal, role, status, now);
        if (status == MembershipStatus.ACTIVE) {
            membership.approve(null, now);
        }
        return membershipRepository.save(membership);
    }

    /**
     * Puts a citizen into a municipality they had never joined, on the spot, so they can pay to park
     * there.
     *
     * <h2>Why this is safe on the citizen portal</h2>
     *
     * <p>Somebody who drives to Cartago for the afternoon has to be able to pay for a bay without
     * asking anyone's permission first. What this grants them is the {@code CITIZEN} role, and a
     * citizen membership carries <b>no authority over the municipality at all</b>: no permission in
     * {@code RolePermissions}, no access to anybody else's data, no read of the municipality's
     * configuration beyond the price list it publishes to the world anyway. It creates a wallet with
     * zero in it and the ability to spend their own money. The municipality is not exposed by having
     * one more citizen; it is paid.</p>
     *
     * <p>It also changes nothing about what the citizen already had. Money and minutes are per tenant
     * by contract (CONTRACT.md v0.2, rule 6): the new wallet starts empty, the credit balance starts
     * empty, and nothing crosses from the municipality they came from. Joining is not a transfer.</p>
     *
     * <h2>Why it would NOT be safe on the other portals</h2>
     *
     * <p>An admin or inspector membership is authority — reading the padrón, editing tariffs,
     * verifying stays — and granting it on request would be a privilege escalation with a URL for a
     * front door. Those portals keep requiring a membership somebody decided to give, which is why
     * this method is named for the citizen and hard-codes {@link Role#CITIZEN} instead of taking a
     * portal.</p>
     *
     * <p>The municipality still has the last word: {@link SelfRegistrationPolicy#INVITE_ONLY} refuses,
     * and a citizen whose membership was revoked stays revoked — re-granting it here would silently
     * undo an administrative decision.</p>
     *
     * @return the membership and whether this call created it, so the caller audits only real joins
     * @throws ForbiddenException {@code TENANT_NOT_OPEN_TO_CITIZENS} when the municipality does not
     *         admit citizens on request, {@code TENANT_NOT_ACTIVE} when it is suspended or closed,
     *         and {@code MEMBERSHIP_NOT_ACTIVE} when this person's membership was revoked or rejected
     */
    @Transactional
    public Joined joinAsCitizen(UserId userId, TenantId tenantId) {
        Tenant tenant = tenantService.requireActive(tenantId);
        Optional<TenantMembership> existing = membershipRepository.findByTenantIdAndUserIdAndPortal(
                tenantId.value(), userId.value(), Portal.CITIZEN);
        if (existing.isPresent()) {
            TenantMembership membership = existing.get();
            if (membership.getStatus() == MembershipStatus.ACTIVE) {
                return new Joined(membership, false);
            }
            // Revoked, rejected or still waiting: somebody decided that, and it is not this call's
            // business to overturn it.
            throw ForbiddenException.of(ErrorCode.MEMBERSHIP_NOT_ACTIVE, "error.membership.notActive");
        }
        if (tenant.getSelfRegistrationPolicy() == SelfRegistrationPolicy.INVITE_ONLY) {
            throw ForbiddenException.of(ErrorCode.TENANT_NOT_OPEN_TO_CITIZENS,
                    "error.tenant.notOpenToCitizens");
        }
        Instant now = clock.instant();
        TenantMembership membership = new TenantMembership(Uuid7.generate(), tenantId.value(), userId.value(),
                Portal.CITIZEN, Role.CITIZEN, MembershipStatus.ACTIVE, now);
        // Active immediately, whatever the policy says about approvals: CONTRACT.md §1 makes that the
        // rule for citizens, and APPROVAL_REQUIRED exists to gate the portals that carry authority.
        membership.approve(null, now);
        return new Joined(membershipRepository.save(membership), true);
    }

    /** A membership obtained by {@link #joinAsCitizen}, and whether that call is what created it. */
    public record Joined(TenantMembership membership, boolean created) {
    }

    /**
     * A self-registration is now always a citizen's, and a citizen is active immediately
     * (CONTRACT.md §1).
     *
     * <p>Until v0.13 this also decided whether an admin or inspector who registered themselves
     * landed ACTIVE or PENDING_APPROVAL, on the strength of the tenant's
     * {@link SelfRegistrationPolicy}. Those portals no longer self-register at all — the portal gate
     * above refuses them — so the only branch that could still be taken is the citizen one, and the
     * argument that used to select between them is gone rather than left in place looking as if it
     * still decided something.</p>
     *
     * <p>The tenant policy itself is <b>not</b> dead: {@code INVITE_ONLY} is checked above and is
     * what keeps a citizen out of a municipality that is not open to the public. What no longer has
     * an effect is the distinction between {@code OPEN} and {@code APPROVAL_REQUIRED}, since the one
     * portal left never waits for approval — see CONTRACT.md v0.13, "Lo que queda pendiente".</p>
     */
    private MembershipStatus resolveInitialStatus(Portal portal) {
        if (portal != Portal.CITIZEN) {
            throw new IllegalStateException("self-registration is the citizen portal's only: " + portal.slug());
        }
        return MembershipStatus.ACTIVE;
    }

    /** Administrative creation of a membership (invitation / manual grant). */
    @Transactional
    public TenantMembership create(UserId userId, TenantId tenantId, Portal portal, Role role,
                                   MembershipStatus status) {
        requireRoleMatchesPortal(role, portal);
        if (portal == Portal.PLATFORM) {
            // Platform memberships are not bound to a municipality (CONTRACT.md §0).
            Optional<TenantMembership> existing = membershipRepository.findByUserId(userId.value()).stream()
                    .filter(candidate -> candidate.getPortal() == Portal.PLATFORM)
                    .findFirst();
            if (existing.isPresent()) {
                throw ConflictException.of(ErrorCode.MEMBERSHIP_ALREADY_EXISTS, "error.membership.exists");
            }
            Instant now = clock.instant();
            TenantMembership membership = new TenantMembership(Uuid7.generate(), null, userId.value(), portal, role,
                    status, now);
            if (status == MembershipStatus.ACTIVE) {
                membership.approve(null, now);
            }
            return membershipRepository.save(membership);
        }

        tenantService.requireActive(tenantId);
        membershipRepository.findByTenantIdAndUserIdAndPortal(tenantId.value(), userId.value(), portal)
                .ifPresent(existing -> {
                    throw ConflictException.of(ErrorCode.MEMBERSHIP_ALREADY_EXISTS, "error.membership.exists");
                });
        Instant now = clock.instant();
        TenantMembership membership = new TenantMembership(Uuid7.generate(), tenantId.value(), userId.value(), portal,
                role, status, now);
        if (status == MembershipStatus.ACTIVE) {
            membership.approve(null, now);
        }
        return membershipRepository.save(membership);
    }

    /**
     * Loads a membership and proves it belongs to the tenant the caller is acting in. Platform
     * operators pass {@code null} as the scope, and their access is audited by the caller
     * (SECURITY.md §3).
     */
    @Transactional(readOnly = true)
    public TenantMembership requireInScope(UUID membershipId, TenantId scope) {
        TenantMembership membership = membershipRepository.findById(membershipId)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.MEMBERSHIP_NOT_FOUND, "error.membership.notFound"));
        if (scope != null && !scope.value().equals(membership.getTenantId())) {
            // Not "403 wrong tenant": revealing that the id exists elsewhere is itself a cross-tenant
            // leak, so an out-of-scope membership is indistinguishable from a missing one.
            throw NotFoundException.of(ErrorCode.MEMBERSHIP_NOT_FOUND, "error.membership.notFound");
        }
        return membership;
    }

    @Transactional
    public TenantMembership approve(UUID membershipId, TenantId scope, UserId approver) {
        TenantMembership membership = requireInScope(membershipId, scope);
        if (membership.getStatus() == MembershipStatus.ACTIVE) {
            return membership;
        }
        if (membership.getStatus() == MembershipStatus.REJECTED
                || membership.getStatus() == MembershipStatus.REVOKED) {
            // Re-admitting someone previously rejected/revoked is an explicit new grant, not an approval.
            throw ConflictException.of(ErrorCode.MEMBERSHIP_INVALID_TRANSITION, "error.membership.transition");
        }
        membership.approve(approver == null ? null : approver.value(), clock.instant());
        return membership;
    }

    @Transactional
    public TenantMembership reject(UUID membershipId, TenantId scope, UserId approver, String reason) {
        TenantMembership membership = requireInScope(membershipId, scope);
        if (membership.getStatus() != MembershipStatus.PENDING_APPROVAL) {
            throw ConflictException.of(ErrorCode.MEMBERSHIP_INVALID_TRANSITION, "error.membership.transition");
        }
        membership.reject(approver == null ? null : approver.value(), clock.instant(), reason);
        return membership;
    }

    @Transactional
    public TenantMembership revoke(UUID membershipId, TenantId scope, String reason) {
        TenantMembership membership = requireInScope(membershipId, scope);
        membership.revoke(clock.instant(), reason);
        return membership;
    }

    @Transactional
    public TenantMembership update(UUID membershipId, TenantId scope, Role role, MembershipStatus status) {
        TenantMembership membership = requireInScope(membershipId, scope);
        if (role != null) {
            requireRoleMatchesPortal(role, membership.getPortal());
            membership.changeRole(role);
        }
        if (status != null) {
            membership.changeStatus(status, clock.instant());
        }
        return membership;
    }

    @Transactional(readOnly = true)
    public PageResponse<TenantMembership> listByTenant(TenantId tenantId, MembershipStatus status,
                                                       PageRequest request) {
        org.springframework.data.domain.Pageable pageable = org.springframework.data.domain.PageRequest.of(
                request.page(), request.size(), Sort.by(Sort.Order.desc("requestedAt")));
        Page<TenantMembership> page = status == null
                ? membershipRepository.findByTenantId(tenantId.value(), pageable)
                : membershipRepository.findByTenantIdAndStatus(tenantId.value(), status, pageable);
        return PageResponse.of(page.getContent(), request.page(), request.size(), page.getTotalElements());
    }

    @Transactional(readOnly = true)
    public List<TenantMembership> listByUser(UserId userId) {
        return membershipRepository.findByUserId(userId.value());
    }

    /** A role always belongs to exactly one portal; mixing them would break portal isolation. */
    private void requireRoleMatchesPortal(Role role, Portal portal) {
        if (role == null || portal == null || role.portal() != portal) {
            throw new ValidationException("role", ErrorCode.ROLE_NOT_ALLOWED_FOR_PORTAL,
                    "error.membership.role.portalMismatch");
        }
    }
}
