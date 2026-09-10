package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.notification.SmtpNotificationSender;
import cr.luparx.app.outbox.OutboxRecorder;
import cr.luparx.app.repository.TenantScopedUserRepository;
import cr.luparx.app.security.DirectoryLookupRateLimiter;
import cr.luparx.app.web.dto.AdminDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.domain.Portal;
import cr.luparx.core.domain.Role;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.i18n.Locales;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.outbox.OutboxEventType;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.geo.model.AddressInput;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.model.UserStatus;
import cr.luparx.identity.port.NotificationSender;
import cr.luparx.identity.service.PasswordResetService;
import cr.luparx.identity.service.RegistrationCommand;
import cr.luparx.identity.service.RegistrationResult;
import cr.luparx.identity.service.UserDirectoryService;
import cr.luparx.identity.service.UserRegistrationService;
import cr.luparx.tenancy.entity.TenantMembership;
import cr.luparx.tenancy.model.MembershipStatus;
import cr.luparx.tenancy.repository.TenantMembershipRepository;
import cr.luparx.tenancy.service.MembershipService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
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
 * Municipal user administration (CONTRACT.md §4 {@code /api/v1/admin/**}).
 *
 * <p>Every route is bounded by the active tenant taken from the request context — never from a
 * parameter the caller supplies. A user who has no membership in that tenant is reported as
 * <em>not found</em> rather than <em>forbidden</em>, because confirming that an id exists elsewhere
 * is itself a cross-tenant leak (docs/ARCHITECTURE.md §4).</p>
 *
 * <p>Authorization is by permission, never by role name (SECURITY.md §3).</p>
 */
@RestController
@RequestMapping("/api/v1/admin/users")
@Tag(name = "Admin · Users", description = "Users holding a membership in the active municipality.")
public class AdminUserController {

    private final TenantScopedUserRepository tenantScopedUserRepository;
    private final TenantMembershipRepository membershipRepository;
    private final UserDirectoryService userDirectoryService;
    private final UserRegistrationService registrationService;
    private final MembershipService membershipService;
    private final PasswordResetService passwordResetService;
    private final DirectoryLookupRateLimiter rateLimiter;
    private final NotificationSender notificationSender;
    private final SmtpNotificationSender portalUrls;
    private final AuditRecorder auditRecorder;
    private final OutboxRecorder outboxRecorder;
    private final ResponseMapper mapper;

    public AdminUserController(TenantScopedUserRepository tenantScopedUserRepository,
                               TenantMembershipRepository membershipRepository,
                               UserDirectoryService userDirectoryService,
                               UserRegistrationService registrationService,
                               MembershipService membershipService,
                               PasswordResetService passwordResetService,
                               DirectoryLookupRateLimiter rateLimiter,
                               NotificationSender notificationSender,
                               SmtpNotificationSender portalUrls,
                               AuditRecorder auditRecorder,
                               OutboxRecorder outboxRecorder,
                               ResponseMapper mapper) {
        this.tenantScopedUserRepository = tenantScopedUserRepository;
        this.membershipRepository = membershipRepository;
        this.userDirectoryService = userDirectoryService;
        this.registrationService = registrationService;
        this.membershipService = membershipService;
        this.passwordResetService = passwordResetService;
        this.rateLimiter = rateLimiter;
        this.notificationSender = notificationSender;
        this.portalUrls = portalUrls;
        this.auditRecorder = auditRecorder;
        this.outboxRecorder = outboxRecorder;
        this.mapper = mapper;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('PERM_USER_READ')")
    @Operation(summary = "List users of the active municipality (paginated, tenant-scoped)")
    public PageResponse<AdminDtos.AdminUserListItem> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Portal portal,
            @RequestParam(required = false) Role role,
            @RequestParam(required = false) UserStatus status,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String sort) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        PageRequest request = PageRequest.parse(page, size, sort);
        Pageable pageable = org.springframework.data.domain.PageRequest.of(request.page(), request.size(),
                Sort.by(Sort.Order.desc("createdAt")));

        Page<User> users = tenantScopedUserRepository.search(tenantId.value(), portal, role, status,
                likeTerm(q), pageable);
        List<AdminDtos.AdminUserListItem> items = attachMemberships(tenantId, users.getContent());
        return PageResponse.of(items, request.page(), request.size(), users.getTotalElements());
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('PERM_USER_READ')")
    @Operation(summary = "Full record of one user of the active municipality")
    public AdminDtos.AdminUserDetail get(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        User user = requireMemberOfTenant(tenantId, id);
        List<TenantMembership> memberships = membershipRepository.findByTenantIdAndUserId(tenantId.value(), id);
        return mapper.toUserDetail(user, memberships);
    }

    /**
     * Finds one person who is already registered on the platform, so that a post can be given to
     * them instead of a second account being opened for them (CONTRACT.md v0.26).
     *
     * <h2>The problem this solves</h2>
     *
     * <p>People arrive at a municipality already registered. The most common case is the obvious one:
     * an inspector parked downtown last year, so they registered as a citizen. Until now the only way
     * in was {@code POST /admin/users}, which creates a person — and it refuses, correctly, with
     * {@code EMAIL_ALREADY_REGISTERED} or {@code DOCUMENT_ALREADY_REGISTERED}, from which there was
     * no way forward. The administrator could not even see the person: every other query in this
     * portal is scoped to those who already hold a membership here, which this person does not.</p>
     *
     * <h2>Why this is a lookup and not a search</h2>
     *
     * <p>This is the only query in a municipal portal that answers about people outside the
     * municipality, and the register behind it is national. So it is an <b>exact match</b>: the whole
     * email, or the whole identity document. No partial terms, no wildcards, no listing, and never
     * more than one result. You can confirm a person you can already name; you cannot browse.</p>
     *
     * <p>Three things bound it beyond that. It costs {@code ROLE_ASSIGN}, so only someone who may
     * actually hand out a post can ask. Every attempt is audited, found or not — the entry records
     * whether it was an email or a document and never the value itself. And the attempts are
     * rate-limited from those very audit rows, so the endpoint cannot be fed a list of addresses to
     * find out who exists.</p>
     *
     * <p>What comes back is deliberately thin: the name, so the administrator can check it against
     * the identity card in their hand, a masked address, the account status, and the posts this
     * person already holds <em>here</em>. Never their posts anywhere else — see
     * {@link AdminDtos.PersonMatch}.</p>
     */
    @PostMapping("/lookup")
    @PreAuthorize("hasAuthority('PERM_ROLE_ASSIGN')")
    @Operation(summary = "Find one already-registered person by their exact email or identity document")
    public AdminDtos.LookupPersonResponse lookup(@Valid @RequestBody AdminDtos.LookupPersonRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        UserId actor = TenantContextHolder.current().map(context -> context.userId()).orElse(null);

        if (request.hasEmail() == request.hasDocument()) {
            // Both, or neither. A client that sends both is guessing which one the server prefers,
            // and guessing is not a thing to resolve silently on a query about a person.
            throw new ValidationException("email", ErrorCode.VALIDATION_FAILED,
                    "error.directory.lookup.criteria");
        }
        rateLimiter.checkAllowed(actor);

        // Recorded BEFORE the answer is known, and recorded either way: an attempt that found nobody
        // is exactly the attempt worth counting, and a limiter that only counted the hits would be
        // no limiter at all against somebody probing for who exists.
        java.util.Optional<User> match = request.hasEmail()
                ? userDirectoryService.findByExactEmail(request.email())
                : userDirectoryService.findByExactDocument(request.identityDocument().countryCode(),
                        request.identityDocument().type(), request.identityDocument().number());
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("by", request.hasEmail() ? "EMAIL" : "DOCUMENT");
        metadata.put("found", Boolean.valueOf(match.isPresent()));
        match.ifPresent(user -> metadata.put("userId", user.getId().toString()));
        auditRecorder.record(AuditAction.USER_DIRECTORY_LOOKUP, "user",
                match.map(user -> user.getId().toString()).orElse(null), metadata);

        if (match.isEmpty()) {
            return AdminDtos.LookupPersonResponse.notFound();
        }
        User person = match.get();
        List<AdminDtos.PersonAccess> here =
                membershipRepository.findByTenantIdAndUserId(tenantId.value(), person.getId()).stream()
                        .map(membership -> new AdminDtos.PersonAccess(membership.getPortal(),
                                membership.getRole(), membership.getStatus()))
                        .toList();
        return new AdminDtos.LookupPersonResponse(true, new AdminDtos.PersonMatch(
                person.getId(),
                mapper.fullName(person),
                maskEmail(person.getEmail()),
                person.getStatus(),
                here));
    }

    /**
     * {@code javier.li@gmail.com} → {@code ja***@gmail.com}.
     *
     * <p>Enough for an administrator to recognise the address they typed, not enough to learn one
     * they did not. The domain is kept whole on purpose: it is the part that tells a municipality
     * whether the person is writing from a work account, and it identifies nobody by itself.</p>
     */
    static String maskEmail(String email) {
        if (email == null || email.isBlank()) {
            return "";
        }
        int at = email.indexOf('@');
        if (at <= 0) {
            return "***";
        }
        String local = email.substring(0, at);
        String domain = email.substring(at);
        // One visible character for a very short local part; two otherwise. Never all of a
        // two-letter name.
        int visible = local.length() <= 2 ? 1 : 2;
        return local.substring(0, visible) + "***" + domain;
    }

    /**
     * Opens an account for somebody who works for this municipality — an inspector, most of the time
     * (CONTRACT.md v0.14).
     *
     * <h2>Why the administrator types the person's data</h2>
     *
     * <p>Because they have it. Hiring an inspector means holding their identity document, their
     * address and their date of birth in an employment file; §2 requires those fields and this is
     * not the platform guessing them, it is the municipality entering what it already knows. That is
     * the difference between this and inventing data, which is why {@code createAdmin} on the
     * platform side still refuses to conjure an account out of an e-mail alone.</p>
     *
     * <h2>What the administrator does not get to do</h2>
     *
     * <p>Set the password. No credentials row is written at all: the person receives a link and
     * chooses their own, and only then can the account be signed into. An operator who could set the
     * password could sign in as that person and write fines in their name — the audit trail would
     * say the inspector did it, and it would be wrong.</p>
     *
     * <p>Nor appoint another administrator: {@link Role#grantableByTenantAdmin()} allows inspectors,
     * finance and support, and refuses {@code TENANT_ADMIN} and everything platform-scoped.</p>
     *
     * <p>Two permissions, because two things happen: a person is created ({@code USER_WRITE}) and a
     * role is granted ({@code ROLE_ASSIGN}). Among municipal roles only {@code TENANT_ADMIN} holds
     * both, which is the intended answer — but it is expressed as the two capabilities rather than
     * as the role name, so a municipality that splits its staff differently keeps working.</p>
     */
    @PostMapping
    @PreAuthorize("hasAuthority('PERM_USER_WRITE') and hasAuthority('PERM_ROLE_ASSIGN')")
    @Operation(summary = "Create a member of staff of the active municipality and grant their role")
    public ResponseEntity<AdminDtos.AdminUserDetail> create(@Valid @RequestBody AdminDtos.CreateUserRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        Role role = request.role();
        if (!role.grantableByTenantAdmin()) {
            throw new ValidationException("role", ErrorCode.ROLE_NOT_ALLOWED_FOR_PORTAL,
                    "error.membership.role.notGrantableByTenant");
        }
        if (request.portal() != role.portal()) {
            // The portal is not a second opinion about the role: it is decided by the role, and a
            // request where the two disagree is a client that means one thing and says another.
            throw new ValidationException("portal", ErrorCode.ROLE_NOT_ALLOWED_FOR_PORTAL,
                    "error.membership.role.portalMismatch");
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
                // No password: the person sets their own from the link below.
                null,
                request.locale(),
                request.timeZone(),
                null,
                tenantId.value(),
                role.portal());

        RegistrationResult result = registrationService.createByOperator(command);
        TenantMembership membership = membershipService.create(result.userId(), tenantId, role.portal(), role,
                MembershipStatus.ACTIVE);

        // The one mail this account gets. Following it proves the mailbox and activates the account,
        // so no separate verification mail is sent — two mails saying "click here" is how people
        // learn to click neither.
        PasswordResetService.Issued issued = passwordResetService.forceReset(result.userId());
        notificationSender.send(issued.user().getEmail(),
                Locales.parse(issued.user().getLocale()).orElse(Locale.ROOT),
                "email.accountCreated",
                Map.of("name", issued.user().getGivenName(),
                        "link", portalUrls.portalBaseUrl(role.portal().slug())
                                + "/reset-password?token=" + issued.token()));

        auditRecorder.record(AuditAction.USER_CREATED, "user", result.userId().toString(),
                Map.of("role", role.name(), "portal", role.portal().slug(), "createdBy", "tenant-admin"));
        auditRecorder.record(AuditAction.MEMBERSHIP_CREATED, "membership", membership.getId().toString(),
                Map.of("userId", result.userId().toString(), "role", role.name()));
        outboxRecorder.record("user", result.userId().toString(), tenantId, OutboxEventType.USER_REGISTERED,
                Map.of("userId", result.userId().toString(), "portal", role.portal().slug()));

        User created = userDirectoryService.require(result.userId());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(mapper.toUserDetail(created, List.of(membership)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('PERM_USER_WRITE')")
    @Operation(summary = "Update a user of the active municipality")
    public AdminDtos.AdminUserDetail update(@PathVariable UUID id,
                                            @Valid @RequestBody AdminDtos.UpdateUserRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        requireMemberOfTenant(tenantId, id);
        AddressInput address = request.address() == null ? null : new AddressInput(
                request.address().countryCode(),
                request.address().level1Id(),
                request.address().level2Id(),
                request.address().level3Id(),
                request.address().line1(),
                request.address().line2(),
                request.address().postalCode());
        User user = userDirectoryService.updateProfile(UserId.of(id), request.givenName(), request.familyName(),
                request.secondFamilyName(),
                request.phone() == null ? null : request.phone().countryCode(),
                request.phone() == null ? null : request.phone().nationalNumber(),
                address, request.nationalityCode(), request.locale(), request.timeZone());
        auditRecorder.record(AuditAction.USER_UPDATED, "user", id.toString(), Map.of());
        return mapper.toUserDetail(user, membershipRepository.findByTenantIdAndUserId(tenantId.value(), id));
    }

    @PostMapping("/{id}/block")
    @PreAuthorize("hasAuthority('PERM_USER_BLOCK')")
    @Operation(summary = "Block a user; every session is revoked immediately")
    public ResponseEntity<Void> block(@PathVariable UUID id, @Valid @RequestBody AdminDtos.BlockUserRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        requireMemberOfTenant(tenantId, id);
        userDirectoryService.block(UserId.of(id), request.reason());
        auditRecorder.record(AuditAction.USER_BLOCKED, "user", id.toString(), Map.of("reason", request.reason()));
        outboxRecorder.record("user", id.toString(), tenantId, OutboxEventType.USER_BLOCKED,
                Map.of("userId", id.toString()));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/unblock")
    @PreAuthorize("hasAuthority('PERM_USER_BLOCK')")
    @Operation(summary = "Unblock a user")
    public ResponseEntity<Void> unblock(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        requireMemberOfTenant(tenantId, id);
        userDirectoryService.unblock(UserId.of(id));
        auditRecorder.record(AuditAction.USER_UNBLOCKED, "user", id.toString(), Map.of());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/password-reset")
    @PreAuthorize("hasAuthority('PERM_USER_WRITE')")
    @Operation(summary = "Force a password reset and email the link to the user")
    public ResponseEntity<Void> forcePasswordReset(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        requireMemberOfTenant(tenantId, id);
        PasswordResetService.Issued issued = passwordResetService.forceReset(UserId.of(id));
        notificationSender.send(issued.user().getEmail(),
                Locales.parse(issued.user().getLocale()).orElse(Locale.ROOT),
                "email.passwordReset",
                Map.of("name", issued.user().getGivenName(),
                        "link", portalUrls.portalBaseUrl(resetPortalFor(tenantId, id).slug())
                                + "/reset-password?token=" + issued.token()));
        auditRecorder.record(AuditAction.USER_PASSWORD_RESET_REQUESTED, "user", id.toString(),
                Map.of("forced", "true"));
        return ResponseEntity.noContent().build();
    }

    // --- helpers ---------------------------------------------------------------------------------

    /**
     * Which app's reset page the emailed link should point at.
     *
     * <p>The link used to be hardcoded to the admin portal, which sent an inspector — the commonest
     * person this button is pressed for — to a front door they do not use. The password itself is
     * one and the same whichever portal resets it, so this only decides where the person lands.</p>
     *
     * <p>Since v0.26 one person may hold posts in more than one app of the same municipality, so
     * there can be two right answers; the admin portal wins when they hold one, because it is the
     * desk-bound app and this button is normally pressed while somebody is on the phone with the
     * person. Citizen memberships are ignored: this is a staff action.</p>
     */
    private Portal resetPortalFor(TenantId tenantId, UUID userId) {
        List<TenantMembership> memberships = membershipRepository.findByTenantIdAndUserId(tenantId.value(), userId);
        boolean admin = memberships.stream().anyMatch(m -> m.getPortal() == Portal.ADMIN);
        if (admin) {
            return Portal.ADMIN;
        }
        return memberships.stream().anyMatch(m -> m.getPortal() == Portal.INSPECTOR)
                ? Portal.INSPECTOR
                : Portal.ADMIN;
    }

    /** The IDOR guard: the user must actually belong to the active tenant. */
    private User requireMemberOfTenant(TenantId tenantId, UUID userId) {
        if (tenantScopedUserRepository.countMemberships(tenantId.value(), userId) == 0) {
            throw NotFoundException.of(ErrorCode.USER_NOT_FOUND, "error.user.notFound");
        }
        return userDirectoryService.require(UserId.of(userId));
    }

    /** Attaches each user's memberships in this tenant with a single extra query (no N+1). */
    private List<AdminDtos.AdminUserListItem> attachMemberships(TenantId tenantId, List<User> users) {
        if (users.isEmpty()) {
            return List.of();
        }
        List<UUID> ids = users.stream().map(User::getId).toList();
        Map<UUID, List<TenantMembership>> byUser = new HashMap<>();
        for (TenantMembership membership : membershipRepository.findByTenantIdAndUserIdIn(tenantId.value(), ids)) {
            byUser.computeIfAbsent(membership.getUserId(), key -> new ArrayList<>()).add(membership);
        }
        List<AdminDtos.AdminUserListItem> items = new ArrayList<>(users.size());
        for (User user : users) {
            items.add(mapper.toUserListItem(user, byUser.getOrDefault(user.getId(), List.of())));
        }
        return items;
    }

    private String likeTerm(String query) {
        return (query == null || query.isBlank()) ? null : "%" + query.trim().toLowerCase(Locale.ROOT) + "%";
    }
}
