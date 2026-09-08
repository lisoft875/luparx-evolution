package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.outbox.OutboxRecorder;
import cr.luparx.app.web.dto.PlatformDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.domain.Portal;
import cr.luparx.core.domain.Role;
import cr.luparx.core.email.EmailAddress;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.NotImplementedException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.outbox.OutboxEventType;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContext;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.repository.UserRepository;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.model.TenantBranding;
import cr.luparx.tenancy.entity.TenantMembership;
import cr.luparx.tenancy.model.MembershipStatus;
import cr.luparx.tenancy.model.TenantStatus;
import cr.luparx.tenancy.service.MembershipService;
import cr.luparx.tenancy.service.TenantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
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

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Platform back-office: municipalities and their configuration (CONTRACT.md §4
 * {@code /api/v1/platform/**}).
 *
 * <p>This is the operator's console, not a municipality's. It is the only place where crossing tenant
 * boundaries is legitimate, which is why MFA is mandatory on this portal and every action here
 * writes an audit row with a null {@code tenant_id} or the affected tenant's id (SECURITY.md §3).</p>
 */
@RestController
@RequestMapping("/api/v1/platform/tenants")
@Tag(name = "Platform · Tenants", description = "Create and operate municipalities.")
public class PlatformTenantController {

    private final TenantService tenantService;
    private final MembershipService membershipService;
    private final UserRepository userRepository;
    private final AuditRecorder auditRecorder;
    private final OutboxRecorder outboxRecorder;
    private final ResponseMapper mapper;

    public PlatformTenantController(TenantService tenantService,
                                    MembershipService membershipService,
                                    UserRepository userRepository,
                                    AuditRecorder auditRecorder,
                                    OutboxRecorder outboxRecorder,
                                    ResponseMapper mapper) {
        this.tenantService = tenantService;
        this.membershipService = membershipService;
        this.userRepository = userRepository;
        this.auditRecorder = auditRecorder;
        this.outboxRecorder = outboxRecorder;
        this.mapper = mapper;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Search municipalities (paginated)")
    public PageResponse<PlatformDtos.TenantResponse> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) TenantStatus status,
            @RequestParam(required = false) String country,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String sort) {
        PageRequest request = PageRequest.parse(page, size, sort);
        return tenantService.search(q, status, country, request).map(mapper::toTenant);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('PERM_PLATFORM_MANAGE')")
    @Operation(summary = "Create a municipality")
    public ResponseEntity<PlatformDtos.TenantResponse> create(
            @Valid @RequestBody PlatformDtos.CreateTenantRequest request) {
        TenantContext context = TenantContextHolder.require();
        Tenant tenant = tenantService.create(request.slug(), request.legalName(), request.displayName(),
                request.countryCode(), request.currencyCode(), request.locale(), request.timeZone(),
                request.selfRegistrationPolicy(),
                new TenantBranding(request.logoAssetKey(), request.brandColor(), request.shortName()),
                context.userId());
        auditRecorder.record(AuditAction.TENANT_CREATED, "tenant", tenant.getId().toString(),
                TenantId.of(tenant.getId()), context.userId(), context.portal(),
                Map.of("slug", tenant.getSlug(), "countryCode", tenant.getCountryCode()));
        outboxRecorder.record("tenant", tenant.getId().toString(), TenantId.of(tenant.getId()),
                OutboxEventType.TENANT_CREATED, Map.of("tenantId", tenant.getId().toString()));
        return ResponseEntity.status(HttpStatus.CREATED).body(mapper.toTenant(tenant));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Read one municipality")
    public PlatformDtos.TenantResponse get(@PathVariable UUID id) {
        return mapper.toTenant(tenantService.require(TenantId.of(id)));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('PERM_PLATFORM_MANAGE')")
    @Operation(summary = "Update a municipality's naming and regional configuration")
    public PlatformDtos.TenantResponse update(@PathVariable UUID id,
                                              @Valid @RequestBody PlatformDtos.UpdateTenantRequest request) {
        TenantContext context = TenantContextHolder.require();
        Tenant tenant = tenantService.update(TenantId.of(id), request.legalName(), request.displayName(),
                request.currencyCode(), request.locale(), request.timeZone(), request.selfRegistrationPolicy(),
                context.userId());
        // The back-office edits a municipality from one form, branding included. Applied after the
        // naming so that a rejected colour cannot leave the name half-saved.
        tenant = tenantService.rebrand(TenantId.of(id),
                new TenantBranding(request.logoAssetKey(), request.brandColor(), request.shortName()),
                context.userId());
        auditRecorder.record(AuditAction.TENANT_UPDATED, "tenant", id.toString(), TenantId.of(id),
                context.userId(), context.portal(), Map.of());
        return mapper.toTenant(tenant);
    }

    @PostMapping("/{id}/status")
    @PreAuthorize("hasAuthority('PERM_PLATFORM_MANAGE')")
    @Operation(summary = "Activate, suspend or close a municipality")
    public PlatformDtos.TenantResponse changeStatus(@PathVariable UUID id,
                                                    @Valid @RequestBody PlatformDtos.TenantStatusRequest request) {
        TenantContext context = TenantContextHolder.require();
        Tenant tenant = tenantService.changeStatus(TenantId.of(id), request.status(), request.reason(),
                context.userId());
        auditRecorder.record(AuditAction.TENANT_STATUS_CHANGED, "tenant", id.toString(), TenantId.of(id),
                context.userId(), context.portal(),
                Map.of("status", request.status().name(), "reason", String.valueOf(request.reason())));
        outboxRecorder.record("tenant", id.toString(), TenantId.of(id), OutboxEventType.TENANT_STATUS_CHANGED,
                Map.of("tenantId", id.toString(), "status", request.status().name()));
        return mapper.toTenant(tenant);
    }

    @GetMapping("/{id}/settings")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Typed settings of a municipality")
    public List<PlatformDtos.TenantSettingResponse> settings(@PathVariable UUID id) {
        return tenantService.settings(TenantId.of(id)).stream().map(mapper::toTenantSetting).toList();
    }

    @PutMapping("/{id}/settings")
    @PreAuthorize("hasAuthority('PERM_PLATFORM_MANAGE')")
    @Operation(summary = "Write one typed setting; an unknown key is rejected")
    public PlatformDtos.TenantSettingResponse putSetting(@PathVariable UUID id,
                                                         @Valid @RequestBody
                                                         PlatformDtos.TenantSettingRequest request) {
        TenantContext context = TenantContextHolder.require();
        PlatformDtos.TenantSettingResponse response = mapper.toTenantSetting(
                tenantService.putSetting(TenantId.of(id), request.key(), request.value(), context.userId()));
        auditRecorder.record(AuditAction.TENANT_SETTING_CHANGED, "tenantSetting", id + ":" + request.key(),
                TenantId.of(id), context.userId(), context.portal(), Map.of("key", request.key()));
        return response;
    }

    /**
     * Grants the first {@code TENANT_ADMIN} of a municipality (CONTRACT.md §4).
     *
     * <p>Only the "existing person" branch is implemented in v0.1: creating an account from an email
     * alone would require inventing the mandatory registration data of CONTRACT.md §2 (identity
     * document, address, birth date), which is exactly what must not be guessed. The invitation flow
     * that lets the person supply those fields themselves is the declared extension point.</p>
     */
    @PostMapping("/{id}/admins")
    @PreAuthorize("hasAuthority('PERM_PLATFORM_MANAGE')")
    public PlatformDtos.CreateTenantAdminResponse createAdmin(
            @PathVariable UUID id,
            @Valid @RequestBody PlatformDtos.CreateTenantAdminRequest request) {
        TenantContext context = TenantContextHolder.require();
        tenantService.require(TenantId.of(id));

        Role role = request.role() == null ? Role.TENANT_ADMIN : request.role();
        if (role.portal() != Portal.ADMIN) {
            throw new ValidationException("role", ErrorCode.ROLE_NOT_ALLOWED_FOR_PORTAL,
                    "error.membership.role.portalMismatch");
        }

        User user = userRepository.findByEmail(EmailAddress.normalize(request.email()))
                .orElseThrow(() -> new NotImplementedException("error.notImplemented.tenantAdminInvitation"));

        TenantMembership membership = membershipService.create(UserId.of(user.getId()), TenantId.of(id),
                Portal.ADMIN, role, MembershipStatus.ACTIVE);
        auditRecorder.record(AuditAction.MEMBERSHIP_CREATED, "membership", membership.getId().toString(),
                TenantId.of(id), context.userId(), context.portal(),
                Map.of("role", role.name(), "grantedBy", "platform"));
        return new PlatformDtos.CreateTenantAdminResponse(user.getId(), membership.getId(), false, false);
    }
}
