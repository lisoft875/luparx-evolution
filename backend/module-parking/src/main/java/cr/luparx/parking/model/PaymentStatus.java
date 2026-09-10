package cr.luparx.parking.model;

/**
 * Whether a stay was paid for (CONTRACT.md v0.32).
 *
 * <p>Deliberately separate from {@link ParkingSessionStatus}, which is about the <b>stay</b>. A stay
 * can be running and uncharged — courtesy, saved minutes, outside charging hours — and one that ended
 * a month ago is still paid. Folding the two into one column is what forces everybody afterwards to
 * infer the payment from the amount, which is exactly what must not be done with money.</p>
 */
public enum PaymentStatus {

    /** Money left the wallet, and {@code paymentTransactionId} names the movement. */
    PAID,

    /**
     * Nothing was charged, and {@link NoChargeReason} says why. It is not a failure to pay.
     */
    NO_CHARGE,

    /**
     * The money has not settled yet.
     *
     * <p>Today this never survives a commit. A stay is written and flushed <em>before</em> the wallet
     * is touched — that is what lets the partial unique indexes decide a race between two replicas
     * while the transaction can still roll back cleanly — so the row holds this for a few statements
     * and is then either {@link #PAID} or rolled back entirely.</p>
     *
     * <p>It is a real, lasting state the day a provider that answers asynchronously arrives — a card,
     * a bank transfer. Having it now means that day is a new branch and not an alteration of the
     * largest table in the domain with live data in it.</p>
     */
    PENDING,

    /** The provider refused. Same note as {@link #PENDING}: it lasts only once one exists. */
    FAILED;

    public boolean isSettled() {
        return this == PAID || this == NO_CHARGE;
    }
}
