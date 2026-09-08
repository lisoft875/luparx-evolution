package cr.luparx.tenancy.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.i18n.Locales;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.entity.TenantLocale;
import cr.luparx.tenancy.repository.TenantLocaleRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * The languages a municipality offers, and which of them it falls back to (CONTRACT.md v0.3,
 * "Idiomas por municipalidad").
 *
 * <p>A municipality that has configured nothing is not an error and is not empty: it is answered
 * with the single language it was created with ({@code tenants.locale}), materialised as a real row
 * the first time anybody asks. That is the same arrangement {@code ParkingPolicyService} uses, and
 * for the same reason — an administrator must be able to edit a list, not conjure one.</p>
 */
@Service
public class TenantLocaleService {

    private final TenantLocaleRepository repository;
    private final TenantService tenantService;
    private final Clock clock;

    public TenantLocaleService(TenantLocaleRepository repository, TenantService tenantService, Clock clock) {
        this.repository = repository;
        this.tenantService = tenantService;
        this.clock = clock;
    }

    /**
     * Every language of a municipality, offered or not, in the configured order. Materialises the
     * first row when there is none, which is why it is not read-only.
     */
    @Transactional
    public List<TenantLocale> list(TenantId tenantId) {
        List<TenantLocale> existing = repository.findByTenantIdOrderBySortOrderAscLocaleAsc(tenantId.value());
        if (!existing.isEmpty()) {
            return existing;
        }
        Tenant tenant = tenantService.require(tenantId);
        String tag = Locales.parse(tenant.getLocale()).map(Locale::toLanguageTag).orElse(null);
        if (tag == null) {
            // A tenant whose locale column cannot be parsed is a data problem, not a reason to fail a
            // read: the caller falls back to the platform default.
            return List.of();
        }
        Instant now = clock.instant();
        return List.of(repository.save(new TenantLocale(Uuid7.generate(), tenantId.value(), tag, true, true, 0,
                now)));
    }

    /** Only what citizens can actually pick. This is what the login dropdown shows. */
    @Transactional
    public List<TenantLocale> listEnabled(TenantId tenantId) {
        List<TenantLocale> all = list(tenantId);
        List<TenantLocale> enabled = new ArrayList<>(all.size());
        for (TenantLocale locale : all) {
            if (locale.isEnabled()) {
                enabled.add(locale);
            }
        }
        return enabled;
    }

    /**
     * Replaces the whole list, as one form.
     *
     * <p>The coherence rules live here and not in a controller because they are domain rules and must
     * hold whatever calls this — an admin endpoint today, an import tomorrow:</p>
     * <ul>
     *   <li>every tag has to be a parseable BCP 47 tag, stored canonicalised, and no tag twice;</li>
     *   <li>at least one language has to be enabled, or the portals of that municipality would have
     *       nothing to render;</li>
     *   <li>exactly one default, and the default has to be one of the enabled ones — a fallback
     *       nobody can select is a dead end.</li>
     * </ul>
     */
    @Transactional
    public List<TenantLocale> replace(TenantId tenantId, List<LocaleEntry> entries) {
        tenantService.require(tenantId);
        ValidationException.Collector errors = new ValidationException.Collector();
        if (entries == null || entries.isEmpty()) {
            errors.add("locales", ErrorCode.VALIDATION_FAILED, "error.tenant.locales.required");
            errors.throwIfAny();
        }

        List<LocaleEntry> canonical = new ArrayList<>(entries.size());
        Set<String> seen = new HashSet<>();
        int enabledCount = 0;
        int defaultCount = 0;
        for (int index = 0; index < entries.size(); index++) {
            LocaleEntry entry = entries.get(index);
            String tag = Locales.parse(entry == null ? null : entry.locale()).map(Locale::toLanguageTag)
                    .orElse(null);
            if (tag == null) {
                errors.add("locales[" + index + "].locale", ErrorCode.VALIDATION_FAILED, "error.locale.invalid");
                continue;
            }
            if (!seen.add(tag)) {
                errors.add("locales[" + index + "].locale", ErrorCode.VALIDATION_FAILED,
                        "error.tenant.locales.duplicate");
                continue;
            }
            if (entry.enabled()) {
                enabledCount++;
            }
            if (entry.defaultLocale()) {
                defaultCount++;
                if (!entry.enabled()) {
                    errors.add("locales[" + index + "].isDefault", ErrorCode.VALIDATION_FAILED,
                            "error.tenant.locales.defaultDisabled");
                }
            }
            canonical.add(new LocaleEntry(tag, entry.enabled(), entry.defaultLocale(),
                    entry.sortOrder() < 0 ? index : entry.sortOrder()));
        }
        if (enabledCount == 0) {
            errors.add("locales", ErrorCode.VALIDATION_FAILED, "error.tenant.locales.noneEnabled");
        }
        if (defaultCount != 1) {
            errors.add("locales", ErrorCode.VALIDATION_FAILED, "error.tenant.locales.oneDefault");
        }
        errors.throwIfAny();

        Instant now = clock.instant();
        // Delete-then-insert rather than a diff: the list is a handful of rows, it is replaced as one
        // form, and the partial unique index on the default would make an in-place diff order-sensitive
        // (two rows momentarily holding is_default = true would violate it mid-update).
        repository.deleteByTenantId(tenantId.value());
        repository.flush();
        List<TenantLocale> saved = new ArrayList<>(canonical.size());
        for (LocaleEntry entry : canonical) {
            saved.add(repository.save(new TenantLocale(Uuid7.generate(), tenantId.value(), entry.locale(),
                    entry.enabled(), entry.defaultLocale(), entry.sortOrder(), now)));
        }
        saved.sort((left, right) -> {
            int bySort = Integer.compare(left.getSortOrder(), right.getSortOrder());
            return bySort != 0 ? bySort : left.getLocale().compareTo(right.getLocale());
        });
        return saved;
    }

    /**
     * One row of the form.
     *
     * @param locale       BCP 47 tag as the administrator typed it; canonicalised before it is stored
     * @param enabled      whether citizens may pick it
     * @param defaultLocale whether it is this municipality's fallback; exactly one row carries it
     * @param sortOrder    position in the dropdown; a negative value means "keep the order sent"
     */
    public record LocaleEntry(String locale, boolean enabled, boolean defaultLocale, int sortOrder) {
    }
}
