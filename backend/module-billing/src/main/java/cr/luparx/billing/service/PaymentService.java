package cr.luparx.billing.service;

import cr.luparx.billing.entity.Payment;
import cr.luparx.billing.model.PaymentMethod;
import cr.luparx.billing.model.PaymentPurpose;
import cr.luparx.billing.model.PaymentState;
import cr.luparx.billing.repository.PaymentRepository;
import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.money.Money;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Records every peso that enters, whether it arrives or not (CONTRACT.md v0.35).
 *
 * <h2>Qué hace y qué no</h2>
 *
 * <p>It does not talk to a gateway. It records what a gateway, a cashier or a partner network did,
 * and it is the one place where "what did this municipality charge" can be answered. The adapter for
 * a real provider plugs in above this: it calls {@link #begin}, then {@link #capture} or
 * {@link #fail}. That the platform has no provider yet is the reason to define this now rather than
 * after — a payment model shaped around one gateway's vocabulary is a payment model that has to be
 * rebuilt for the second one.</p>
 *
 * <h2>Este servicio no acredita nada</h2>
 *
 * <p>{@link #capture} records that the money was taken and what it was applied to. Actually crediting
 * a wallet belongs to the module that owns wallets, and the composition root does both inside one
 * transaction. That separation is what lets a fine be paid through this same table tomorrow without
 * this module learning what a fine is.</p>
 */
@Service
public class PaymentService {

    private final PaymentRepository paymentRepository;
    private final Clock clock;

    public PaymentService(PaymentRepository paymentRepository, Clock clock) {
        this.paymentRepository = paymentRepository;
        this.clock = clock;
    }

    /**
     * Opens an attempt.
     *
     * <p>Idempotent twice over, because the two identifiers arrive at different moments: the caller's
     * key exists before anybody has spoken to a provider, and the provider's reference exists only
     * afterwards. A retry may carry either, and both resolve to the same row rather than to a second
     * charge on somebody's card.</p>
     */
    @Transactional
    public Payment begin(TenantId tenantId, UUID userId, PaymentMethod method, String provider,
                         String providerReference, String idempotencyKey, Money gross,
                         PaymentPurpose purpose, UUID createdBy) {
        Optional<Payment> existing = findExisting(tenantId, provider, providerReference, idempotencyKey);
        if (existing.isPresent()) {
            return existing.get();
        }
        Payment payment = new Payment(Uuid7.generate(), tenantId.value(), userId, method, provider,
                providerReference, idempotencyKey, gross, purpose, createdBy, clock.instant());
        try {
            return paymentRepository.save(payment);
        } catch (DataIntegrityViolationException race) {
            // Two instances opened the same attempt between the lookup and the write. The unique index
            // settled it; reading the row back gives the caller the answer their retry would have got.
            return findExisting(tenantId, provider, providerReference, idempotencyKey).orElseThrow(() -> race);
        }
    }

    /**
     * The money was taken.
     *
     * <p>Refuses to capture what is already captured rather than doing it twice. That is not
     * defensive coding for its own sake: a second capture would credit a second time, and the whole
     * reason the provider's reference is the identity of a payment is that providers retry.</p>
     *
     * @param fee what the provider kept, when it says so at capture time. Cards usually do not
     * @param net what reaches the municipality. Null means gross minus fee, which is the truth for a
     *            counter and the provisional truth for a card until its statement says otherwise
     */
    @Transactional
    public Payment capture(TenantId tenantId, UUID paymentId, String targetType, UUID targetId,
                           Money fee, Money net) {
        Payment payment = require(tenantId, paymentId);
        if (payment.getStatus().isCaptured()) {
            return payment;
        }
        if (!payment.getStatus().canMoveTo(PaymentState.CAPTURED)) {
            throw ConflictException.of(ErrorCode.PAYMENT_INVALID_TRANSITION,
                    "error.payment.invalidTransition");
        }
        payment.capture(targetType, targetId, fee, net, clock.instant());
        return paymentRepository.save(payment);
    }

    /** The provider refused it. Kept, because this row is what a claim is built out of. */
    @Transactional
    public Payment fail(TenantId tenantId, UUID paymentId, String failureCode, String failureReason) {
        Payment payment = require(tenantId, paymentId);
        if (!payment.getStatus().canMoveTo(PaymentState.FAILED)) {
            throw ConflictException.of(ErrorCode.PAYMENT_INVALID_TRANSITION,
                    "error.payment.invalidTransition");
        }
        payment.fail(failureCode, failureReason, clock.instant());
        return paymentRepository.save(payment);
    }

    /** Any other move: authorised, cancelled, refunded, charged back. Always through the table. */
    @Transactional
    public Payment transition(TenantId tenantId, UUID paymentId, PaymentState target) {
        Payment payment = require(tenantId, paymentId);
        if (!payment.getStatus().canMoveTo(target)) {
            throw ConflictException.of(ErrorCode.PAYMENT_INVALID_TRANSITION,
                    "error.payment.invalidTransition");
        }
        payment.moveTo(target, clock.instant());
        return paymentRepository.save(payment);
    }

    @Transactional(readOnly = true)
    public Payment require(TenantId tenantId, UUID paymentId) {
        return paymentRepository.findByTenantIdAndId(tenantId.value(), paymentId)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.PAYMENT_NOT_FOUND, "error.payment.notFound"));
    }

    @Transactional(readOnly = true)
    public PageResponse<Payment> search(TenantId tenantId, PaymentState status,
                                        cr.luparx.billing.model.ReconciliationStatus reconciliation,
                                        Instant from, Instant to, PageRequest request) {
        Page<Payment> page = paymentRepository.search(tenantId.value(), status, reconciliation, from, to,
                org.springframework.data.domain.PageRequest.of(request.page(), request.size()));
        return PageResponse.of(page.getContent(), request.page(), request.size(), page.getTotalElements());
    }

    /**
     * What a period adds up to, by state.
     *
     * <p>The numbers a treasurer is actually after: charged, of which settled, of which still owed
     * to the municipality. Summed in the database — a total built from one page of a month's rows is
     * a number that looks right and is not.</p>
     */
    @Transactional(readOnly = true)
    public Totals totals(TenantId tenantId, Instant from, Instant to, String currencyCode) {
        long capturedGross = 0L;
        long capturedNet = 0L;
        long capturedCount = 0L;
        long failedCount = 0L;
        long settledGross = 0L;
        long unsettledGross = 0L;

        for (Object[] row : paymentRepository.summarise(tenantId.value(), from, to)) {
            PaymentState state = (PaymentState) row[0];
            cr.luparx.billing.model.ReconciliationStatus reconciliation =
                    (cr.luparx.billing.model.ReconciliationStatus) row[1];
            long count = ((Number) row[2]).longValue();
            long gross = ((Number) row[3]).longValue();
            long net = ((Number) row[4]).longValue();

            if (state == PaymentState.FAILED || state == PaymentState.CANCELLED) {
                failedCount += count;
                continue;
            }
            if (state != PaymentState.CAPTURED) {
                continue;
            }
            capturedCount += count;
            capturedGross += gross;
            capturedNet += net;
            switch (reconciliation) {
                case MATCHED, AMOUNT_MISMATCH -> settledGross += gross;
                // NOT_APPLICABLE is neither settled nor owed: nobody is going to report the cash a
                // cashier took. Counting it as outstanding would make the figure that matters — what
                // a provider still owes — permanently wrong by the size of the counter's day.
                case PENDING, MISSING_IN_SETTLEMENT -> unsettledGross += gross;
                case NOT_APPLICABLE -> { }
            }
        }
        return new Totals(
                Money.ofMinor(capturedGross, currencyCode),
                Money.ofMinor(capturedNet, currencyCode),
                Money.ofMinor(settledGross, currencyCode),
                Money.ofMinor(unsettledGross, currencyCode),
                capturedCount, failedCount);
    }

    /**
     * Payments captured in a period that no statement has covered.
     *
     * <p>The one list somebody should look at every week. Bounded: a municipality whose provider has
     * stopped reporting would otherwise produce a page-long answer that nobody reads to the end.</p>
     */
    @Transactional(readOnly = true)
    public List<Payment> unsettled(TenantId tenantId, Instant from, Instant to, int limit) {
        return paymentRepository.findUnsettled(tenantId.value(), PaymentState.CAPTURED,
                List.of(cr.luparx.billing.model.ReconciliationStatus.PENDING,
                        cr.luparx.billing.model.ReconciliationStatus.MISSING_IN_SETTLEMENT),
                from, to,
                org.springframework.data.domain.PageRequest.of(0, Math.max(1, Math.min(limit, 500))));
    }

    private Optional<Payment> findExisting(TenantId tenantId, String provider, String providerReference,
                                           String idempotencyKey) {
        if (providerReference != null && !providerReference.isBlank()) {
            Optional<Payment> byReference = paymentRepository.findByTenantIdAndProviderAndProviderReference(
                    tenantId.value(), provider, providerReference);
            if (byReference.isPresent()) {
                return byReference;
            }
        }
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            return paymentRepository.findByTenantIdAndIdempotencyKey(tenantId.value(), idempotencyKey);
        }
        return Optional.empty();
    }

    /**
     * What a period adds up to.
     *
     * @param capturedGross what citizens paid
     * @param capturedNet   what reached the municipality after the providers' fees
     * @param settledGross  of the captured, what a statement has confirmed
     * @param unsettledGross of the captured, what is still owed to the municipality. The number the
     *                       whole module exists to be able to state
     */
    public record Totals(Money capturedGross, Money capturedNet, Money settledGross, Money unsettledGross,
                         long capturedCount, long failedCount) {
    }
}
