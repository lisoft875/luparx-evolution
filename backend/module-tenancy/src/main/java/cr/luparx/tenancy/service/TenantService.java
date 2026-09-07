package cr.luparx.tenancy.service;

import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.i18n.CountryCodes;
import cr.luparx.core.i18n.CurrencyCodes;
import cr.luparx.core.i18n.Locales;
import cr.luparx.core.i18n.TimeZones;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.page.SortDirection;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.entity.TenantSetting;
import cr.luparx.tenancy.model.SelfRegistrationPolicy;
import cr.luparx.tenancy.model.TenantSettingKey;
import cr.luparx.tenancy.model.TenantStatus;
import cr.luparx.tenancy.repository.TenantRepository;
import cr.luparx.tenancy.repository.TenantSettingRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Lifecycle of municipalities and their typed settings. Only the platform back-office calls the
 * mutating methods (CONTRACT.md §4); each of them is audited by the calling controller.
 */
@Service
public class TenantService {

    private static final Pattern SLUG_PATTERN = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");
    private static final List<String> SORTABLE_FIELDS =
            List.of("displayName", "legalName", "slug", "createdAt", "status");

    private final TenantRepository tenantRepository;
    private final TenantSettingRepository settingRepository;
    private final Clock clock;

    public TenantService(TenantRepository tenantRepository, TenantSettingRepository settingRepository, Clock clock) {
        this.tenantRepository = tenantRepository;
        this.settingRepository = settingRepository;
        this.clock = clock;
    }

    @Transactional
    public Tenant create(String slug, String legalName, String displayName, String countryCode, String currencyCode,
                         String locale, String timeZone, SelfRegistrationPolicy policy, UserId actor) {
        ValidationException.Collector errors = new ValidationException.Collector();
        String normalizedSlug = slug == null ? "" : slug.trim().toLowerCase(Locale.ROOT);
        if (!SLUG_PATTERN.matcher(normalizedSlug).matches()) {
            errors.add("slug", ErrorCode.VALIDATION_FAILED, "error.tenant.slug.invalid");
        }
        if (legalName == null || legalName.isBlank()) {
            errors.add("legalName", ErrorCode.VALIDATION_FAILED, "error.tenant.legalName.required");
        }
        if (displayName == null || displayName.isBlank()) {
            errors.add("displayName", ErrorCode.VALIDATION_FAILED, "error.tenant.displayName.required");
        }
        String country = CountryCodes.normalize(countryCode);
        if (!CountryCodes.isValid(country)) {
            errors.add("countryCode", ErrorCode.COUNTRY_NOT_FOUND, "error.country.invalid");
        }
        String currency = CurrencyCodes.normalize(currencyCode);
        if (!CurrencyCodes.isValid(currency)) {
            errors.add("currencyCode", ErrorCode.VALIDATION_FAILED, "error.currency.invalid");
        }
        if (!Locales.isValid(locale)) {
            errors.add("locale", ErrorCode.VALIDATION_FAILED, "error.locale.invalid");
        }
        if (!TimeZones.isValid(timeZone)) {
            errors.add("timeZone", ErrorCode.VALIDATION_FAILED, "error.timeZone.invalid");
        }
        errors.throwIfAny();

        if (tenantRepository.existsBySlug(normalizedSlug)) {
            throw ConflictException.of(ErrorCode.TENANT_SLUG_ALREADY_USED, "error.tenant.slug.taken", normalizedSlug);
        }

        Instant now = clock.instant();
        Tenant tenant = new Tenant(Uuid7.generate(), normalizedSlug, legalName.trim(), displayName.trim(), country,
                currency, locale, timeZone, TenantStatus.ACTIVE,
                policy == null ? SelfRegistrationPolicy.APPROVAL_REQUIRED : policy, now,
                actor == null ? null : actor.value());
        return tenantRepository.save(tenant);
    }

    @Transactional(readOnly = true)
    public Tenant require(TenantId tenantId) {
        return tenantRepository.findById(tenantId.value())
                .orElseThrow(() -> NotFoundException.of(ErrorCode.TENANT_NOT_FOUND, "error.tenant.notFound"));
    }

    @Transactional(readOnly = true)
    public Tenant requireActive(TenantId tenantId) {
        Tenant tenant = require(tenantId);
        if (!tenant.getStatus().allowsAccess()) {
            throw new ConflictException(ErrorCode.TENANT_NOT_ACTIVE, "error.tenant.notActive");
        }
        return tenant;
    }

    /** Publishable tenants for the unauthenticated catalogue: active only (SECURITY.md §1). */
    @Transactional(readOnly = true)
    public List<Tenant> listPublishable(String countryCode) {
        String country = CountryCodes.normalize(countryCode);
        if (country != null && CountryCodes.isValid(country)) {
            return tenantRepository.findByStatusAndCountryCodeOrderByDisplayNameAsc(TenantStatus.ACTIVE, country);
        }
        return tenantRepository.findByStatusOrderByDisplayNameAsc(TenantStatus.ACTIVE);
    }

