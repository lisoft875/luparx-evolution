package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.notification.SmtpNotificationSender;
import cr.luparx.app.outbox.OutboxRecorder;
import cr.luparx.app.web.dto.AdminDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.domain.Portal;
import cr.luparx.core.domain.Role;
import cr.luparx.core.i18n.Locales;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.outbox.OutboxEventType;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContext;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.model.UserStatus;
import cr.luparx.identity.port.NotificationSender;
import cr.luparx.identity.service.PasswordResetService;
import cr.luparx.identity.service.UserDirectoryService;
import cr.luparx.tenancy.entity.TenantMembership;
import cr.luparx.tenancy.model.MembershipStatus;
import cr.luparx.tenancy.repository.TenantMembershipRepository;
import cr.luparx.tenancy.service.MembershipService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Global padrón and cross-tenant user operations (CONTRACT.md §4 {@code /api/v1/platform/users}).
 *
 * <p>This is the deliberate exception to tenant isolation: only a platform-scoped role reaches these
 * routes, MFA is mandatory on this portal, and every call is audited as a platform-scope access
 * (SECURITY.md §3).</p>
 */
@RestController
@RequestMapping("/api/v1/platform")
@Tag(name = "Platform · Users", description = "Global user directory and cross-tenant memberships.")
public class PlatformUserController {

    private final UserDirectoryService userDirectoryService;
    private final TenantMembershipRepository membershipRepository;
    private final MembershipService membershipService;
    private final PasswordResetService passwordResetService;
    private final NotificationSender notificationSender;
    private final SmtpNotificationSender portalUrls;
    private final AuditRecorder auditRecorder;
    private final OutboxRecorder outboxRecorder;
    private final ResponseMapper mapper;

    public PlatformUserController(UserDirectoryService userDirectoryService,
                                  TenantMembershipRepository membershipRepository,
                                  MembershipService membershipService,
                                  PasswordResetService passwordResetService,
                                  NotificationSender notificationSender,
                                  SmtpNotificationSender portalUrls,
                                  AuditRecorder auditRecorder,
                                  OutboxRecorder outboxRecorder,
                                  ResponseMapper mapper) {
        this.userDirectoryService = userDirectoryService;
        this.membershipRepository = membershipRepository;
        this.membershipService = membershipService;
        this.passwordResetService = passwordResetService;
        this.notificationSender = notificationSender;
        this.portalUrls = portalUrls;
        this.auditRecorder = auditRecorder;
        this.outboxRecorder = outboxRecorder;
        this.mapper = mapper;
    }

