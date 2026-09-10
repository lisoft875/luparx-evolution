package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.notification.SmtpNotificationSender;
import cr.luparx.app.outbox.OutboxRecorder;
import cr.luparx.app.web.dto.AdminDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.domain.Role;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ForbiddenException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.i18n.Locales;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.outbox.OutboxEventType;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContext;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.tenancy.entity.TenantMembership;
import cr.luparx.tenancy.model.MembershipStatus;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.port.NotificationSender;
import cr.luparx.identity.service.UserDirectoryService;
import cr.luparx.parking.entity.ParkingZone;
import cr.luparx.parking.service.ParkingCatalogService;
import cr.luparx.tenancy.service.MembershipService;
import cr.luparx.tenancy.service.MembershipZoneService;
import cr.luparx.tenancy.service.TenantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Membership administration inside the active municipality (CONTRACT.md §4).
 *
 * <p>Approving a membership is the moment an admin or inspector account actually gains access, so
 * every transition here is audited, and cross-tenant addressing is blocked by resolving each
 * membership through {@code requireInScope(id, activeTenant)}.</p>
 */
@RestController
@RequestMapping("/api/v1/admin/memberships")
@Tag(name = "Admin · Memberships", description = "Access requests and role assignments of the active municipality.")
public class AdminMembershipController {

    private final MembershipService membershipService;
    private final MembershipZoneService zoneService;
    private final ParkingCatalogService catalogService;
    private final UserDirectoryService userDirectoryService;
    private final TenantService tenantService;
    private final NotificationSender notificationSender;
    private final SmtpNotificationSender portalUrls;
    private final AuditRecorder auditRecorder;
    private final OutboxRecorder outboxRecorder;
    private final ResponseMapper mapper;

    public AdminMembershipController(MembershipService membershipService,
                                     MembershipZoneService zoneService,
                                     ParkingCatalogService catalogService,
                                     UserDirectoryService userDirectoryService,
                                     TenantService tenantService,
                                     NotificationSender notificationSender,
                                     SmtpNotificationSender portalUrls,
                                     AuditRecorder auditRecorder,
                                     OutboxRecorder outboxRecorder,
                                     ResponseMapper mapper) {
        this.membershipService = membershipService;
        this.zoneService = zoneService;
        this.catalogService = catalogService;
        this.userDirectoryService = userDirectoryService;
        this.tenantService = tenantService;
        this.notificationSender = notificationSender;
        this.portalUrls = portalUrls;
        this.auditRecorder = auditRecorder;
        this.outboxRecorder = outboxRecorder;
        this.mapper = mapper;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('PERM_USER_READ')")
    @Operation(summary = "List memberships of the active municipality (paginated)")
    public PageResponse<AdminDtos.MembershipResponse> list(
            @RequestParam(required = false) MembershipStatus status,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String sort) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        PageRequest request = PageRequest.parse(page, size, sort);
        return membershipService.listByTenant(tenantId, status, request).map(mapper::toMembership);
    }

    /**
     * Gives a post in this municipality to somebody who already has an account.
     *
     * <p>This is the other half of {@code POST /admin/users}: that one opens an account for a person
     * the platform has never seen, this one gives access to a person it already knows — most often a
     * citizen of this same municipality who is now being hired. Nothing about their account is
     * touched: same password, same profile, same history. They simply hold one post more.</p>
     *
     * <p>The portal is the role's portal, and the uniqueness of (municipality, person, portal) is
     * what shapes the model: one post per app. The same person can be an inspector on the street
     * app, hold finance in this portal, and still be a citizen who parks downtown on Sunday — three
     * memberships, one account, one set of personal data (CONTRACT.md v0.26).</p>
     *
     * <p>The person is told by email. Nobody should acquire authority in a municipality without a
     * message landing in their inbox saying so: it is what lets a person notice an access they never
     * asked for, and it costs a mail.</p>
     */
    @PostMapping
    @PreAuthorize("hasAuthority('PERM_ROLE_ASSIGN')")
    @Operation(summary = "Grant a membership in the active municipality to an existing account")
    public AdminDtos.MembershipResponse create(@Valid @RequestBody AdminDtos.CreateMembershipRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        if (request.tenantId() != null && !request.tenantId().equals(tenantId.value())) {
            // A municipal administrator may only grant access to their own municipality.
            throw ForbiddenException.of(ErrorCode.CROSS_TENANT_ACCESS_DENIED, "error.tenant.cross.access");
        }
        requireGrantable(request.role());
        TenantMembership membership = membershipService.create(UserId.of(request.userId()), tenantId,
                request.portal(), request.role(), MembershipStatus.ACTIVE);
        auditRecorder.record(AuditAction.MEMBERSHIP_CREATED, "membership", membership.getId().toString(),
                Map.of("userId", request.userId().toString(), "role", request.role().name()));
        notifyGranted(tenantId, UserId.of(request.userId()), request.role());
        return mapper.toMembership(membership);
    }