    @Transactional(readOnly = true)
    public PageResponse<Tenant> search(String query, TenantStatus status, String countryCode, PageRequest request) {
        String term = (query == null || query.isBlank()) ? null : "%" + query.trim().toLowerCase(Locale.ROOT) + "%";
        String country = CountryCodes.normalize(countryCode);
        Page<Tenant> page = tenantRepository.search(term, status,
                (country != null && CountryCodes.isValid(country)) ? country : null, toPageable(request));
        return PageResponse.of(page.getContent(), request.page(), request.size(), page.getTotalElements());
    }

    @Transactional
    public Tenant update(TenantId tenantId, String legalName, String displayName, String currencyCode, String locale,
                         String timeZone, SelfRegistrationPolicy policy, UserId actor) {
        Tenant tenant = require(tenantId);
        ValidationException.Collector errors = new ValidationException.Collector();
        String currency = CurrencyCodes.normalize(currencyCode);
        if (!CurrencyCodes.isValid(currency)) {
            errors.add("currencyCode", ErrorCode.VALIDATION_FAILED, "error.currency.invalid");
        }
        if (!Locales.isValid(locale)) {
            errors.add("locale", ErrorCode.VALIDATION_FAILED, "error.locale.invalid");
        }
        if (!TimeZones.isValid(timeZone)) {
            errors.add("timeZone", ErrorCode.VALIDATION_FAILED, "error.timeZone.invalid");
        }
        if (legalName == null || legalName.isBlank()) {
            errors.add("legalName", ErrorCode.VALIDATION_FAILED, "error.tenant.legalName.required");
        }
        if (displayName == null || displayName.isBlank()) {
            errors.add("displayName", ErrorCode.VALIDATION_FAILED, "error.tenant.displayName.required");
        }
        errors.throwIfAny();

        tenant.rename(legalName.trim(), displayName.trim());
        tenant.reconfigure(currency, locale, timeZone,
                policy == null ? tenant.getSelfRegistrationPolicy() : policy);
        tenant.touch(clock.instant(), actor == null ? null : actor.value());
        return tenant;
    }

    @Transactional
    public Tenant changeStatus(TenantId tenantId, TenantStatus status, String reason, UserId actor) {
        Tenant tenant = require(tenantId);
        tenant.changeStatus(status, reason);
        tenant.touch(clock.instant(), actor == null ? null : actor.value());
        return tenant;
    }

    // --- settings --------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<TenantSetting> settings(TenantId tenantId) {
        return settingRepository.findByTenantIdOrderBySettingKeyAsc(tenantId.value());
    }

    @Transactional(readOnly = true)
    public Optional<TenantSetting> setting(TenantId tenantId, TenantSettingKey key) {
        return settingRepository.findByTenantIdAndSettingKey(tenantId.value(), key.name());
    }

    /**
     * Writes one typed setting. An unknown key is a validation error rather than a silently stored
     * row, so a typo can never become dead configuration.
     */
    @Transactional
    public TenantSetting putSetting(TenantId tenantId, String key, Map<String, Object> value, UserId actor) {
        TenantSettingKey settingKey = TenantSettingKey.fromName(key)
                .orElseThrow(() -> new ValidationException("key", ErrorCode.TENANT_SETTING_INVALID,
                        "error.tenant.setting.unknown"));
        if (value == null || !value.containsKey("value")) {
            throw new ValidationException("value", ErrorCode.TENANT_SETTING_INVALID,
                    "error.tenant.setting.valueRequired");
        }
        require(tenantId);
        Instant now = clock.instant();
        Optional<TenantSetting> existing =
                settingRepository.findByTenantIdAndSettingKey(tenantId.value(), settingKey.name());
        if (existing.isPresent()) {
            TenantSetting setting = existing.get();
            setting.update(value, now, actor == null ? null : actor.value());
            return setting;
        }
        return settingRepository.save(new TenantSetting(tenantId.value(), settingKey.name(), value, now,
                actor == null ? null : actor.value()));
    }

    /** Audit action name for a status change, kept here so callers do not invent their own strings. */
    public String statusChangeAuditAction() {
        return AuditAction.TENANT_STATUS_CHANGED;
    }

    private org.springframework.data.domain.Pageable toPageable(PageRequest request) {
        String field = request.sortField();
        if (field == null || !SORTABLE_FIELDS.contains(field)) {
            field = "displayName";
        }
        Sort sort = Sort.by(request.direction() == SortDirection.DESC
                ? Sort.Order.desc(field)
                : Sort.Order.asc(field));
        return org.springframework.data.domain.PageRequest.of(request.page(), request.size(), sort);
    }
}
