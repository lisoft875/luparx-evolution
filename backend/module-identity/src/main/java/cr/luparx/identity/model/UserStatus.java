package cr.luparx.identity.model;

/** Account state of a global user (CONTRACT.md §5 {@code users.status}). */
public enum UserStatus {

    /** Email verified and not blocked; may authenticate. */
    ACTIVE,
    /** Registered but the email has not been verified yet. */
    PENDING_VERIFICATION,
    /** Blocked by an administrator; authentication is refused and every session is invalidated. */
    BLOCKED;

    public boolean canAuthenticate() {
        return this == ACTIVE;
    }
}
