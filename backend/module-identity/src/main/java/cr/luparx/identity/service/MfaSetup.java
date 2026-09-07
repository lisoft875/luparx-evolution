package cr.luparx.identity.service;

import java.util.List;

/**
 * Result of starting a TOTP enrolment (CONTRACT.md §4 {@code POST /{portal}/me/mfa/setup}).
 * The secret and the recovery codes are returned exactly once and never again (SECURITY.md §11).
 */
public record MfaSetup(String secret, String otpauthUri, List<String> recoveryCodes) {
}
