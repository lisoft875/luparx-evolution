package cr.luparx.enforcement.service;

import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.enforcement.entity.EnforcementCheck;
import cr.luparx.enforcement.model.LocationState;
import cr.luparx.enforcement.model.PlateFormat;
import cr.luparx.enforcement.model.PlateVerdict;
import cr.luparx.enforcement.repository.EnforcementCheckRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

/**
 * The fiscalisation log: every plate an officer looked up, and what the platform answered
 * (CONTRACT.md v0.29).
 *
 * <p>It answers three questions that had no answer before, and all three get asked: "they fined me
 * without coming to look at the car", "this officer ran his neighbour's plate", and "what did this
 * officer do on Tuesday" — which until now could only be answered for the shifts in which they
 * happened to write a ticket.</p>
 */
@Service
public class EnforcementCheckService {

    private final EnforcementCheckRepository checkRepository;
    private final Clock clock;

    public EnforcementCheckService(EnforcementCheckRepository checkRepository, Clock clock) {
        this.checkRepository = checkRepository;
        this.clock = clock;
    }

    /**
     * Records one lookup — the answered ones and the refused ones alike.
     *
     * <p><b>In its own transaction</b>, and that is the whole reason this method exists rather than
     * an inline save. A refused lookup throws, and a record written inside the failing transaction
     * would roll back with it: the attempts most worth keeping — the officer who queried a sector
     * they do not cover — would be exactly the ones that left no trace. This commits either way.</p>
     *
     * <p>Nothing about location is invented. The caller passes what the device actually reported,
     * including which of the three "no coordinates" cases it was, and the entity drops any position
     * that arrives without a fix.</p>
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public EnforcementCheck record(TenantId tenantId, UserId inspector, String plateRaw, UUID zoneId,
                                   String spaceCode, PlateVerdict verdict, String refusalCode,
                                   LocationState locationState, BigDecimal latitude, BigDecimal longitude,
                                   BigDecimal accuracyM, String userAgent, String ipHash) {
        // The plate is normalised leniently here: a lookup refused because the plate was unreadable
        // is still a lookup that happened, and refusing to record it would drop the one case where
        // the officer typed something they should not have.
        String normalized = PlateFormat.normalizeFragment(plateRaw);
        return checkRepository.save(new EnforcementCheck(
                Uuid7.generate(),
                tenantId.value(),
                inspector.value(),
                truncate(plateRaw, 32),
                normalized.isEmpty() ? "0" : normalized,
                zoneId,
                truncate(spaceCode, 32),
                verdict,
                truncate(refusalCode, 64),
                locationState,
                latitude,
                longitude,
                accuracyM,
                truncate(userAgent, 400),
                ipHash,
                clock.instant()));
    }

    /**
     * The activity screen.
     *
     * <p>{@code from}/{@code to} are mandatory and bounded by the caller: this is the largest table
     * the platform has, and "all of it, newest first" is a query that gets slower every day the
     * municipality operates.</p>
     */
    @Transactional(readOnly = true)
    public PageResponse<EnforcementCheck> search(TenantId tenantId, UUID inspector, UUID zoneId,
                                                 String plateFragment, PlateVerdict verdict,
                                                 Instant from, Instant to, PageRequest request) {
        Pageable pageable = org.springframework.data.domain.PageRequest.of(request.page(), request.size());
        String fragment = plateFragment == null || plateFragment.isBlank()
                ? null
                : "%" + PlateFormat.normalizeFragment(plateFragment) + "%";
        Page<EnforcementCheck> page = checkRepository.search(tenantId.value(), inspector, zoneId, fragment,
                verdict, from, to, pageable);
        return PageResponse.of(page.getContent(), request.page(), request.size(), page.getTotalElements());
    }

    /** How many rows are past the retention cutoff, so the purge can say something true. */
    @Transactional(readOnly = true)
    public long countDueForPurge(Instant cutoff) {
        return checkRepository.countByOccurredAtBefore(cutoff);
    }

    /**
     * Deletes one batch older than the cutoff and answers how many went.
     *
     * <p>One batch per transaction on purpose: a single statement over a year of a busy
     * municipality's lookups holds a long lock on the table officers are writing to right now, and
     * the officer in the street does not care that it is purge night.</p>
     *
     * <p>Not narrowed by tenant, and that is deliberate: retention is a platform obligation about
     * age, not a municipality's decision about its own data, and a per-tenant purge would leave the
     * oldest rows of a municipality nobody remembers to run it for.</p>
     */
    @Transactional
    public int purgeBatch(Instant cutoff, int batchSize) {
        return checkRepository.deleteBatchOlderThan(cutoff, batchSize);
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }
}
