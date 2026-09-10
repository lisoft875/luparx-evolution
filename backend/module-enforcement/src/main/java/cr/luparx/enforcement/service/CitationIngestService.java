package cr.luparx.enforcement.service;

import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.enforcement.entity.Citation;
import cr.luparx.enforcement.entity.ExternalInfractionMapping;
import cr.luparx.enforcement.model.CitationStatus;
import cr.luparx.enforcement.model.PlateFormat;
import cr.luparx.enforcement.port.ParkingStatusPort;
import cr.luparx.enforcement.repository.CitationRepository;
import cr.luparx.enforcement.repository.ExternalInfractionMappingRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Receives citations raised in another system (CONTRACT.md v0.34).
 *
 * <h2>Qué es y qué no es</h2>
 *
 * <p>This is a <b>mirror</b>, not a second issuing path. Nothing here takes a number from the
 * municipality's series, computes a fine, decides a deadline or accepts money. It writes down what
 * another system already decided, so that the citizen, the officer and the office can see it in the
 * same place as everything else — and it refuses, everywhere, to let this platform behave as if it
 * had raised the act.</p>
 *
 * <h2>Idempotencia</h2>
 *
 * <p>The identity of a mirrored citation is {@code (municipality, system, external id)}, and it is a
 * unique index in the database rather than a check in this method. That is not belt and braces: the
 * other system will resend — after a timeout it never saw the answer to, as a nightly re-push of its
 * whole open ledger, or simply twice — and with two instances behind the load balancer two of those
 * arrive at two processes that both find nothing and both insert. The index is what settles it, and
 * catching its violation and reading the row back is what turns a race into the right answer instead
 * of a 500 the integrator has to interpret.</p>
 *
 * <h2>Un reingreso no reescribe el acto</h2>
 *
 * <p>A second ingest updates the state, the other system's word for it, the deadline and the amount.
 * It does <b>not</b> touch the plate, the causal, the place, the moment or the officer. An ingest
 * that could rewrite those would be a channel for editing history from outside this platform, and
 * mirroring exists precisely because this platform is not the one deciding. When those fields do
 * arrive changed, it is reported as a discrepancy for a person to resolve rather than applied
 * quietly: two systems disagreeing about what somebody was fined for is not a merge conflict.</p>
 */
@Service
public class CitationIngestService {

    /** Longest an ingest may claim an act happened in the future, allowing for a clock that drifts. */
    private static final long MAX_FUTURE_SKEW_MINUTES = 60L;

    private final CitationRepository citationRepository;
    private final ExternalInfractionMappingRepository mappingRepository;
    private final ParkingStatusPort parkingStatus;
    private final Clock clock;

    public CitationIngestService(CitationRepository citationRepository,
                                 ExternalInfractionMappingRepository mappingRepository,
                                 ParkingStatusPort parkingStatus,
                                 Clock clock) {
        this.citationRepository = citationRepository;
        this.mappingRepository = mappingRepository;
        this.parkingStatus = parkingStatus;
        this.clock = clock;
    }

    /**
     * Writes down one citation from another system, or refreshes the one already here.
     *
     * @return what happened, so the caller can answer 201 or 200 and the integrator can tell a first
     *         delivery from a repeat without guessing
     */
    @Transactional
    public Result ingest(TenantId tenantId, Command command) {
        validate(command);
        String system = command.sourceSystem().trim();
        String externalId = command.externalId().trim();

        Optional<Citation> existing = citationRepository
                .findByTenantIdAndSourceSystemAndExternalId(tenantId.value(), system, externalId);
        if (existing.isPresent()) {
            return refresh(existing.get(), command);
        }
        try {
            return new Result(insert(tenantId, system, externalId, command), Outcome.CREATED, List.of());
        } catch (DataIntegrityViolationException race) {
            // Another instance inserted the same external id between the lookup and this write. The
            // index did its job; reading the row back turns the collision into the answer the caller
            // wanted, which is the same answer their retry would have got a second later.
            Citation now = citationRepository
                    .findByTenantIdAndSourceSystemAndExternalId(tenantId.value(), system, externalId)
                    .orElseThrow(() -> race);
            return refresh(now, command);
        }
    }

    // --- writing -----------------------------------------------------------------------------------

