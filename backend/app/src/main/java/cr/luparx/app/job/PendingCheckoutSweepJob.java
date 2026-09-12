package cr.luparx.app.job;

import cr.luparx.app.config.PaymentsProperties;
import cr.luparx.app.payments.WalletCheckoutService;
import cr.luparx.billing.entity.PaymentCheckout;
import cr.luparx.billing.service.PaymentCheckoutService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * "You paid and your connection dropped" (ADR 0023 §5).
 *
 * <h2>Por qué este job es el que salva la plata de alguien</h2>
 *
 * <p>A citizen types their card, the charge goes through, and their bus enters a tunnel. No return, and
 * the provider's notification may be the one that gets lost. Without this pass, that person is charged
 * and not credited, and the only way anybody finds out is a phone call to the municipality.</p>
 *
 * <p>So the job asks the provider about every hand-off still open, and the answer credits, fails, or
 * leaves it be. It is the same {@code resolve} the citizen's return and the webhook use — one
 * implementation with three ways of being woken up, which is what makes a lost notification cost
 * nothing.</p>
 *
 * <h2>Y el que limpia la lista del tesorero</h2>
 *
 * <p>A closed tab produces nothing at all. Those attempts are resolved as cancelled once their window has
 * passed, because an attempt left {@code PENDING} for ever sits in "charged and never settled" — and a
 * list where most entries are not problems is a list a municipality learns to ignore.</p>
 *
 * <p>Bounded on both sides: a page per pass, and a ceiling on how many times one row is asked about. A
 * provider that has stopped answering must not become an unbounded loop of calls, and a row asked about
 * twenty times is a row for a person rather than for a retry.</p>
 */
@Component
public class PendingCheckoutSweepJob {

    private static final Logger LOGGER = LoggerFactory.getLogger(PendingCheckoutSweepJob.class);
    private static final String JOB_NAME = "payment-checkout-sweep";

    private final PaymentCheckoutService checkouts;
    private final WalletCheckoutService checkoutService;
    private final PaymentsProperties properties;
    private final PlatformJobLock jobLock;

    public PendingCheckoutSweepJob(PaymentCheckoutService checkouts, WalletCheckoutService checkoutService,
                                   PaymentsProperties properties, PlatformJobLock jobLock) {
        this.checkouts = checkouts;
        this.checkoutService = checkoutService;
        this.properties = properties;
        this.jobLock = jobLock;
    }

    /**
     * Every minute, and the lock is what makes that safe.
     *
     * <p>Frequent because the thing being waited for is somebody's money and they are watching a screen;
     * exclusive because with several instances an unlocked pass would ask a provider the same question
     * once per backend.</p>
     */
    @Scheduled(fixedDelayString = "PT1M", initialDelayString = "PT30S")
    public void run() {
        try {
            jobLock.runExclusively(JOB_NAME, this::sweep);
        } catch (RuntimeException failure) {
            LOGGER.error("Payment checkout sweep failed; the next pass covers the same rows.", failure);
        }
    }

    private int sweep() {
        int touched = 0;
        touched += askAboutOpen();
        touched += giveUpOnExpired();
        return touched;
    }

    private int askAboutOpen() {
        List<PaymentCheckout> pollable = checkouts.pollable(properties.maxPollAttempts(),
                properties.pollInterval(), properties.sweepBatchSize());
        int resolved = 0;
        for (PaymentCheckout checkout : pollable) {
            try {
                WalletCheckoutService.Resolution resolution = checkoutService.resolve(checkout);
                if (resolution.credited()) {
                    // Worth a line of its own: this is the case the job exists for.
                    LOGGER.info("Sweep credited payment {} that no return and no notification had "
                            + "resolved.", checkout.getPaymentId());
                }
                if (resolution.outcome().isResolved()) {
                    resolved++;
                }
            } catch (RuntimeException failure) {
                // One bad row must not stop the pass: the next hand-off in the list may be the one whose
                // money is waiting.
                LOGGER.warn("Could not resolve checkout {}; continuing with the rest.", checkout.getId(),
                        failure);
            }
        }
        return resolved;
    }

    private int giveUpOnExpired() {
        List<PaymentCheckout> expired = checkouts.expired(properties.sweepBatchSize());
        int closed = 0;
        for (PaymentCheckout checkout : expired) {
            try {
                checkoutService.abandon(checkout);
                closed++;
            } catch (RuntimeException failure) {
                LOGGER.warn("Could not close expired checkout {}; the next pass tries again.",
                        checkout.getId(), failure);
            }
        }
        return closed;
    }
}
