package cr.luparx.app.billing;

import cr.luparx.billing.entity.Payment;
import cr.luparx.billing.model.PaymentMethod;
import cr.luparx.billing.model.PaymentPurpose;
import cr.luparx.billing.service.PaymentService;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.money.Money;
import cr.luparx.parking.entity.WalletTransaction;
import cr.luparx.parking.model.WalletTopupSource;
import cr.luparx.parking.repository.WalletTransactionRepository;
import cr.luparx.parking.service.WalletService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Where a payment becomes balance (CONTRACT.md v0.35).
 *
 * <h2>Por qué vive en el app y no en ninguno de los dos módulos</h2>
 *
 * <p>This is the only class that knows both that money was received and that a wallet exists.
 * {@code module-billing} deliberately does not depend on parking — money coming in is a different
 * question from what it is later spent on, and fines will arrive through the same table — and
 * {@code module-parking} has no business knowing what a gateway is. The composition root is the
 * right place for a step that joins two contexts, and keeping the join here is what lets either of
 * them be extracted later without unpicking the other.</p>
 *
 * <h2>Una sola transacción, y en este orden</h2>
 *
 * <p>The payment is opened first, the wallet is credited second, and the payment is captured last
 * with the movement it produced. The order matters: a wallet credited before a payment existed is
 * money the platform handed out against nothing, and if anything fails the whole thing rolls back
 * rather than leaving one of the two halves standing. A payment that stayed {@code PENDING} because
 * the credit failed is the honest record of an attempt that did not complete — which is exactly what
 * that state is for.</p>
 */
@Service
public class TopupPaymentService {

    /** What the payment says it was applied to. Read by nothing that needs to resolve it. */
    public static final String TARGET_WALLET_TRANSACTION = "WALLET_TRANSACTION";

    private final PaymentService paymentService;
    private final WalletService walletService;
    private final WalletTransactionRepository transactionRepository;

    public TopupPaymentService(PaymentService paymentService, WalletService walletService,
                               WalletTransactionRepository transactionRepository) {
        this.paymentService = paymentService;
        this.walletService = walletService;
        this.transactionRepository = transactionRepository;
    }

    /**
     * Records the money received and credits the balance with it.
     *
     * @param fee what the channel kept, when it is known now. A counter keeps nothing; a card
     *            usually does not say until its statement arrives
     * @return the movement, carrying the payment it came from
     */
    @Transactional
    public Result topUp(TenantId tenantId, UserId beneficiary, Money amount, String idempotencyKey,
                        WalletTopupSource source, String externalReference, UserId createdBy, Money fee) {
        PaymentMethod method = methodOf(source);
        Payment payment = paymentService.begin(tenantId, beneficiary.value(), method, source.name(),
                externalReference, idempotencyKey, amount, PaymentPurpose.WALLET_TOPUP,
                createdBy == null ? null : createdBy.value());

        WalletTransaction transaction = walletService.topUp(tenantId, beneficiary, amount, idempotencyKey,
                source, externalReference, createdBy);

        // The movement came back already linked: this is a resend of something credited earlier, and
        // both sides recognised it. Nothing is written twice, which is the whole point of routing the
        // two idempotency layers at the same identifiers.
        boolean alreadyApplied = transaction.getPaymentId() != null;
        if (!alreadyApplied) {
            transaction.linkPayment(payment.getId());
            transactionRepository.save(transaction);
            payment = paymentService.capture(tenantId, payment.getId(), TARGET_WALLET_TRANSACTION,
                    transaction.getId(), fee, null);
        }
        return new Result(payment, transaction, alreadyApplied);
    }

    /**
     * The channel, said in the payment's vocabulary.
     *
     * <p>Two enumerations rather than one shared value, because they answer different questions and
     * belong to different modules: {@link WalletTopupSource} is where a wallet movement came from,
     * {@link PaymentMethod} is how money was moved. Folding them into one type would be the shortcut
     * that makes billing depend on parking.</p>
     */
    private static PaymentMethod methodOf(WalletTopupSource source) {
        return switch (source) {
            case MUNICIPAL_COUNTER -> PaymentMethod.COUNTER_CASH;
            case PARTNER -> PaymentMethod.PARTNER;
            case ADJUSTMENT -> PaymentMethod.ADJUSTMENT;
            // The citizen paying through the app, and the development shortcut standing in for it.
            case CITIZEN, DEV -> PaymentMethod.CARD;
        };
    }

    public record Result(Payment payment, WalletTransaction transaction, boolean alreadyApplied) {

        public UUID paymentId() {
            return payment.getId();
        }
    }
}
