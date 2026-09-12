package cr.luparx.app.billing;

import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.money.Money;
import cr.luparx.enforcement.entity.Citation;
import cr.luparx.enforcement.entity.CitationAppeal;
import cr.luparx.enforcement.model.CitationStatus;
import cr.luparx.enforcement.model.EnforcementActor;
import cr.luparx.enforcement.service.AppealService;
import cr.luparx.enforcement.service.CitationService;
import cr.luparx.parking.entity.WalletTransaction;
import cr.luparx.parking.model.WalletTransactionType;
import cr.luparx.parking.service.WalletService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Collection;
import java.util.Optional;
import java.util.UUID;

/**
 * Paying a citation with the balance already in the wallet (CONTRACT.md v0.41).
 *
 * <h2>Dónde vive y por qué</h2>
 *
 * <p>In the application layer, for the same reason {@code TopupPaymentService} is: it joins two
 * bounded contexts that must not know each other. {@code module-enforcement} owns the citation and
 * {@code module-parking} owns the wallet, and neither depends on the other (ADR 0014). The order of
 * the three writes is this class's whole responsibility, and they are one transaction: a citation
 * marked paid without the money having moved is a municipality losing revenue quietly, and a wallet
 * charged without the citation moving is a citizen paying for nothing.</p>
 *
 * <h2>El orden importa</h2>
 *
 * <p>Withdraw, charge, settle. Charging second is what makes an empty wallet cost nothing: the
 * refusal rolls back the withdrawal with it, and the citizen's appeal is still waiting when they get
 * the "not enough balance" message. Reversing it would retire somebody's defence for a payment that
 * never happened.</p>
 *
 * <h2>Lo que no hace</h2>
 *
 * <p>No partial payments, and no card. The amount is the one the server says is payable today —
 * reduced while the early-payment window is open — and it is read here rather than taken from the
 * request, so a client cannot name its own price.</p>
 */
@Service
public class FinePaymentService {

    private final CitationService citationService;
    private final AppealService appealService;
    private final WalletService walletService;
    private final Clock clock;

    public FinePaymentService(CitationService citationService, AppealService appealService,
                              WalletService walletService, Clock clock) {
        this.citationService = citationService;
        this.appealService = appealService;
        this.walletService = walletService;
        this.clock = clock;
    }

    /**
     * @param ownVehicleIds the caller's own vehicles. The citation is loaded through them and never
     *                      by id alone: matching by plate would let one citizen pay — and close the
     *                      appeal of — a citation belonging to another who registered the same plate.
     * @param idempotencyKey the request's {@code Idempotency-Key}, recorded on the movement. Replay
     *                       protection itself belongs to the filter (ADR 0012).
     */
    @Transactional
    public Result pay(TenantId tenantId, UserId payer, EnforcementActor actor,
                      Collection<UUID> ownVehicleIds, UUID citationId, String idempotencyKey) {
        Citation citation = citationService.requireForVehicles(tenantId, ownVehicleIds, citationId);

        // A citation raised in the municipality's other system is collected there. Checked first, and
        // before the status: a mirrored row's status is a copy of what that system last said, so
        // refusing it for being "not payable" would name the wrong reason (CONTRACT.md v0.34).
        if (citation.isMirror()) {
            throw ConflictException.of(ErrorCode.CITATION_NOT_MANAGED_HERE,
                    "error.enforcement.citation.notManagedHere");
        }
        if (!citation.getStatus().canMoveTo(CitationStatus.PAID)) {
            // Already paid, annulled, or voided by an accepted appeal. Nothing about the request is
            // wrong — the world moved, usually while the screen was open.
            throw ConflictException.of(ErrorCode.CITATION_NOT_PAYABLE,
                    "error.enforcement.citation.notPayable");
        }

        // First, because it is the only step that can refuse for a reason the citizen must hear
        // before any money moves: the waiting appeal is somebody else's.
        Optional<CitationAppeal> withdrawn = appealService.withdrawOnPayment(tenantId, payer, citationId);

        Money amount = citation.amountPayableAt(clock.instant());
        // A citation whose amount is zero is legal (`ck_infraction_types_amount` allows it) and there
        // is nothing to move. Writing a zero row would put a movement in the ledger that says nothing
        // happened, which the wallet refuses outright — so it is settled without one.
        UUID movementId = null;
        WalletTransaction movement = null;
        if (amount.isPositive()) {
            // Throws INSUFFICIENT_BALANCE, which rolls back the withdrawal above with it.
            // `sessionId` is null: this charge is not a stay.
            movement = walletService.charge(tenantId, payer, amount, WalletTransactionType.FINE_CHARGE,
                    null, idempotencyKey);
            movementId = movement.getId();
        }

        Citation paid = citationService.payFromWallet(tenantId, actor, citationId, movementId);
        return new Result(paid, movement, withdrawn.orElse(null), amount);
    }

    /**
     * @param movement  the wallet movement, or null when the amount was zero
     * @param withdrawn the appeal this payment closed, or null when there was none waiting. The
     *                  caller needs it to tell the citizen what just happened to their defence.
     */
    public record Result(Citation citation, WalletTransaction movement, CitationAppeal withdrawn, Money charged) {

        public boolean withdrewAppeal() {
            return withdrawn != null;
        }
    }
}
