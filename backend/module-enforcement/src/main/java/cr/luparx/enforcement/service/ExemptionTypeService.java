package cr.luparx.enforcement.service;

import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.enforcement.entity.ExemptionType;
import cr.luparx.enforcement.repository.ExemptionTypeRepository;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.service.TenantService;
import org.springframework.context.MessageSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * The catalogue of permit categories a municipality grants exemptions under (CONTRACT.md v0.30).
 *
 * <h2>Why this is configuration and not an enumeration</h2>
 *
 * <p>The product asked for four categories — disability, institutional vehicle, courtesy, special
 * permit — and v0.28 argued against writing them into the schema, because what one country exempts is
 * not what another does and a fixed list would be Costa Rican law compiled into the platform. Both
 * are satisfied by making the category <b>configuration</b>: the four are seeded, and a municipality
 * renames them, retires them or adds its own without a deployment.</p>
 *
 * <h2>Seeded lazily, in the municipality's own language</h2>
 *
 * <p>V29_0 seeded every municipality that existed when it ran. One created afterwards would open an
 * empty catalogue and be unable to register a single permit, so the catalogue is created on first
 * read instead — the same {@code orElseGet} shape {@link CitationNumberService} uses, for the same
 * reason: {@code module-tenancy} must not call into {@code module-enforcement} when a municipality is
 * created, and a listener that fires on tenant creation would put the catalogue's existence at the
 * mercy of an event nobody sees fail.</p>
 *
 * <p>The names come from the message bundle in the municipality's configured locale, never from
 * literals here. A municipality in another country reads its catalogue in its own language on the day
 * it is created, and edits it from there.</p>
 */
@Service
public class ExemptionTypeService {

    /** The categories the product asked for. Seeded, never enforced: nothing in the code branches on
     *  a code, and a municipality is free to retire every one of them. */
    private static final List<Default> DEFAULTS = List.of(
            new Default("DISABILITY", true),
            new Default("INSTITUTIONAL", true),
            new Default("COURTESY", false),
            new Default("SPECIAL", true));

    private static final int MAX_CODE = 32;
    private static final int MAX_NAME = 120;
    private static final int MAX_DESCRIPTION = 400;

    private final ExemptionTypeRepository repository;
    private final TenantService tenantService;
    private final MessageSource messages;
    private final Clock clock;

    public ExemptionTypeService(ExemptionTypeRepository repository, TenantService tenantService,
                                MessageSource messages, Clock clock) {
        this.repository = repository;
        this.tenantService = tenantService;
        this.messages = messages;
        this.clock = clock;
    }

    /** The whole catalogue, as the administrator sees it: retired categories included. */
    @Transactional
    public List<ExemptionType> list(TenantId tenantId) {
        ensureSeeded(tenantId);
        return repository.findByTenantIdOrderByNameAsc(tenantId.value());
    }

    /** What a permit may be registered under right now. */
    @Transactional
    public List<ExemptionType> listActive(TenantId tenantId) {
        ensureSeeded(tenantId);
        return repository.findByTenantIdAndActiveTrueOrderByNameAsc(tenantId.value());
    }

