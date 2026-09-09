package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.outbox.OutboxRecorder;
import cr.luparx.app.web.dto.AdminDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.domain.Role;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ForbiddenException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.outbox.OutboxEventType;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContext;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.tenancy.entity.TenantMembership;
import cr.luparx.tenancy.model.MembershipStatus;
import cr.luparx.tenancy.service.MembershipService;
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

import java.util.Map;
import java.util.UUID;

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
    private final AuditRecorder auditRecorder;
    private final OutboxRecorder outboxRecorder;
    private final ResponseMapper mapper;

    public AdminMembershipController(MembershipService membershipService,
                                     AuditRecorder auditRecorder,
                                     OutboxRecorder outboxRecorder,
                                     ResponseMapper mapper) {
        this.membershipService = membershipService;
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

    @PostMapping
    @PreAuthorize("hasAuthority('PERM_ROLE_ASSIGN')")
    @Operation(summary = "Grant a membership in the active municipality")
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
        return mapper.toMembership(membership);
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
