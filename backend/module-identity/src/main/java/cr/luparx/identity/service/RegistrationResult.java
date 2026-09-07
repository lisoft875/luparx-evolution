package cr.luparx.identity.service;

import cr.luparx.core.id.UserId;
import cr.luparx.identity.model.UserStatus;

/**
 * Outcome of a registration (CONTRACT.md §4 response of {@code POST /auth/{portal}/register}).
 *
 * <p>{@code requiresApproval} is deliberately absent: whether the accompanying membership needs an
 * approval is a tenancy decision, and the application layer reads it from the membership that
 * MembershipService actually created rather than from a flag guessed here.</p>
 *
 * @param emailVerificationToken plaintext token, returned only so the caller can hand it to the
 *                               notification sender; it is never serialised to the client
 */
public record RegistrationResult(
        UserId userId,
        UserStatus status,
        boolean requiresEmailVerification,
        String emailVerificationToken) {
}
