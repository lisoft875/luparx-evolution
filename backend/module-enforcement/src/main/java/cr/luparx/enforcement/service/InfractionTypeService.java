package cr.luparx.enforcement.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.money.Money;
import cr.luparx.enforcement.entity.InfractionType;
import cr.luparx.enforcement.repository.InfractionTypeRepository;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.service.TenantService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The catalogue of what a municipality fines, and for how much.
 *
 * <p>Every value here is configuration owned by the municipal administrator. Nothing about it is
 * hardcoded — not the codes, not the amounts, not the deadlines — because the second municipality
 * fines different things and the second country fines them in a different currency, under a different
 * law, with a different discount for paying early.</p>
 *
 * <h2>The catalogue is edited, never emptied</h2>
 *
 * <p>{@link #replace} takes the whole catalogue and reconciles it: entries with an identifier are
 * updated, entries without one are created, and <b>entries that disappear from the payload are
 * deactivated, not deleted</b>. A type that has been used is referenced by citations that are years
 * old and by the reports built on them; deleting it to tidy a screen would orphan acts that a court
 * may still read. Deactivating removes it from the officer's list, which is what the administrator
 * actually wanted.</p>
 */
@Service
public class InfractionTypeService {

    /** Longest sensible payment window; a municipality that needs more is configuring something else. */
    private static final int MAX_DUE_DAYS = 365;

    private final InfractionTypeRepository repository;
    private final TenantService tenantService;
    private final Clock clock;

    public InfractionTypeService(InfractionTypeRepository repository, TenantService tenantService, Clock clock) {
        this.repository = repository;
        this.tenantService = tenantService;
        this.clock = clock;
    }

    /** The whole catalogue, as the administrator sees it: inactive kinds included. */
    @Transactional(readOnly = true)
    public List<InfractionType> list(TenantId tenantId) {
        return repository.findByTenantIdOrderBySortOrderAscCodeAsc(tenantId.value());
    }

    /** What the officer may choose from right now. */
    @Transactional(readOnly = true)
    public List<InfractionType> listActive(TenantId tenantId) {
        return repository.findByTenantIdAndActiveTrueOrderBySortOrderAscCodeAsc(tenantId.value());
    }

    @Transactional(readOnly = true)
    public InfractionType require(TenantId tenantId, UUID id) {
        return repository.findByTenantIdAndId(tenantId.value(), id)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.INFRACTION_TYPE_NOT_FOUND,
                        "error.enforcement.infractionType.notFound"));
    }

    /**
     * The type an officer is about to cite under. Separate from {@link #require} because "exists" and
     * "may be used" are different questions: a kind the municipality retired must not be citable, and
     * saying so with its own code is what lets the app refresh its catalogue instead of showing the
     * officer a dead end.
     */
    @Transactional(readOnly = true)
    public InfractionType requireCitable(TenantId tenantId, UUID id) {
        InfractionType type = require(tenantId, id);
        if (!type.isActive()) {
            throw new ValidationException("infractionTypeId", ErrorCode.INFRACTION_TYPE_INACTIVE,
                    "error.enforcement.infractionType.inactive");
        }
        return type;
    }

    /**
     * Replaces the catalogue of one municipality with the one the administrator submitted.
     *
     * @return the catalogue as it stands afterwards, in the order the officer will see it
     */
    @Transactional
    public List<InfractionType> replace(TenantId tenantId, List<Draft> drafts) {
        Tenant tenant = tenantService.requireActive(tenantId);
        Instant now = clock.instant();
        validate(drafts, tenant);

        Map<UUID, InfractionType> existing = repository.findByTenantIdOrderBySortOrderAscCodeAsc(tenantId.value())
                .stream()
                .collect(Collectors.toMap(InfractionType::getId, Function.identity()));
        Set<UUID> kept = new HashSet<>();
        List<InfractionType> result = new ArrayList<>(drafts.size());

        int order = 0;
        for (Draft draft : drafts) {
            Money fine = Money.ofMinor(draft.fineAmountMinor(), tenant.getCurrencyCode());
            InfractionType type;
            if (draft.id() != null && existing.containsKey(draft.id())) {
                type = existing.get(draft.id());
                // The code is the municipality's own identifier for the kind and is quoted on issued
                // citations; it is not re-assignable through an edit that was meant to fix a name.
                type.update(draft.name(), draft.description(), fine, draft.requiresPhoto(), draft.allowsAppeal(),
                        draft.discountDays(), draft.discountPercent(), draft.dueDays(), draft.active(), order, now);
            } else {
                type = new InfractionType(Uuid7.generate(), tenantId.value(), draft.code(), draft.name(),
                        draft.description(), fine, draft.requiresPhoto(), draft.allowsAppeal(), draft.discountDays(),
                        draft.discountPercent(), draft.dueDays(), order, now);
                if (!draft.active()) {
                    type.update(draft.name(), draft.description(), fine, draft.requiresPhoto(), draft.allowsAppeal(),
                            draft.discountDays(), draft.discountPercent(), draft.dueDays(), false, order, now);
                }
            }
            kept.add(type.getId());
            result.add(repository.save(type));
            order++;
        }

        for (InfractionType removed : existing.values()) {
            if (!kept.contains(removed.getId()) && removed.isActive()) {
                removed.update(removed.getName(), removed.getDescription(), removed.getFine(),
                        removed.isRequiresPhoto(), removed.isAllowsAppeal(), removed.getDiscountDays(),
                        removed.getDiscountPercent(), removed.getDueDays(), false, removed.getSortOrder(), now);
                repository.save(removed);
            }
        }
        return result;
    }

    private void validate(List<Draft> drafts, Tenant tenant) {
        ValidationException.Collector errors = new ValidationException.Collector();
        if (drafts == null || drafts.isEmpty()) {
            // An empty catalogue would leave the officers of a live municipality unable to cite
            // anything, which is a mistake far more often than an intention.
            errors.add("infractionTypes", ErrorCode.VALIDATION_FAILED, "error.enforcement.catalogue.empty");
            errors.throwIfAny();
        }
        Set<String> codes = new HashSet<>();
        Set<UUID> ids = new HashSet<>();
        for (int index = 0; index < drafts.size(); index++) {
            Draft draft = drafts.get(index);
            String field = "infractionTypes[" + index + "]";
            String code = draft.code() == null ? "" : draft.code().trim().toUpperCase(Locale.ROOT);
            if (code.isEmpty() || code.length() > 32) {
                errors.add(field + ".code", ErrorCode.VALIDATION_FAILED, "error.enforcement.infractionType.code");
            } else if (!codes.add(code)) {
                errors.add(field + ".code", ErrorCode.VALIDATION_FAILED, "error.enforcement.infractionType.codeTaken");
            }
            if (draft.id() != null && !ids.add(draft.id())) {
                errors.add(field + ".id", ErrorCode.VALIDATION_FAILED, "error.enforcement.infractionType.duplicateId");
            }
            if (draft.name() == null || draft.name().isBlank() || draft.name().length() > 160) {
                errors.add(field + ".name", ErrorCode.VALIDATION_FAILED, "error.enforcement.infractionType.name");
            }
            if (draft.fineAmountMinor() < 0L) {
                errors.add(field + ".fineAmountMinor", ErrorCode.VALIDATION_FAILED,
                        "error.enforcement.infractionType.amount");
            }
            if (draft.dueDays() < 1 || draft.dueDays() > MAX_DUE_DAYS) {
                errors.add(field + ".dueDays", ErrorCode.VALIDATION_FAILED, "error.enforcement.infractionType.dueDays");
            }
            boolean hasDiscountDays = draft.discountDays() != null;
            boolean hasDiscountPercent = draft.discountPercent() != null;
            if (hasDiscountDays != hasDiscountPercent) {
                // Half a discount is not a discount: either the municipality offers one or it does not.
                errors.add(field + ".discountDays", ErrorCode.VALIDATION_FAILED,
                        "error.enforcement.infractionType.discountIncomplete");
            } else if (hasDiscountDays) {
                if (draft.discountDays() < 1 || draft.discountDays() > draft.dueDays()) {
                    errors.add(field + ".discountDays", ErrorCode.VALIDATION_FAILED,
                            "error.enforcement.infractionType.discountDays");
                }
                if (draft.discountPercent() < 1 || draft.discountPercent() > 99) {
                    errors.add(field + ".discountPercent", ErrorCode.VALIDATION_FAILED,
                            "error.enforcement.infractionType.discountPercent");
                }
            }
        }
        errors.throwIfAny();
        // The currency is the municipality's, never a field on the request: two amounts in different
        // currencies inside one catalogue is a bug nobody notices until a report adds them up.
        if (tenant.getCurrencyCode() == null || tenant.getCurrencyCode().isBlank()) {
            throw new ValidationException("currencyCode", ErrorCode.VALIDATION_FAILED, "error.currency.invalid");
        }
    }

    /**
     * One entry as the administrator submitted it. A record rather than the entity: what arrives from
     * the wire is a request, and letting a controller hand a half-built entity to the domain is how
     * mass assignment gets in.
     */
    public record Draft(UUID id, String code, String name, String description, long fineAmountMinor,
                        boolean requiresPhoto, boolean allowsAppeal, Integer discountDays, Integer discountPercent,
                        int dueDays, boolean active) {

        public Draft {
            code = code == null ? null : code.trim().toUpperCase(Locale.ROOT);
            name = name == null ? null : name.trim();
            description = description == null || description.isBlank() ? null : description.trim();
        }
    }
}
