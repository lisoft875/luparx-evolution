package cr.luparx.parking.model;

/**
 * Kind of movement in the citizen's wallet ({@code wallet_transactions.type}).
 *
 * <p>The sign of the amount is not free: V11_0 has a CHECK that ties each type to its sign, so a
 * charge can never be written as a credit by a bug in a caller.</p>
 */
public enum WalletTransactionType {

    /** Money added to the wallet. Positive. */
    TOP_UP,

    /** Charged when a session starts. Negative. */
    SESSION_CHARGE,

    /** Charged when a session is extended. Negative. */
    EXTENSION_CHARGE,

    /** Operator correction, in either direction, and the only type whose sign is unconstrained. */
    ADJUSTMENT
}
