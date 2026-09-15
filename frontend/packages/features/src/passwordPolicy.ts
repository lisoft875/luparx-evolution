/**
 * Minimum password length the CLIENT enforces, mirroring the server's `PASSWORD_MIN_LENGTH`
 * (`luparx.security.password-min-length`, 8 by default since v0.42).
 *
 * <h2>One constant, three forms</h2>
 *
 * It lived copied in `registration/schema.ts`, `profile/ChangePasswordForm.tsx` and
 * `login/ResetPasswordForm.tsx`. Three copies of a rule that has to agree is three chances to
 * disagree: a user who registers with a password the reset form would reject, or vice versa, and a
 * mismatch that only shows up months later on the one screen nobody re-tested.
 *
 * <h2>The client is not the authority</h2>
 *
 * The server validates the policy and refuses what breaks it. This number exists only so the form
 * can say "too short" before making a round trip, and so the hint under the field is truthful.
 * Should the deployment raise its minimum, the server starts refusing and this value is then merely
 * optimistic — the proper fix is to publish the policy in the API and read it, the same way the
 * reminder window is read from the parking policy. Written down here because it is a real limitation
 * and not an oversight.
 */
export const MIN_PASSWORD_LENGTH = 8;
