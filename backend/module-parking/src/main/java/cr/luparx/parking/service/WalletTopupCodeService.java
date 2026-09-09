package cr.luparx.parking.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.parking.entity.WalletTopupCode;
import cr.luparx.parking.model.TopupCodeFormat;
import cr.luparx.parking.repository.WalletTopupCodeRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;

/**
 * The code that lets a cashier credit a citizen's wallet without asking them for anything personal.
 *
 * <h2>Created on demand, not on registration</h2>
 *
 * <p>The code is issued the first time it is needed — when the citizen opens their wallet in a
 * municipality — instead of at registration. A citizen who joins ten municipalities and parks in one
 * has one code, not ten, and nothing has to be backfilled for the accounts that already exist.</p>
 *
 * <h2>Rotation</h2>
 *
 * <p>{@link #rotate} replaces the code and the old one stops working immediately. That is the point:
 * a person rotates because they think somebody overheard it, and a grace period would keep the
 * overheard code alive for exactly the window that matters.</p>
 *
 * <h2>Collisions</h2>
 *
 * <p>Uniqueness is per municipality and enforced by the database. On the (astronomically unlikely)
 * duplicate the generator simply tries again: a check-then-insert would be a race with several
 * instances, and the index is the only place this can be settled.</p>
 */
@Service
public class WalletTopupCodeService {

    /** Attempts before giving up. With 2^40 codes per municipality, two collisions never happen. */
    private static final int MAX_ATTEMPTS = 5;

    private final WalletTopupCodeRepository repository;
    private final Clock clock;

    public WalletTopupCodeService(WalletTopupCodeRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    /** The citizen's code in this municipality, creating it the first time it is asked for. */
    @Transactional
    public WalletTopupCode require(TenantId tenantId, UserId userId) {
        Optional<WalletTopupCode> existing = repository.findByTenantIdAndUserId(tenantId.value(), userId.value());
        if (existing.isPresent()) {
            return existing.get();
        }
        Instant now = clock.instant();
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            WalletTopupCode code = new WalletTopupCode(Uuid7.generate(), tenantId.value(), userId.value(),
                    TopupCodeFormat.generate(), now);
            try {
                return repository.saveAndFlush(code);
            } catch (DataIntegrityViolationException collision) {
                // Either the code collided, or another request created this person's code first.
                Optional<WalletTopupCode> winner = repository.findByTenantIdAndUserId(tenantId.value(),
                        userId.value());
                if (winner.isPresent()) {
                    return winner.get();
                }
            }
        }
        throw new IllegalStateException("could not allocate a top-up code after " + MAX_ATTEMPTS + " attempts");
    }

    /** Issues a new code and invalidates the previous one immediately. */
    @Transactional
    public WalletTopupCode rotate(TenantId tenantId, UserId userId) {
        WalletTopupCode code = require(tenantId, userId);
        Instant now = clock.instant();
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            code.rotate(TopupCodeFormat.generate(), now);
            try {
                return repository.saveAndFlush(code);
            } catch (DataIntegrityViolationException collision) {
                // Try another code; the row is the same one.
            }
        }
        throw new IllegalStateException("could not rotate the top-up code after " + MAX_ATTEMPTS + " attempts");
    }

    /**
     * Resolves what a cashier typed.
     *
     * <p>The check character is verified <b>before</b> the database is touched, so a transcription
     * error is a validation failure and not a lookup that might accidentally match somebody else's
     * code. A well-formed code that belongs to nobody in this municipality is a plain "not found":
     * the two cases are told apart on purpose, because the first means "read it again" and the second
     * means "this person has no wallet here".</p>
     */
    @Transactional(readOnly = true)
    public WalletTopupCode resolve(TenantId tenantId, String typed) {
        String canonical = TopupCodeFormat.normalize(typed)
                .filter(TopupCodeFormat::isValid)
                .orElseThrow(() -> new ValidationException("code", ErrorCode.TOPUP_CODE_INVALID,
                        "error.wallet.topupCode.invalid"));
        return repository.findByTenantIdAndCode(tenantId.value(), canonical)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.TOPUP_CODE_NOT_FOUND,
                        "error.wallet.topupCode.notFound"));
    }
}
