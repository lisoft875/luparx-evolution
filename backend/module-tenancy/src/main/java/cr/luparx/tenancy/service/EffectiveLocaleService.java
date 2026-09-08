package cr.luparx.tenancy.service;

import cr.luparx.core.i18n.Locales;
import cr.luparx.core.id.TenantId;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.entity.TenantLocale;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;

/**
 * The one place that answers "which language is this request in?" (CONTRACT.md v0.3, "Idiomas por
 * municipalidad").
 *
 * <p>The rule is short and it is deterministic:</p>
 *
 * <ol>
 *   <li>the user's own preference, <b>if the municipality offers it</b>;</li>
 *   <li>otherwise the municipality's default;</li>
 *   <li>otherwise the language the municipality was created with;</li>
 *   <li>otherwise the platform default.</li>
 * </ol>
 *
 * <p>A preference the municipality does not offer is not honoured, and that is the point: a portal
 * that has no translations for Norwegian cannot serve a Norwegian citizen a half-translated screen
 * just because their profile says so. It falls back, visibly and predictably.</p>
 *
 * <p>It is a service, not four lines repeated in every controller, because the moment the rule lives
 * in more than one place the places start disagreeing — and a fallback that differs between the API,
 * an email and a PDF is a bug nobody can reproduce. The platform default arrives as a constructor
 * argument ({@code platform.defaults.locale}), so this class stays free of deployment concerns and
 * module-tenancy keeps knowing nothing about YAML. It is assembled once in the application module,
 * exactly like {@code MfaPolicy} and {@code RegistrationPolicy}.</p>
 */
public class EffectiveLocaleService {

    private final TenantLocaleService tenantLocaleService;
    private final TenantService tenantService;
    private final String platformDefaultLocale;

    public EffectiveLocaleService(TenantLocaleService tenantLocaleService,
                                  TenantService tenantService,
                                  String platformDefaultLocale) {
        this.tenantLocaleService = tenantLocaleService;
        this.tenantService = tenantService;
        this.platformDefaultLocale = platformDefaultLocale;
    }

    /**
     * Resolves the effective locale.
     *
     * @param preferredTag the user's preference, or null when they have none
     * @param tenantId     the active municipality, or null (a platform session, or a caller with no
     *                     municipality yet) — in which case only the preference and the platform
     *                     default apply
     */
    @Transactional
    public Locale resolve(String preferredTag, TenantId tenantId) {
        if (tenantId == null) {
            return Locales.parse(preferredTag).orElseGet(this::platformDefault);
        }
        List<TenantLocale> offered = tenantLocaleService.listEnabled(tenantId);
        String preferred = Locales.parse(preferredTag).map(Locale::toLanguageTag).orElse(null);
        if (preferred != null) {
            for (TenantLocale candidate : offered) {
                if (candidate.getLocale().equalsIgnoreCase(preferred)) {
                    return Locale.forLanguageTag(candidate.getLocale());
                }
            }
        }
        for (TenantLocale candidate : offered) {
            if (candidate.isDefaultLocale()) {
                return Locale.forLanguageTag(candidate.getLocale());
            }
        }
        Tenant tenant = tenantService.require(tenantId);
        return Locales.parse(tenant.getLocale()).orElseGet(this::platformDefault);
    }

    /** The same answer as {@link #resolve}, as the BCP 47 tag that goes on the wire. */
    @Transactional
    public String resolveTag(String preferredTag, TenantId tenantId) {
        return resolve(preferredTag, tenantId).toLanguageTag();
    }

    /**
     * Whether a municipality offers a language at all. Used where a value is being <em>stored</em>
     * rather than rendered, so an unsupported choice is refused instead of silently downgraded.
     */
    @Transactional
    public boolean isOfferedBy(TenantId tenantId, String tag) {
        String candidate = Locales.parse(tag).map(Locale::toLanguageTag).orElse(null);
        if (candidate == null || tenantId == null) {
            return false;
        }
        for (TenantLocale offered : tenantLocaleService.listEnabled(tenantId)) {
            if (offered.getLocale().equalsIgnoreCase(candidate)) {
                return true;
            }
        }
        return false;
    }

    private Locale platformDefault() {
        return Locales.parse(platformDefaultLocale).orElse(Locale.ROOT);
    }
}