    @Transactional(readOnly = true)
    public ExemptionType require(TenantId tenantId, UUID id) {
        return repository.findByTenantIdAndId(tenantId.value(), id)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.EXEMPTION_TYPE_NOT_FOUND,
                        "error.exemption.type.notFound"));
    }

    /**
     * The category a permit is about to be registered under.
     *
     * <p>Separate from {@link #require} because "exists" and "may be used" are different questions: a
     * category the municipality retired must not take new permits, while the ones granted under it
     * years ago still read correctly.</p>
     */
    @Transactional(readOnly = true)
    public ExemptionType requireUsable(TenantId tenantId, UUID id) {
        ExemptionType type = require(tenantId, id);
        if (!type.isActive()) {
            throw new ValidationException("exemptionTypeId", ErrorCode.EXEMPTION_TYPE_INACTIVE,
                    "error.exemption.type.inactive");
        }
        return type;
    }

    @Transactional
    public ExemptionType create(TenantId tenantId, String code, String name, String description,
                                boolean requiresBeneficiary) {
        ensureSeeded(tenantId);
        String normalizedCode = normalizeCode(code);
        validate(normalizedCode, name, description);
        repository.findByTenantIdAndCode(tenantId.value(), normalizedCode).ifPresent(existing -> {
            throw ConflictException.of(ErrorCode.EXEMPTION_TYPE_CODE_TAKEN, "error.exemption.type.codeTaken",
                    normalizedCode);
        });
        Instant now = clock.instant();
        return repository.save(new ExemptionType(Uuid7.generate(), tenantId.value(), normalizedCode, name.trim(),
                blankToNull(description), requiresBeneficiary, now));
    }

    /**
     * Renames a category, changes what it demands, or retires it.
     *
     * <p>The code is not editable and retiring is not deleting: permits granted years ago point here,
     * and a category that disappeared would leave them explaining nothing.</p>
     */
    @Transactional
    public ExemptionType update(TenantId tenantId, UUID id, String name, String description,
                                boolean requiresBeneficiary, boolean active) {
        ExemptionType type = require(tenantId, id);
        validate(type.getCode(), name, description);
        type.update(name.trim(), blankToNull(description), requiresBeneficiary, active, clock.instant());
        return repository.save(type);
    }

    /**
     * Creates this municipality's catalogue the first time somebody looks at it.
     *
     * <p>Two requests can arrive together; the unique index on {@code (tenant_id, code)} decides, and
     * the loser re-reads what the winner inserted rather than failing a screen that is otherwise
     * perfectly valid — the same reasoning as the citation series.</p>
     */
    private void ensureSeeded(TenantId tenantId) {
        if (repository.existsByTenantId(tenantId.value())) {
            return;
        }
        Tenant tenant = tenantService.requireActive(tenantId);
        Locale locale = localeOf(tenant);
        Instant now = clock.instant();
        try {
            for (Default entry : DEFAULTS) {
                String key = "exemption.type." + entry.code().toLowerCase(Locale.ROOT);
                repository.saveAndFlush(new ExemptionType(Uuid7.generate(), tenantId.value(), entry.code(),
                        text(key + ".name", locale), text(key + ".description", locale),
                        entry.requiresBeneficiary(), now));
            }
        } catch (DataIntegrityViolationException concurrent) {
            // Somebody else seeded it between the check and the insert. Theirs is as good as ours.
        }
    }

    private String text(String key, Locale locale) {
        return messages.getMessage(key, null, locale);
    }

    /**
     * The municipality's configured locale, falling back to the bundle default.
     *
     * <p>A tenant with an unusable language tag is a configuration bug, not a reason to refuse the
     * screen — and the fallback is stated here rather than silently assumed somewhere else.</p>
     */
    private static Locale localeOf(Tenant tenant) {
        try {
            Locale locale = Locale.forLanguageTag(tenant.getLocale());
            return locale.getLanguage().isEmpty() ? Locale.ROOT : locale;
        } catch (RuntimeException invalid) {
            return Locale.ROOT;
        }
    }

    private static void validate(String code, String name, String description) {
        ValidationException.Collector errors = new ValidationException.Collector();
        if (code == null || code.isEmpty() || code.length() > MAX_CODE || !code.matches("[A-Z0-9_]+")) {
            errors.add("code", ErrorCode.VALIDATION_FAILED, "error.exemption.type.code");
        }
        if (name == null || name.isBlank() || name.trim().length() > MAX_NAME) {
            errors.add("name", ErrorCode.VALIDATION_FAILED, "error.exemption.type.name");
        }
        if (description != null && description.trim().length() > MAX_DESCRIPTION) {
            errors.add("description", ErrorCode.VALIDATION_FAILED, "error.exemption.type.description");
        }
        errors.throwIfAny();
    }

    private static String normalizeCode(String code) {
        return code == null ? null : code.trim().toUpperCase(Locale.ROOT);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /** One seeded category: its code and whether it demands a named beneficiary. */
    private record Default(String code, boolean requiresBeneficiary) {
    }
}
