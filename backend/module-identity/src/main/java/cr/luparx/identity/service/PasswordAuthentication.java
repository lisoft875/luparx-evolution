package cr.luparx.identity.service;

import cr.luparx.identity.entity.User;

/**
 * Outcome of the password step of a login.
 *
 * @param user                  the authenticated person
 * @param secondFactorRequired  true when a TOTP challenge must be answered before tokens are issued
 * @param enrolmentRequired     true when the portal (or an administrator) mandates MFA but the user
 *                              has not enrolled yet; tokens are issued with {@code mfa=false} and the
 *                              security layer restricts them to the enrolment endpoints
 */
public record PasswordAuthentication(User user, boolean secondFactorRequired, boolean enrolmentRequired) {
}
