package cr.luparx.identity.model;

/** State of a TOTP enrolment (ADR 0007). A secret is only trusted once the user proved a code. */
public enum TotpStatus {

    /** Secret generated, first valid code not yet supplied. */
    PENDING,
    /** Confirmed and usable as a second factor. */
    ACTIVE,
    /** Disabled by the user or by an administrator; the secret must be regenerated to re-enable. */
    DISABLED
}
