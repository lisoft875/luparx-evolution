package cr.luparx.identity.model;

/** What a one-time verification token is good for. A token is never valid for another purpose. */
public enum VerificationPurpose {

    EMAIL_VERIFICATION,
    PASSWORD_RESET,
    /**
     * Retired in v0.39 with the rest of identity federation (ADR 0022). Nothing issues or consumes
     * it any more.
     *
     * <p>The constant stays because {@code verification_tokens} has a CHECK constraint that lists
     * these values by name, and the rows of a database outlive the code that wrote them: removing
     * the name here before the contraction migration removes it there would turn any old row into an
     * enum that cannot be read. It goes when the schema does.</p>
     */
    FEDERATED_LINK_CONFIRMATION,
    /**
     * Confirms, <em>from the new mailbox</em>, that the account may move to a different address
     * (CONTRACT.md v0.3, "Perfil editable"). The address travels on the token, not on the user row:
     * until it is confirmed, the account's email is still the old one.
     */
    EMAIL_CHANGE
}