    @GetMapping("/users")
    @PreAuthorize("hasAuthority('PERM_USER_READ')")
    @Operation(summary = "Global user directory (paginated)")
    public PageResponse<AdminDtos.AdminUserListItem> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String country,
            @RequestParam(required = false) UserStatus status,
            @RequestParam(required = false) UUID tenantId,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String sort) {
        PageRequest request = PageRequest.parse(page, size, sort);
        PageResponse<User> users = userDirectoryService.searchGlobal(q, status, country, request);
        auditPlatformAccess("users.list", Map.of("tenantIdFilter", String.valueOf(tenantId)));

        List<UUID> ids = users.items().stream().map(User::getId).toList();
        Map<UUID, List<TenantMembership>> byUser = new HashMap<>();
        if (!ids.isEmpty()) {
            for (TenantMembership membership : membershipRepository.findByUserIdIn(ids)) {
                if (tenantId != null && !tenantId.equals(membership.getTenantId())) {
                    continue;
                }
                byUser.computeIfAbsent(membership.getUserId(), key -> new ArrayList<>()).add(membership);
            }
        }
        List<AdminDtos.AdminUserListItem> items = new ArrayList<>(users.items().size());
        for (User user : users.items()) {
            items.add(mapper.toUserListItem(user, byUser.getOrDefault(user.getId(), List.of())));
        }
        return new PageResponse<>(items, users.page(), users.size(), users.totalElements(), users.totalPages());
    }

    @GetMapping("/users/{id}")
    @PreAuthorize("hasAuthority('PERM_USER_READ')")
    @Operation(summary = "One user with every membership they hold")
    public AdminDtos.AdminUserDetail get(@PathVariable UUID id) {
        User user = userDirectoryService.require(UserId.of(id));
        auditPlatformAccess("users.read", Map.of("userId", id.toString()));
        return mapper.toUserDetail(user, membershipRepository.findByUserId(id));
    }

    @PostMapping("/users/{id}/block")
    @PreAuthorize("hasAuthority('PERM_USER_BLOCK')")
    @Operation(summary = "Block a user platform-wide")
    public ResponseEntity<Void> block(@PathVariable UUID id, @Valid @RequestBody AdminDtos.BlockUserRequest request) {
        userDirectoryService.block(UserId.of(id), request.reason());
        auditPlatformAccess(AuditAction.USER_BLOCKED, Map.of("userId", id.toString(),
                "reason", request.reason()));
        outboxRecorder.record("user", id.toString(), null, OutboxEventType.USER_BLOCKED,
                Map.of("userId", id.toString()));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/users/{id}/unblock")
    @PreAuthorize("hasAuthority('PERM_USER_BLOCK')")
    @Operation(summary = "Unblock a user platform-wide")
    public ResponseEntity<Void> unblock(@PathVariable UUID id) {
        userDirectoryService.unblock(UserId.of(id));
        auditPlatformAccess(AuditAction.USER_UNBLOCKED, Map.of("userId", id.toString()));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/users/{id}/password-reset")
    @PreAuthorize("hasAuthority('PERM_USER_WRITE')")
    @Operation(summary = "Force a password reset and email the link")
    public ResponseEntity<Void> forcePasswordReset(@PathVariable UUID id) {
        PasswordResetService.Issued issued = passwordResetService.forceReset(UserId.of(id));
        notificationSender.send(issued.user().getEmail(),
                Locales.parse(issued.user().getLocale()).orElse(Locale.ROOT),
                "email.passwordReset",
                Map.of("name", issued.user().getGivenName(),
                        "link", portalUrls.portalBaseUrl(Portal.PLATFORM.slug())
                                + "/password/reset?token=" + issued.token()));
        auditPlatformAccess(AuditAction.USER_PASSWORD_RESET_REQUESTED, Map.of("userId", id.toString()));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/users/{id}/mfa/require")
    @PreAuthorize("hasAuthority('PERM_USER_WRITE')")
    @Operation(summary = "Force (or stop forcing) MFA for a user")
    public ResponseEntity<Void> requireMfa(@PathVariable UUID id,
                                           @Valid @RequestBody AdminDtos.RequireMfaRequest request) {
        userDirectoryService.setMfaRequired(UserId.of(id), Boolean.TRUE.equals(request.required()));
        auditPlatformAccess(AuditAction.USER_MFA_REQUIREMENT_CHANGED,
                Map.of("userId", id.toString(), "required", String.valueOf(request.required())));
        return ResponseEntity.noContent().build();
    }

    /**
     * Grants a membership in any municipality — including the platform portal itself, which is how a
     * new {@code PLATFORM_ADMIN} is created (CONTRACT.md §0: the platform portal has no
     * self-registration).
     */
    @PostMapping("/memberships")
    @PreAuthorize("hasAuthority('PERM_PLATFORM_MANAGE')")
    @Operation(summary = "Grant a membership in any municipality, or a platform-scoped role")
    public AdminDtos.MembershipResponse createMembership(
            @Valid @RequestBody AdminDtos.CreateMembershipRequest request) {
        TenantId tenantId = null;
        if (request.portal() != Portal.PLATFORM) {
            if (request.tenantId() == null) {
                // Only a platform back-office membership may exist without a municipality.
                throw new cr.luparx.core.error.ValidationException("tenantId",
                        cr.luparx.core.error.ErrorCode.VALIDATION_FAILED, "error.registration.tenantRequired");
            }
            tenantId = TenantId.of(request.tenantId());
        }
        TenantMembership membership = membershipService.create(UserId.of(request.userId()), tenantId,
                request.portal(), request.role(), MembershipStatus.ACTIVE);
        auditPlatformAccess(AuditAction.MEMBERSHIP_CREATED, Map.of(
                "membershipId", membership.getId().toString(),
                "userId", request.userId().toString(),
                "role", request.role().name(),
                "portal", request.portal().slug()));
        return mapper.toMembership(membership);
    }

    /**
     * Records that a platform-scoped operator crossed tenant boundaries. Required by SECURITY.md §3
     * for every such access, not only for writes.
     */
    private void auditPlatformAccess(String action, Map<String, Object> metadata) {
        TenantContext context = TenantContextHolder.require();
        auditRecorder.record(action.contains(".") ? AuditAction.PLATFORM_SCOPE_ACCESS : action,
                "platform", action, null, context.userId(), context.portal(), metadata);
    }

    /** Used only to keep the role enum referenced where the contract mentions role assignment. */
    static Role defaultPlatformRole() {
        return Role.PLATFORM_ADMIN;
    }
}