    /**
     * Tells the person that a municipality just gave them access.
     *
     * <p>Deliberately not a link with a token in it: this account already exists and its owner
     * already has a password, so there is nothing to activate. A message that asked them to "click
     * to accept" would be teaching the exact habit that phishing lives on. It names the municipality,
     * points at the app's front door, and says what to do if the access was unexpected.</p>
     *
     * <p>Sent after the grant, never instead of it: the SMTP adapter swallows delivery failures on
     * purpose, because a mail server that is down must not undo an appointment that is already
     * recorded.</p>
     */
    private void notifyGranted(TenantId tenantId, UserId userId, Role role) {
        User person = userDirectoryService.require(userId);
        String tenantName = tenantService.require(tenantId).getDisplayName();
        notificationSender.send(person.getEmail(),
                Locales.parse(person.getLocale()).orElse(Locale.ROOT),
                "email.accessGranted",
                Map.of("name", person.getGivenName(),
                        "link", portalUrls.portalBaseUrl(role.portal().slug()),
                        "tenant", tenantName == null ? "" : tenantName));
    }

    /**
     * The roles a municipal administrator may hand out inside their own municipality
     * (CONTRACT.md v0.14): inspectors, finance and support — never another administrator.
     *
     * <p>Without this the endpoint was a privilege escalation with no steps at all: {@code
     * ROLE_ASSIGN} is held by {@code TENANT_ADMIN}, so one administrator could appoint a second, and
     * a stolen admin session could quietly leave a permanent one behind. Who runs a municipality is
     * the platform's decision.</p>
     */
    private static void requireGrantable(Role role) {
        if (role == null || !role.grantableByTenantAdmin()) {
            throw new ValidationException("role", ErrorCode.ROLE_NOT_ALLOWED_FOR_PORTAL,
                    "error.membership.role.notGrantableByTenant");
        }
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('PERM_ROLE_ASSIGN')")
    @Operation(summary = "Change the role or the status of a membership")
    public AdminDtos.MembershipResponse update(@PathVariable UUID id,
                                               @Valid @RequestBody AdminDtos.UpdateMembershipRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        // Changing a role is granting one: the same ceiling applies, or the create rule would be a
        // formality anybody could step around with a second request.
        if (request.role() != null) {
            requireGrantable(request.role());
        }
        TenantMembership membership = membershipService.update(id, tenantId, request.role(), request.status());
        auditRecorder.record(AuditAction.MEMBERSHIP_ROLE_CHANGED, "membership", id.toString(),
                Map.of("role", String.valueOf(request.role()), "status", String.valueOf(request.status())));
        return mapper.toMembership(membership);
    }

    /**
     * Pauses a member of staff's access to this municipality — "desactivar" in the panel
     * (CONTRACT.md v0.15).
     *
     * <p>It is the membership that stops, not the person: their account is untouched and they go on
     * using the citizen app in any canton, because a municipality ends a post and not a life.
     * Blocking the person outright is {@code POST /admin/users/{id}/block} and is a different act
     * with a different permission.</p>
     *
     * <p>Nothing they did is touched either. Not one citation is deleted, hidden or reassigned: the
     * record of an officer's acts outlives the officer's access, which is the whole point of it
     * being a record.</p>
     */
    /**
     * The staff of this municipality, as the administration panel reads it (CONTRACT.md v0.15).
     *
     * <p>One row per post, not per person: name, role, status, the sectors it covers and when the
     * account was last used. Suspended and revoked posts are in it — the panel is where a suspension
     * is lifted, and where somebody asks months later who held a post in March.</p>
     *
     * <p>Three queries for a page, never one per row: the memberships, then their people, then their
     * zones.</p>
     */
    @GetMapping("/staff")
    @PreAuthorize("hasAuthority('PERM_USER_READ')")
    @Operation(summary = "The staff of the active municipality, with role, sectors and last access")
    public PageResponse<AdminDtos.StaffMemberResponse> staff(
            @RequestParam(required = false) MembershipStatus status,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        PageRequest request = PageRequest.parse(page, size, null);
        PageResponse<TenantMembership> memberships = membershipService.listStaff(tenantId, status, request);

        List<UUID> membershipIds = memberships.items().stream().map(TenantMembership::getId).toList();
        List<UUID> userIds = memberships.items().stream().map(TenantMembership::getUserId).distinct().toList();
        Map<UUID, User> people = userIds.isEmpty()
                ? Map.of()
                : userDirectoryService.findAllById(userIds).stream()
                        .collect(Collectors.toMap(User::getId, user -> user));
        Map<UUID, List<UUID>> zonesByMembership = zoneService.zonesOf(membershipIds);
        Map<UUID, ParkingZone> zonesOfTenant = catalogService.listActiveZones(tenantId).stream()
                .collect(Collectors.toMap(ParkingZone::getId, zone -> zone));

        List<AdminDtos.StaffMemberResponse> items = new ArrayList<>(memberships.items().size());
        for (TenantMembership membership : memberships.items()) {
            User person = people.get(membership.getUserId());
            List<AdminDtos.ZoneAssignmentResponse> zones = zonesByMembership
                    .getOrDefault(membership.getId(), List.of()).stream()
                    .map(zonesOfTenant::get)
                    // A zone that was retired after being assigned is dropped from the display
                    // rather than shown as a blank: the assignment row stays, and reassigning is
                    // what removes it for good.
                    .filter(zone -> zone != null)
                    .map(zone -> new AdminDtos.ZoneAssignmentResponse(zone.getId(), zone.getCode(), zone.getName()))
                    .toList();
            items.add(new AdminDtos.StaffMemberResponse(
                    membership.getId(),
                    membership.getUserId(),
                    person == null ? null : person.displayName(),
                    person == null ? null : person.getEmail(),
                    membership.getPortal(),
                    membership.getRole(),
                    membership.getStatus(),
                    membership.getStatusReason(),
                    membership.getSuspendedAt(),
                    membership.getRevokedAt(),
                    zones,
                    person == null ? null : person.getLastLoginAt(),
                    person == null ? null : person.getLastLoginPortal(),
                    person == null ? null : person.getStatus()));
        }
        return PageResponse.of(items, request.page(), request.size(), memberships.totalElements());
    }

    @PostMapping("/{id}/suspend")
    @PreAuthorize("hasAuthority('PERM_ROLE_ASSIGN')")
    @Operation(summary = "Pause a member of staff's access to this municipality")
    public AdminDtos.MembershipResponse suspend(@PathVariable UUID id,
                                                @Valid @RequestBody AdminDtos.SuspendMembershipRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        TenantMembership membership = membershipService.suspend(id, tenantId, request.reason());
        auditRecorder.record(AuditAction.MEMBERSHIP_SUSPENDED, "membership", id.toString(),
                Map.of("userId", membership.getUserId().toString(),
                        "reason", String.valueOf(request.reason())));
        return mapper.toMembership(membership);
    }

    /** Lifts a suspension. Only from SUSPENDED — bringing back a revoked post is a new grant. */
    @PostMapping("/{id}/reactivate")
    @PreAuthorize("hasAuthority('PERM_ROLE_ASSIGN')")
    @Operation(summary = "Lift a suspension")
    public AdminDtos.MembershipResponse reactivate(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        TenantMembership membership = membershipService.reactivate(id, tenantId);
        auditRecorder.record(AuditAction.MEMBERSHIP_REACTIVATED, "membership", id.toString(),
                Map.of("userId", membership.getUserId().toString()));
        return mapper.toMembership(membership);
    }

    /**
     * The sectors this member of staff covers — and, for an inspector, where they may act at all
     * (CONTRACT.md v0.15).
     *
     * <p>The whole set is replaced in one call: an administrator ticking boxes is stating what the
     * assignment should be, and a diff is how two people editing the same officer end up with the
     * union of both their intentions.</p>
     *
     * <p>Every zone is resolved against <em>this</em> municipality before anything is written. That
     * is the only place the invariant can be enforced — the database cannot state it across two
     * tables — and it is also what stops an id from another municipality being stored as if it
     * meant something here.</p>
     *
     * <p>An empty list is a real instruction: it clears the restriction and the officer covers the
     * whole municipality again.</p>
     */
    @PutMapping("/{id}/zones")
    @PreAuthorize("hasAuthority('PERM_ZONE_ASSIGN')")
    @Operation(summary = "Replace the sectors assigned to a member of staff")
    public List<AdminDtos.ZoneAssignmentResponse> assignZones(@PathVariable UUID id,
                                                              @Valid @RequestBody AdminDtos.AssignZonesRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        TenantMembership membership = membershipService.requireInScope(id, tenantId);
        Map<UUID, ParkingZone> zonesOfTenant = catalogService.listActiveZones(tenantId).stream()
                .collect(Collectors.toMap(ParkingZone::getId, zone -> zone));
        for (UUID zoneId : request.zoneIds()) {
            if (!zonesOfTenant.containsKey(zoneId)) {
                throw new ValidationException("zoneIds", ErrorCode.PARKING_ZONE_NOT_FOUND,
                        "error.parking.zone.notFound");
            }
        }
        List<UUID> assigned = zoneService.replaceZones(membership.getId(), request.zoneIds());
        auditRecorder.record(AuditAction.MEMBERSHIP_ZONES_ASSIGNED, "membership", id.toString(),
                Map.of("userId", membership.getUserId().toString(),
                        "zoneCount", String.valueOf(assigned.size())));
        return assigned.stream()
                .map(zonesOfTenant::get)
                .map(zone -> new AdminDtos.ZoneAssignmentResponse(zone.getId(), zone.getCode(), zone.getName()))
                .toList();
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('PERM_MEMBERSHIP_APPROVE')")
    @Operation(summary = "Approve a pending access request")
    public AdminDtos.MembershipResponse approve(@PathVariable UUID id) {
        TenantContext context = TenantContextHolder.require();
        TenantId tenantId = TenantContextHolder.requireTenantId();
        TenantMembership membership = membershipService.approve(id, tenantId, context.userId());
        auditRecorder.record(AuditAction.MEMBERSHIP_APPROVED, "membership", id.toString(),
                Map.of("userId", membership.getUserId().toString()));
        outboxRecorder.record("membership", id.toString(), tenantId, OutboxEventType.MEMBERSHIP_APPROVED,
                Map.of("membershipId", id.toString(), "userId", membership.getUserId().toString()));
        return mapper.toMembership(membership);
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('PERM_MEMBERSHIP_APPROVE')")
    @Operation(summary = "Reject a pending access request")
    public AdminDtos.MembershipResponse reject(@PathVariable UUID id,
                                               @Valid @RequestBody AdminDtos.RejectMembershipRequest request) {
        TenantContext context = TenantContextHolder.require();
        TenantId tenantId = TenantContextHolder.requireTenantId();
        TenantMembership membership = membershipService.reject(id, tenantId, context.userId(), request.reason());
        auditRecorder.record(AuditAction.MEMBERSHIP_REJECTED, "membership", id.toString(),
                Map.of("reason", request.reason()));
        return mapper.toMembership(membership);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('PERM_ROLE_ASSIGN')")
    @Operation(summary = "Revoke a membership (the row is kept for audit, never deleted)")
    public ResponseEntity<Void> revoke(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        TenantMembership membership = membershipService.revoke(id, tenantId, null);
        auditRecorder.record(AuditAction.MEMBERSHIP_REVOKED, "membership", id.toString(),
                Map.of("userId", membership.getUserId().toString()));
        outboxRecorder.record("membership", id.toString(), tenantId, OutboxEventType.MEMBERSHIP_REVOKED,
                Map.of("membershipId", id.toString(), "userId", membership.getUserId().toString()));
        return ResponseEntity.noContent().build();
    }
}
