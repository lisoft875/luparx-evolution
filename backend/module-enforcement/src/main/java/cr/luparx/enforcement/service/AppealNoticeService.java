package cr.luparx.enforcement.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.enforcement.entity.AppealNotice;
import cr.luparx.enforcement.repository.AppealNoticeRepository;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.service.TenantService;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * The legal notice a citizen must read before writing a defence.
 *
 * <h2>Resolution, in one place</h2>
 *
 * <ol>
 *   <li>the municipality's newest version already in force for the requested locale;</li>
 *   <li>otherwise the same for the municipality's own default locale;</li>
 *   <li>otherwise the country default for either locale.</li>
 * </ol>
 *
 * <p>Deterministic and written down, because "which text did we show?" is the question this whole
 * mechanism exists to answer. A version whose {@code effective_from} is in the future is invisible:
 * a municipality drafts next month's wording today and the citizen keeps accepting the current one
 * until the date arrives.</p>
 *
 * <h2>Versions are added, never edited</h2>
 *
 * <p>{@link #publish} always inserts. Editing a notice in place would silently rewrite what people
 * accepted in the past, which is the one thing a versioned legal text must never do.</p>
 *
 * <p><b>The seeded Costa Rican wording is a starting point and not legal advice.</b> It cites
 * articles 145–147 of the Costa Rican penal code (Ley 4573) and it must be reviewed and approved by
 * the client's lawyer before production. It is data, not code, exactly so that their lawyer can
 * correct it from the admin portal without waiting for a release.</p>
 */
@Service
public class AppealNoticeService {

    private static final int MAX_BODY = 8000;

    private final AppealNoticeRepository repository;
    private final TenantService tenantService;
    private final Clock clock;

    public AppealNoticeService(AppealNoticeRepository repository, TenantService tenantService, Clock clock) {
        this.repository = repository;
        this.tenantService = tenantService;
        this.clock = clock;
    }

    /**
     * The notice in force for this municipality, or empty when neither it nor its country has one.
     *
     * @param locale the citizen's effective locale; the municipality's own is used as the fallback
     */
    @Transactional(readOnly = true)
    public Optional<AppealNotice> current(TenantId tenantId, String locale) {
        Tenant tenant = tenantService.require(tenantId);
        Instant now = clock.instant();
        PageRequest one = PageRequest.of(0, 1);
        String requested = locale == null || locale.isBlank() ? tenant.getLocale() : locale.trim();

        List<AppealNotice> own = repository.currentForTenant(tenantId.value(), requested, now, one);
        if (!own.isEmpty()) {
            return Optional.of(own.get(0));
        }
        if (!requested.equals(tenant.getLocale())) {
            own = repository.currentForTenant(tenantId.value(), tenant.getLocale(), now, one);
            if (!own.isEmpty()) {
                return Optional.of(own.get(0));
            }
        }
        List<AppealNotice> country = repository.currentForCountry(tenant.getCountryCode(), requested, now, one);
        if (!country.isEmpty()) {
            return Optional.of(country.get(0));
        }
        country = repository.currentForCountry(tenant.getCountryCode(), tenant.getLocale(), now, one);
        return country.isEmpty() ? Optional.empty() : Optional.of(country.get(0));
    }

    /**
     * The notice, or a refusal.
     *
     * <p>A municipality with no notice at all cannot accept defences: the citizen would be filing a
     * document without having been told what filing it means. Answering with its own code lets the
     * portal say "the municipality has not published the notice yet" instead of failing silently.</p>
     */
    @Transactional(readOnly = true)
    public AppealNotice require(TenantId tenantId, String locale) {
        return current(tenantId, locale).orElseThrow(() -> NotFoundException.of(ErrorCode.APPEAL_NOTICE_NOT_FOUND,
                "error.enforcement.appeal.noticeMissing"));
    }

    @Transactional(readOnly = true)
    public AppealNotice requireById(java.util.UUID noticeId) {
        return repository.findById(noticeId).orElseThrow(() -> NotFoundException.of(
                ErrorCode.APPEAL_NOTICE_NOT_FOUND, "error.enforcement.appeal.noticeMissing"));
    }

    /** Every version this municipality has published for a locale, newest first. */
    @Transactional(readOnly = true)
    public List<AppealNotice> history(TenantId tenantId, String locale) {
        Tenant tenant = tenantService.require(tenantId);
        String requested = locale == null || locale.isBlank() ? tenant.getLocale() : locale.trim();
        return repository.findByTenantIdAndLocaleOrderByVersionDesc(tenantId.value(), requested);
    }

    /**
     * Publishes a new version for this municipality.
     *
     * @param effectiveFrom when it starts being the one shown; null means immediately
     */
    @Transactional
    public AppealNotice publish(TenantId tenantId, String locale, String body, Instant effectiveFrom, UserId actor) {
        Tenant tenant = tenantService.requireActive(tenantId);
        ValidationException.Collector errors = new ValidationException.Collector();
        String text = body == null ? "" : body.trim();
        if (text.isEmpty() || text.length() > MAX_BODY) {
            errors.add("body", ErrorCode.VALIDATION_FAILED, "error.enforcement.appeal.noticeBody");
        }
        String target = locale == null || locale.isBlank() ? tenant.getLocale() : locale.trim();
        if (target.length() > 35) {
            errors.add("locale", ErrorCode.VALIDATION_FAILED, "error.locale.invalid");
        }
        errors.throwIfAny();

        Instant now = clock.instant();
        int next = repository.highestTenantVersion(tenantId.value(), target) + 1;
        return repository.save(AppealNotice.forTenant(Uuid7.generate(), tenantId.value(), target, next, text,
                effectiveFrom == null ? now : effectiveFrom, actor == null ? null : actor.value(), now));
    }
}
