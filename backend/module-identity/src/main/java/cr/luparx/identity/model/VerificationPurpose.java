package cr.luparx.identity.model;

/** What a one-time verification token is good for. A token is never valid for another purpose. */
public enum VerificationPurpose {

    EMAIL_VERIFICATION,
    PASSWORD_RESET,
    /** Confirms linking a federated identity to an existing local account (ADR 0006). */
    FEDERATED_LINK_CONFIRMATION,
    /**
     * Confirms, <em>from the new mailbox</em>, that the account may move to a different address
     * (CONTRACT.md v0.3, "Perfil editable"). The address travels on the token, not on the user row:
     * until it is confirmed, the account's email is still the old one.
     */
    EMAIL_CHANGE
}
