package cr.luparx.billing.service;

import cr.luparx.billing.entity.Payment;
import cr.luparx.billing.entity.Settlement;
import cr.luparx.billing.entity.SettlementLine;
import cr.luparx.billing.model.LineMatchStatus;
import cr.luparx.billing.model.ReconciliationStatus;
import cr.luparx.billing.repository.PaymentRepository;
import cr.luparx.billing.repository.SettlementLineRepository;
import cr.luparx.billing.repository.SettlementRepository;
import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.money.Money;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Imports a provider's statement and matches it against what this municipality charged
 * (CONTRACT.md v0.35).
 *
 * <h2>Lo que no cuadra se reporta, no se acomoda</h2>
 *
 * <p>Every step here is written so that a disagreement survives it. The statement's declared totals
 * are stored as they arrived and never recomputed from its own lines; a line that matches nothing is
 * kept rather than dropped; a payment nobody settled is stated rather than left pending. The
 * temptation in reconciliation code is always to make the totals agree, and a total made to agree is
 * a total that proves nothing.</p>
 *
 * <h2>Los cuatro hallazgos</h2>
 *
 * <p>They are separate values because they are four different people's problems: an amount mismatch
 * is a conversation with the provider; an unknown payment is a question about whose money that is; a
 * duplicate is a bug in their export; and a payment missing from the statement is money the
 * municipality charged and has not received — the one that costs something.</p>
 */
@Service
public class SettlementService {

    private final SettlementRepository settlementRepository;
    private final SettlementLineRepository lineRepository;
    private final PaymentRepository paymentRepository;
    private final Clock clock;

    public SettlementService(SettlementRepository settlementRepository,
                             SettlementLineRepository lineRepository,
                             PaymentRepository paymentRepository,
                             Clock clock) {
        this.settlementRepository = settlementRepository;
        this.lineRepository = lineRepository;
        this.paymentRepository = paymentRepository;
        this.clock = clock;
    }

    /**
     * Stores a statement and reconciles it in one go.
     *
     * <p>Importing without matching would leave a municipality with two half-answers and a manual
     * step between them, which is the state this module exists to end. Re-importing the same
     * statement is refused rather than merged: a provider that corrects a statement issues another
     * one, and quietly overwriting the first would erase the evidence that it was corrected.</p>
     */
    @Transactional
    public Result importAndReconcile(TenantId tenantId, Command command, UUID importedBy) {
        settlementRepository.findByTenantIdAndProviderAndExternalReference(
                        tenantId.value(), command.provider(), command.externalReference())
                .ifPresent(existing -> {
                    throw ConflictException.of(ErrorCode.SETTLEMENT_ALREADY_IMPORTED,
                            "error.settlement.alreadyImported");
                });

        Instant now = clock.instant();
        Settlement settlement = settlementRepository.save(new Settlement(
                Uuid7.generate(), tenantId.value(), command.provider(), command.externalReference(),
                command.periodStart(), command.periodEnd(),
                command.declaredGross(), command.declaredFee(), command.declaredNet(),
                command.depositExpectedOn(), command.depositReference(), importedBy, now));

        List<SettlementLine> lines = match(tenantId, settlement, command.lines(), now);
        settlement.markReconciled(now);
        settlementRepository.save(settlement);

        return summarise(tenantId, settlement, lines, command, now);
    }

    // --- the matching ------------------------------------------------------------------------------

    private List<SettlementLine> match(TenantId tenantId, Settlement settlement, List<Line> incoming,
                                       Instant now) {
        // One query for the whole statement rather than one per line. A card provider's monthly
        // statement is thousands of lines, and a lookup per line is the N+1 that makes the treasurer's
        // one important screen time out.
        Set<String> references = new HashSet<>();
        for (Line line : incoming) {
            references.add(line.providerReference());
        }
        Map<String, Payment> byReference = new HashMap<>();
        for (Payment payment : paymentRepository.findByProviderReferences(tenantId.value(),
                settlement.getProvider(), references)) {
            byReference.put(payment.getProviderReference(), payment);
        }

        Set<String> seen = new HashSet<>();
        List<SettlementLine> stored = new ArrayList<>(incoming.size());
        for (Line line : incoming) {
            Payment payment = byReference.get(line.providerReference());
            LineMatchStatus status;
            if (!seen.add(line.providerReference())) {
                // The same reference twice in one statement. Marked rather than refused at import:
                // rejecting the whole file for one repeated line would leave the municipality with no
                // statement at all, and the duplicate is precisely what they need to show the provider.
                status = LineMatchStatus.DUPLICATE;
                payment = null;
            } else if (payment == null) {
                status = LineMatchStatus.UNKNOWN_PAYMENT;
            } else if (payment.getGrossAmountMinor() != line.gross().minorUnits()) {
                status = LineMatchStatus.AMOUNT_MISMATCH;
            } else {
                status = LineMatchStatus.MATCHED;
            }

            SettlementLine row = lineRepository.save(new SettlementLine(Uuid7.generate(), tenantId.value(),
                    settlement.getId(), line.providerReference(), line.gross(), line.fee(), line.net(),
                    line.occurredAt(), payment == null ? null : payment.getId(), status, now));
            stored.add(row);

            if (payment != null) {
                // The statement is the authority on what actually reached the municipality, so the
                // fee and the net it declares replace whatever the capture estimated.
                payment.reconcile(
                        status == LineMatchStatus.MATCHED
                                ? ReconciliationStatus.MATCHED
                                : ReconciliationStatus.AMOUNT_MISMATCH,
                        row.getId(), line.fee(), line.net(), line.occurredAt() == null ? now : line.occurredAt(),
                        now);
                paymentRepository.save(payment);
            }
        }

        // And the other direction, which is the one that costs money: everything captured inside the
        // statement's own period that the statement never mentioned. Looking only at the lines would
        // answer "does what they sent add up" while leaving "did they send everything" unasked.
        for (Payment captured : paymentRepository.findUnsettled(tenantId.value(),
                cr.luparx.billing.model.PaymentState.CAPTURED,
                List.of(ReconciliationStatus.PENDING),
                settlement.getPeriodStart(), settlement.getPeriodEnd(),
                org.springframework.data.domain.PageRequest.of(0, 5000))) {
            if (settlement.getProvider().equals(captured.getProvider())) {
                captured.markMissingInSettlement(now);
                paymentRepository.save(captured);
            }
        }
        return stored;
    }

