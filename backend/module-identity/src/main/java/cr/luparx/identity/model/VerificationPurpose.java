package cr.luparx.identity.model;

/** What a one-time verification token is good for. A token is never valid for another purpose. */
public enum VerificationPurpose {

    EMAIL_VERIFICATION,
    PASSWORD_RESET,
    /** Confirms linking a federated identity to an existing local account (ADR 0006). */
    FEDERATED_LINK_CONFIRMATION
}