    private Citation insert(TenantId tenantId, String system, String externalId, Command command) {
        String plate = command.plate().trim();
        String normalized = PlateFormat.normalize(plate);

        // The zone when its code happens to be one of ours, and nothing when it is not. A citation
        // whose sector we do not recognise is still a complete citation.
        UUID zoneId = parkingStatus.findZoneByCode(tenantId, command.zoneCode())
                .map(ParkingStatusPort.Zone::zoneId)
                .orElse(null);

        // The catalogue link only if somebody already mapped this code. Its absence costs the reports
        // an addition and costs the record nothing: the code, the name and the amount are copied in.
        UUID infractionTypeId = mappingRepository
                .findByTenantIdAndSourceSystemAndExternalCode(tenantId.value(), system, command.infractionCode().trim())
                .map(ExternalInfractionMapping::getInfractionTypeId)
                .orElse(null);

        Instant now = clock.instant();
        Citation citation = new Citation(
                Uuid7.generate(), tenantId.value(), system, externalId,
                command.number().trim(),
                plate, normalized,
                // The vehicle is linked only when the plate resolves to exactly one on the platform —
                // the same rule our own citations follow, and for the same reason: attaching a fine
                // to the wrong citizen is worse than attaching it to nobody.
                parkingStatus.findUniqueVehicleByPlate(normalized)
                        .map(ParkingStatusPort.RegisteredVehicle::vehicleId)
                        .orElse(null),
                zoneId, null, trimToNull(command.spaceCode()),
                command.latitude(), command.longitude(), trimToNull(command.addressText()),
                infractionTypeId, command.infractionCode().trim(), command.infractionName().trim(),
                command.fineAmountMinor(), command.currencyCode().trim().toUpperCase(java.util.Locale.ROOT),
                command.occurredAt(),
                // An act that arrives already raised was issued when the other system says it was,
                // and when it does not say, at the moment it happened. Never "now": stamping the
                // import time as the issue time would silently move every deadline.
                command.issuedAt() == null ? command.occurredAt() : command.issuedAt(),
                command.dueAt(),
                trimToNull(command.inspectorExternalRef()), trimToNull(command.inspectorName()),
                command.status(), trimToNull(command.externalStatus()),
                trimToNull(command.notes()), now);
        return citationRepository.save(citation);
    }

    private Result refresh(Citation citation, Command command) {
        List<String> discrepancies = discrepanciesOf(citation, command);
        citation.refreshFromSource(command.status(), trimToNull(command.externalStatus()), command.dueAt(),
                Long.valueOf(command.fineAmountMinor()), clock.instant());
        citationRepository.save(citation);
        return new Result(citation, Outcome.REFRESHED, discrepancies);
    }

    /**
     * What arrived different from what is written, among the things a re-ingest may not change.
     *
     * <p>Reported and not applied. The alternative — accepting the newer values — would mean the
     * plate on a citation could change months after the fact, from outside, with nothing to show for
     * it. Reporting costs the integrator a message they can act on; applying costs a citizen a fine
     * that is not theirs.</p>
     */
    private List<String> discrepanciesOf(Citation citation, Command command) {
        List<String> found = new java.util.ArrayList<>(2);
        if (!PlateFormat.normalize(command.plate().trim()).equals(citation.getPlateNormalized())) {
            found.add("plate");
        }
        if (!command.infractionCode().trim().equals(citation.getInfractionCode())) {
            found.add("infractionCode");
        }
        if (!command.occurredAt().equals(citation.getOccurredAt())) {
            found.add("occurredAt");
        }
        return List.copyOf(found);
    }

    // --- the causal mapping ------------------------------------------------------------------------

    /**
     * Points a foreign causal at one of ours, and applies it to the citations already here.
     *
     * @param limit how many existing citations to relink in this call. Bounded because switching the
     *              mirror on imports a municipality's whole open ledger, and one code can easily be
     *              on thousands of rows — a backfill that took them all in one transaction would be
     *              the first thing to time out on the day this is demonstrated. The caller repeats
     *              until it returns zero, which is also what makes it safe to retry.
     * @return how many citations were relinked
     */
    @Transactional
    public int map(TenantId tenantId, String sourceSystem, String externalCode, UUID infractionTypeId,
                   UUID actorUserId, int limit) {
        String system = requireText(sourceSystem, "sourceSystem");
        String code = requireText(externalCode, "externalCode");
        Instant now = clock.instant();

        ExternalInfractionMapping mapping = mappingRepository
                .findByTenantIdAndSourceSystemAndExternalCode(tenantId.value(), system, code)
                .orElse(null);
        if (mapping == null) {
            mapping = new ExternalInfractionMapping(Uuid7.generate(), tenantId.value(), system, code, null,
                    infractionTypeId, actorUserId, now);
        } else {
            mapping.retarget(infractionTypeId, null, now);
        }
        mappingRepository.save(mapping);

        List<Citation> pending = citationRepository.findUnmappedByCode(tenantId.value(), system, code,
                org.springframework.data.domain.PageRequest.of(0, Math.max(1, Math.min(limit, 500))))
                .getContent();
        for (Citation citation : pending) {
            // Only the catalogue link. The code, the name and the amount stay exactly as they
            // arrived: the mapping is how the reports add these up, never a correction of the act.
            citation.linkInfractionType(infractionTypeId, now);
            citationRepository.save(citation);
        }
        return pending.size();
    }

