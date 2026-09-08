package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.config.PlatformDefaultsProperties;
import cr.luparx.app.web.dto.AdminDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.entity.TenantLocale;
import cr.luparx.tenancy.model.TenantBranding;
import cr.luparx.tenancy.service.TenantLocaleService;
import cr.luparx.tenancy.service.TenantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Settings a municipal administrator maintains for their own municipality (CONTRACT.md v0.3).
 *
 * <p>Everything here is scoped by {@code TenantContextHolder.requireTenantId()} and guarded by
 * {@code PERM_TENANT_MANAGE}: an administrator edits their own municipality and nothing else,
 * whatever identifier they put in a path — the services resolve every row through the tenant before
 * touching it (SECURITY.md §3).</p>
 */
@RestController
@RequestMapping("/api/v1/admin/settings")
@Tag(name = "Admin · Settings", description = "Languages and other settings of the active municipality.")
public class AdminSettingsController {

    private final TenantLocaleService tenantLocaleService;
    private final TenantService tenantService;
    private final PlatformDefaultsProperties platformDefaults;
    private final ResponseMapper mapper;
    private final AuditRecorder auditRecorder;

    public AdminSettingsController(TenantLocaleService tenantLocaleService,
                                   TenantService tenantService,
                                   PlatformDefaultsProperties platformDefaults,
                                   ResponseMapper mapper,
                                   AuditRecorder auditRecorder) {
        this.tenantLocaleService = tenantLocaleService;
        this.tenantService = tenantService;
        this.platformDefaults = platformDefaults;
        this.mapper = mapper;
        this.auditRecorder = auditRecorder;
    }

    /**
     * Every language of this municipality, offered or not.
     *
     * <p>Unlike the public catalogue this includes the disabled ones: an administrator is editing the
     * list and has to see what they turned off. The platform default travels with it so the form can
     * say what a citizen falls back to when this municipality's own default cannot serve them.</p>
     */
    @GetMapping("/locales")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Languages this municipality offers, including the disabled ones")
    public AdminDtos.TenantLocalesResponse locales() {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        return new AdminDtos.TenantLocalesResponse(toItems(tenantLocaleService.list(tenantId)),
                platformDefaults.locale());
    }

    /**
     * Replaces the whole list, as one form.
     *
     * <p>The coherence rules — at least one enabled, exactly one default, the default among the
     * enabled, no tag twice — are the domain's, not this controller's, so an import or a back-office
     * job cannot get a different answer than this endpoint.</p>
     */
    @PutMapping("/locales")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Replace the languages this municipality offers")
    public AdminDtos.TenantLocalesResponse updateLocales(
            @Valid @RequestBody AdminDtos.UpdateTenantLocalesRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        List<TenantLocaleService.LocaleEntry> entries = new ArrayList<>(request.locales().size());
        for (AdminDtos.TenantLocaleItem item : request.locales()) {
            entries.add(new TenantLocaleService.LocaleEntry(
                    item.locale(),
                    item.enabled() != null && item.enabled().booleanValue(),
                    item.isDefault() != null && item.isDefault().booleanValue(),
                    item.sortOrder() == null ? -1 : item.sortOrder().intValue()));
        }
        List<TenantLocale> saved = tenantLocaleService.replace(tenantId, entries);
        String enabled = saved.stream().filter(TenantLocale::isEnabled).map(TenantLocale::getLocale)
                .collect(Collectors.joining(","));
        String fallback = saved.stream().filter(TenantLocale::isDefaultLocale).map(TenantLocale::getLocale)
                .findFirst().orElse("-");
        auditRecorder.record(AuditAction.TENANT_LOCALES_UPDATED, "tenant-locales", tenantId.toString(),
                Map.of("enabled", enabled, "default", fallback));
        return new AdminDtos.TenantLocalesResponse(toItems(saved), platformDefaults.locale());
    }

    // --- visual identity (CONTRACT.md v0.4) --------------------------------------------------------

    @GetMapping("/branding")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Logo, brand colour and short name of this municipality")
    public AdminDtos.TenantBrandingResponse branding() {
        return mapper.toBranding(tenantService.require(TenantContextHolder.requireTenantId()));
    }

    /**
     * Replaces the visual identity of this municipality, as one form.
     *
     * <p>A null field means "this municipality has none", not "leave the old one": clearing a logo
     * has to be possible at all, and a partial update would make it unexpressible. The colour and the
     * logo key are validated by the domain — a colour that is not a colour paints nothing, and a logo
     * address that is not an absolute https one is a broken image on every screen of the product.</p>
     *
     * <p>The emblem itself is the municipality's: {@code generated:monogram} is the placeholder the
     * platform draws until they provide theirs, and it is what every municipality starts on.</p>
     */
    @PutMapping("/branding")
    @PreAuthorize("hasAuthority('PERM_TENANT_MANAGE')")
    @Operation(summary = "Replace the logo, brand colour and short name of this municipality")
    public AdminDtos.TenantBrandingResponse updateBranding(
            @Valid @RequestBody AdminDtos.UpdateTenantBrandingRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        Tenant tenant = tenantService.rebrand(tenantId,
                new TenantBranding(request.logoAssetKey(), request.brandColor(), request.shortName()),
                TenantContextHolder.requireUserId());
        auditRecorder.record(AuditAction.TENANT_BRANDING_UPDATED, "tenant", tenantId.toString(),
                Map.of("logoAssetKey", String.valueOf(tenant.getLogoAssetKey()),
                        "brandColor", String.valueOf(tenant.getBrandColor()),
                        "shortName", String.valueOf(tenant.getShortName())));
        return mapper.toBranding(tenant);
    }

    private List<AdminDtos.TenantLocaleItem> toItems(List<TenantLocale> locales) {
        List<AdminDtos.TenantLocaleItem> items = new ArrayList<>(locales.size());
        for (TenantLocale locale : locales) {
            items.add(new AdminDtos.TenantLocaleItem(locale.getLocale(), Boolean.valueOf(locale.isEnabled()),
                    Boolean.valueOf(locale.isDefaultLocale()), Integer.valueOf(locale.getSortOrder())));
        }
        return items;
    }
}
