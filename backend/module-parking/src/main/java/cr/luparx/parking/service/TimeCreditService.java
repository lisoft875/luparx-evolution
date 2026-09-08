package cr.luparx.parking.service;

import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.parking.entity.ParkingTimeCredit;
import cr.luparx.parking.entity.ParkingTimeCreditEntry;
import cr.luparx.parking.model.TimeCreditSource;
import cr.luparx.parking.repository.ParkingTimeCreditEntryRepository;
import cr.luparx.parking.repository.ParkingTimeCreditRepository;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * The citizen's minutes in one municipality: granting them, spending them and letting them expire.
 *
 * <p>Minutes are not money (CONTRACT.md v0.2, rule 5). They are earned by finishing a session early,
 * they are spent <em>first</em> on the next session in the same municipality, they expire on the
 * schedule that municipality configured, and they are never converted back into a wallet balance.
 * Nothing in this class can move minutes across tenants, because every read and write is keyed by
 * {@code (tenantId, userId)}.</p>
 *
 * <h2>Why lots</h2>
 *
 * <p>The balance on {@link ParkingTimeCredit} is authoritative, but it is not the whole model: each
 * grant is a lot with its own expiry and its own unspent remainder. Consumption takes from the lot
 * that expires soonest, which is the only rule that does not quietly destroy value, and an expiry
 * can be applied to exactly the minutes that expired instead of to an undifferentiated pool.</p>
 *
 * <h2>Expiry without a scheduler</h2>
 *
 * <p>Expired lots are swept lazily, on the reads and writes that care ({@link #availableMinutes} and
 * {@link #consume}). There is no background job and no process-local timer: a lazy sweep is
 * idempotent, correct with any number of instances, and cannot leave a citizen able to spend minutes
 * that expired while nothing was running. A scheduled sweep can be added later for tidiness; it
 * would not change any answer this class gives.</p>
 */
@Service
public class TimeCreditService {

    private final ParkingTimeCreditRepository creditRepository;
    private final ParkingTimeCreditEntryRepository entryRepository;
    private final Clock clock;

    public TimeCreditService(ParkingTimeCreditRepository creditRepository,
                             ParkingTimeCreditEntryRepository entryRepository,
                             Clock clock) {
        this.creditRepository = creditRepository;
        this.entryRepository = entryRepository;
        this.clock = clock;
    }

    /** The citizen's balance in this municipality, with expired lots already swept. */
    @Transactional
    public int availableMinutes(TenantId tenantId, UserId userId) {
        ParkingTimeCredit credit = creditRepository.findByTenantIdAndUserId(tenantId.value(), userId.value())
                .orElse(null);
        if (credit == null) {
            return 0;
        }
        sweepExpired(credit);
        return credit.getBalanceMinutes();
    }

    /**
     * The same balance, read under the row lock.
     *
     * <p>Used by the session flow, which must decide how many minutes to apply and then apply them
     * without another request slipping in between: taking the lock at the moment of the decision is
     * what makes "consume the credit first and charge only the rest" hold with several instances
     * running. A citizen with no row yet has nothing to lock and nothing to spend, which is 0.</p>
     */
    @Transactional
    public int availableMinutesForUpdate(TenantId tenantId, UserId userId) {
        ParkingTimeCredit credit = creditRepository.lockByTenantIdAndUserId(tenantId.value(), userId.value())
                .orElse(null);
        if (credit == null) {
            return 0;
        }
        sweepExpired(credit);
        return credit.getBalanceMinutes();
    }

    /** The balance row, created empty the first time the citizen needs one. */
    @Transactional
    public ParkingTimeCredit require(TenantId tenantId, UserId userId) {
        return creditRepository.findByTenantIdAndUserId(tenantId.value(), userId.value())
                .orElseGet(() -> creditRepository.save(new ParkingTimeCredit(Uuid7.generate(), tenantId.value(),
                        userId.value(), clock.instant())));
    }

    /**
     * Spends up to {@code minutes} of the citizen's balance, soonest-expiry-first.
     *
     * <p>Takes the row lock: two sessions started at the same moment must not both see the same
     * minutes and both spend them. It returns how many minutes were actually taken, which may be
     * fewer than asked when the balance ran out — the caller charges the rest.</p>
     */
    @Transactional
    public int consume(TenantId tenantId, UserId userId, int minutes, TimeCreditSource source, UUID sessionId) {
        if (minutes <= 0) {
            return 0;
        }
        ParkingTimeCredit credit = creditRepository
                .lockByTenantIdAndUserId(tenantId.value(), userId.value())
                .orElse(null);
        if (credit == null) {
            return 0;
        }
        Instant now = clock.instant();
        sweepExpired(credit);

        int remaining = minutes;
        int taken = 0;
        List<ParkingTimeCreditEntry> lots = entryRepository.findLiveLots(credit.getId());
        List<ParkingTimeCreditEntry> touched = new ArrayList<>();
        for (ParkingTimeCreditEntry lot : lots) {
            if (remaining <= 0) {
                break;
            }
            if (!lot.isLive(now)) {
                continue;
            }
            int fromLot = lot.consume(remaining);
            if (fromLot > 0) {
                remaining -= fromLot;
                taken += fromLot;
                touched.add(lot);
            }
        }
        if (taken == 0) {
            return 0;
        }
        entryRepository.saveAll(touched);
        entryRepository.save(ParkingTimeCreditEntry.spent(Uuid7.generate(), tenantId.value(), credit.getId(),
                userId.value(), source, taken, sessionId, now));
        credit.apply(-taken, now);
        creditRepository.save(credit);
        return taken;
    }

    /**
     * Grants a lot of minutes.
     *
     * @param expiryDays days the lot stays usable; {@code 0} means it never expires, which is what
     *                   a policy with {@code credit_expiry_days = 0} asks for
     */
    @Transactional
    public ParkingTimeCreditEntry grant(TenantId tenantId, UserId userId, int minutes, TimeCreditSource source,
                                        UUID sessionId, int expiryDays) {
        if (minutes <= 0) {
            throw new IllegalArgumentException("a granted lot must carry positive minutes");
        }
        Instant now = clock.instant();
        ParkingTimeCredit credit = creditRepository.lockByTenantIdAndUserId(tenantId.value(), userId.value())
                .orElseGet(() -> creditRepository.save(new ParkingTimeCredit(Uuid7.generate(), tenantId.value(),
                        userId.value(), now)));
        sweepExpired(credit);

        Instant expiresAt = expiryDays <= 0 ? null : now.plusSeconds((long) expiryDays * 86400L);
        ParkingTimeCreditEntry lot = ParkingTimeCreditEntry.granted(Uuid7.generate(), tenantId.value(),
                credit.getId(), userId.value(), source, minutes, sessionId, expiresAt, now);
        entryRepository.save(lot);
        credit.apply(minutes, now);
        creditRepository.save(credit);
        return lot;
    }

    /** Movements of the balance, most recent first. Paginated: a frequent parker accumulates them. */
    @Transactional(readOnly = true)
    public PageResponse<ParkingTimeCreditEntry> listEntries(TenantId tenantId, UserId userId, PageRequest request) {
        ParkingTimeCredit credit = creditRepository.findByTenantIdAndUserId(tenantId.value(), userId.value())
                .orElse(null);
        if (credit == null) {
            return PageResponse.empty(request);
        }
        Page<ParkingTimeCreditEntry> page = entryRepository.findByCreditIdOrderByCreatedAtDesc(credit.getId(),
                org.springframework.data.domain.PageRequest.of(request.page(), request.size()));
        return PageResponse.of(page.getContent(), request.page(), request.size(), page.getTotalElements());
    }

    /** The live lots, soonest expiry first: what the "minutes to my favour" screen shows. */
    @Transactional
    public List<ParkingTimeCreditEntry> liveLots(TenantId tenantId, UserId userId) {
        ParkingTimeCredit credit = creditRepository.findByTenantIdAndUserId(tenantId.value(), userId.value())
                .orElse(null);
        if (credit == null) {
            return List.of();
        }
        sweepExpired(credit);
        return entryRepository.findLiveLots(credit.getId());
    }

    /**
     * Writes off every lot whose expiry has passed, one negative entry per lot so the citizen can see
     * exactly which minutes were lost and when. Idempotent: a lot already drained has nothing left to
     * sweep, so running this twice changes nothing.
     */
    private void sweepExpired(ParkingTimeCredit credit) {
        Instant now = clock.instant();
        List<ParkingTimeCreditEntry> lots = entryRepository.findLiveLots(credit.getId());
        int swept = 0;
        List<ParkingTimeCreditEntry> drained = new ArrayList<>();
        List<ParkingTimeCreditEntry> written = new ArrayList<>();
        for (ParkingTimeCreditEntry lot : lots) {
            if (lot.getExpiresAt() == null || lot.getExpiresAt().isAfter(now)) {
                continue;
            }
            int amount = lot.drain();
            if (amount <= 0) {
                continue;
            }
            swept += amount;
            drained.add(lot);
            written.add(ParkingTimeCreditEntry.spent(Uuid7.generate(), credit.getTenantId(), credit.getId(),
                    credit.getUserId(), TimeCreditSource.EXPIRY, amount, null, now));
        }
        if (swept == 0) {
            return;
        }
        entryRepository.saveAll(drained);
        entryRepository.saveAll(written);
        credit.apply(-swept, now);
        creditRepository.save(credit);
    }
}