    private Result summarise(TenantId tenantId, Settlement settlement, List<SettlementLine> lines,
                             Command command, Instant now) {
        long lineGross = 0L;
        long lineFee = 0L;
        long lineNet = 0L;
        int matched = 0;
        int unknown = 0;
        int mismatched = 0;
        int duplicated = 0;
        for (SettlementLine line : lines) {
            lineGross += line.getGrossAmountMinor();
            lineFee += line.getFeeAmountMinor();
            lineNet += line.getNetAmountMinor();
            switch (line.getMatchStatus()) {
                case MATCHED -> matched++;
                case UNKNOWN_PAYMENT -> unknown++;
                case AMOUNT_MISMATCH -> mismatched++;
                case DUPLICATE -> duplicated++;
            }
        }

        int missing = paymentRepository.findUnsettled(tenantId.value(),
                cr.luparx.billing.model.PaymentState.CAPTURED,
                List.of(ReconciliationStatus.MISSING_IN_SETTLEMENT),
                settlement.getPeriodStart(), settlement.getPeriodEnd(),
                org.springframework.data.domain.PageRequest.of(0, 5000)).size();

        String currency = settlement.getCurrencyCode();
        return new Result(settlement,
                lines.size(), matched, unknown, mismatched, duplicated, missing,
                Money.ofMinor(lineGross, currency),
                Money.ofMinor(lineFee, currency),
                Money.ofMinor(lineNet, currency),
                // The provider's own header against the sum of its own lines. A difference here is a
                // finding about the provider, which is why the header was never recomputed.
                lineGross != command.declaredGross().minorUnits()
                        || lineNet != command.declaredNet().minorUnits());
    }

    // --- reading -----------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Settlement require(TenantId tenantId, UUID settlementId) {
        return settlementRepository.findByTenantIdAndId(tenantId.value(), settlementId)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.SETTLEMENT_NOT_FOUND,
                        "error.settlement.notFound"));
    }

    @Transactional(readOnly = true)
    public List<Settlement> recent(TenantId tenantId, int limit) {
        return settlementRepository.findByTenantIdOrderByPeriodEndDesc(tenantId.value(),
                org.springframework.data.domain.PageRequest.of(0, Math.max(1, Math.min(limit, 100))))
                .getContent();
    }

    /** Only the lines that need a person. A screen showing every matched line hides the four that don't. */
    @Transactional(readOnly = true)
    public List<SettlementLine> findings(TenantId tenantId, UUID settlementId) {
        return lineRepository.findFindings(tenantId.value(), settlementId, LineMatchStatus.MATCHED);
    }

    /** The municipality is claiming; it must stop counting as settled income while that lasts. */
    @Transactional
    public Settlement dispute(TenantId tenantId, UUID settlementId) {
        Settlement settlement = require(tenantId, settlementId);
        settlement.dispute(clock.instant());
        return settlementRepository.save(settlement);
    }

    /** One line of a provider's statement, as it arrived. */
    public record Line(String providerReference, Money gross, Money fee, Money net, Instant occurredAt) {
    }

    public record Command(String provider, String externalReference, Instant periodStart, Instant periodEnd,
                          Money declaredGross, Money declaredFee, Money declaredNet,
                          LocalDate depositExpectedOn, String depositReference, List<Line> lines) {
    }

    /**
     * What the reconciliation found.
     *
     * @param missingPayments captured payments inside the period that this statement never mentioned
     * @param declaredTotalsDisagree the provider's own header does not equal the sum of its own lines
     */
    public record Result(Settlement settlement, int lineCount, int matched, int unknownPayments,
                         int amountMismatches, int duplicates, int missingPayments,
                         Money lineGross, Money lineFee, Money lineNet, boolean declaredTotalsDisagree) {

        /** True when somebody has to look at this statement. */
        public boolean hasFindings() {
            return unknownPayments > 0 || amountMismatches > 0 || duplicates > 0 || missingPayments > 0
                    || declaredTotalsDisagree;
        }
    }
}