    @Transactional(readOnly = true)
    public List<ExternalInfractionMapping> mappings(TenantId tenantId) {
        return mappingRepository.findByTenantIdOrderBySourceSystemAscExternalCodeAsc(tenantId.value());
    }

    /** The foreign causals that arrived and are not mapped yet, busiest first. */
    @Transactional(readOnly = true)
    public List<UnmappedCausal> unmappedCausals(TenantId tenantId, int limit) {
        return citationRepository.findUnmappedCausals(tenantId.value(),
                        org.springframework.data.domain.PageRequest.of(0, Math.max(1, Math.min(limit, 200))))
                .stream()
                .map(row -> new UnmappedCausal((String) row[0], (String) row[1], (String) row[2],
                        ((Number) row[3]).longValue()))
                .toList();
    }

    // --- validation --------------------------------------------------------------------------------

    private void validate(Command command) {
        requireText(command.sourceSystem(), "sourceSystem");
        requireText(command.externalId(), "externalId");
        requireText(command.number(), "number");
        requireText(command.plate(), "plate");
        requireText(command.infractionCode(), "infractionCode");
        requireText(command.infractionName(), "infractionName");
        requireText(command.currencyCode(), "currencyCode");
        if (command.status() == null) {
            throw new ValidationException("status", ErrorCode.VALIDATION_FAILED,
                    "error.enforcement.ingest.status");
        }
        if (command.status() == CitationStatus.DRAFT) {
            // A draft is an act half-raised on one of our officers' devices. Nothing arriving from
            // outside is that, and accepting it would put a citation in a state only our own capture
            // flow knows how to finish.
            throw new ValidationException("status", ErrorCode.VALIDATION_FAILED,
                    "error.enforcement.ingest.statusDraft");
        }
        if (command.occurredAt() == null) {
            throw new ValidationException("occurredAt", ErrorCode.VALIDATION_FAILED,
                    "error.enforcement.ingest.occurredAt");
        }
        if (command.occurredAt().isAfter(clock.instant().plusSeconds(MAX_FUTURE_SKEW_MINUTES * 60L))) {
            // An hour of tolerance for a clock that drifts; beyond that it is a time zone bug in the
            // integration, and accepting it would put fines in the future on a citizen's screen.
            throw new ValidationException("occurredAt", ErrorCode.VALIDATION_FAILED,
                    "error.enforcement.ingest.occurredAtFuture");
        }
        if (command.fineAmountMinor() < 0L) {
            throw new ValidationException("fineAmountMinor", ErrorCode.VALIDATION_FAILED,
                    "error.enforcement.ingest.amount");
        }
        if (command.currencyCode().trim().length() != 3) {
            throw new ValidationException("currencyCode", ErrorCode.VALIDATION_FAILED,
                    "error.enforcement.ingest.currency");
        }
        if (PlateFormat.normalize(command.plate().trim()).isEmpty()) {
            throw new ValidationException("plate", ErrorCode.VALIDATION_FAILED, "error.enforcement.plate.invalid");
        }
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new ValidationException(field, ErrorCode.VALIDATION_FAILED, "error.enforcement.ingest.required");
        }
        return value.trim();
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /**
     * One citation as the other system describes it.
     *
     * <p>Everything the nine bullets of the checklist ask for, in the vocabulary of a system that is
     * not this one: it names its own officer, its own causal and its own number, and it does not know
     * our identifiers for anything.</p>
     *
     * @param status         mapped into our vocabulary, because a citizen's screen has to say
     *                       something they can act on. {@code externalStatus} carries the other
     *                       system's own word beside it, which is what the office will be quoted on
     *                       the telephone
     * @param zoneCode       the sector as that system calls it; linked when it happens to match one
     *                       of ours and simply absent when it does not
     */
    public record Command(String sourceSystem, String externalId, String number, String plate,
                          String infractionCode, String infractionName, long fineAmountMinor,
                          String currencyCode, Instant occurredAt, Instant issuedAt, Instant dueAt,
                          String zoneCode, String spaceCode, BigDecimal latitude, BigDecimal longitude,
                          String addressText, String inspectorExternalRef, String inspectorName,
                          CitationStatus status, String externalStatus, String notes) {
    }

    /** Whether this delivery wrote a citation or refreshed one, and what did not line up. */
    public record Result(Citation citation, Outcome outcome, List<String> discrepancies) {
    }

    public enum Outcome {
        /** First time this external id was seen. */
        CREATED,
        /** Already here; its state was refreshed and the act itself left alone. */
        REFRESHED
    }

    /** A foreign causal nobody has mapped yet, and how many citations are waiting on it. */
    public record UnmappedCausal(String sourceSystem, String externalCode, String externalName, long citations) {
    }
}
