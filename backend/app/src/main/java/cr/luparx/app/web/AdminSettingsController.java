package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.config.PlatformDefaultsProperties;
import cr.luparx.app.web.dto.AdminDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.tenancy.entity.TenantLocale;
import cr.luparx.tenancy.service.TenantLocaleService;
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
    private final PlatformDefaultsProperties platformDefaults;
    private final AuditRecorder auditRecorder;

    public AdminSettingsController(TenantLocaleService tenantLocaleService,
                                   PlatformDefaultsProperties platformDefaults,
                                   AuditRecorder auditRecorder) {
        this.tenantLocaleService = tenantLocaleService;
        this.platformDefaults = platformDefaults;
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

    private List<AdminDtos.TenantLocaleItem> toItems(List<TenantLocale> locales) {
        List<AdminDtos.TenantLocaleItem> items = new ArrayList<>(locales.size());
        for (TenantLocale locale : locales) {
            items.add(new AdminDtos.TenantLocaleItem(locale.getLocale(), Boolean.valueOf(locale.isEnabled()),
                    Boolean.valueOf(locale.isDefaultLocale()), Integer.valueOf(locale.getSortOrder())));
        }
        return items;
    }
}
