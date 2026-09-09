package cr.luparx.parking.model;

import java.util.Locale;

/**
 * Where the money in a wallet movement came from.
 *
 * <p>Until v0.8 every top-up looked alike, which made a ledger impossible to reconcile: "someone
 * credited 10 000 colones" is not an answer a municipal auditor accepts. Each value below is a
 * different channel with a different control around it, and they are deliberately not
 * interchangeable.</p>
 */
public enum WalletTopupSource {

    /** The citizen paid through the app (the payments batch; the value exists so the ledger does). */
    CITIZEN,
    /** A cashier at the municipality's own counter, acting under their own account. */
    MUNICIPAL_COUNTER,
    /** An external network — a supermarket chain — authenticated server to server. */
    PARTNER,
    /** An operator correction, in either direction. */
    ADJUSTMENT,
    /** The development shortcut. Never reachable outside the {@code dev} profile. */
    DEV;

    public String labelKey() {
        return "wallet.topup.source." + name().toLowerCase(Locale.ROOT);
    }
}
