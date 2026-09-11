package cr.luparx.identity.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.UnauthorizedException;
import cr.luparx.core.id.UserId;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.entity.UserCredentials;
import cr.luparx.identity.repository.UserCredentialsRepository;
import cr.luparx.identity.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;

/**
 * Changing one's own password (CONTRACT.md v0.3 §3, {@code POST /api/v1/{portal}/me/password}).
 *
 * <p>Separate from {@link PasswordResetService} because the two start from opposite premises. A
 * reset begins with "I cannot get in" and is authorised by a token emailed to the address on file. A
 * change begins with "I am already in" and is authorised by <b>the current password</b>: a stolen
 * access token must not be enough to lock the rightful owner out of their own account, which is
 * exactly what a change without that check would allow.</p>
 *
 * <p>What a successful change does, and why:</p>
 * <ul>
 *   <li>bumps {@code credentials_version} — every access token minted before this moment carries the
 *       old {@code ver} claim and is refused on its next call, instead of living out its 15 minutes;</li>
 *   <li>revokes every refresh token of the person — with sessions that no longer expire on their own
 *       (v0.3 §2), a password change is one of the few things that <em>does</em> end them, and it has
 *       to reach the device the password was changed because of. The caller is handed a fresh pair by
 *       the controller, so the browser doing the change is the only session that survives.</li>
 * </ul>
 */
@Service
public class PasswordChangeService {

    private final UserRepository userRepository;
    private final UserCredentialsRepository credentialsRepository;
    private final PasswordService passwordService;
    private final RefreshTokenService refreshTokenService;
    private final Clock clock;

    public PasswordChangeService(UserRepository userRepository,
                                 UserCredentialsRepository credentialsRepository,
                                 PasswordService passwordService,
                                 RefreshTokenService refreshTokenService,
                                 Clock clock) {
        this.userRepository = userRepository;
        this.credentialsRepository = credentialsRepository;
        this.passwordService = passwordService;
        this.refreshTokenService = refreshTokenService;
        this.clock = clock;
    }

    /**
     * @throws UnauthorizedException {@code CURRENT_PASSWORD_INVALID} when the current password does
     *         not match, and {@code PASSWORD_LOGIN_UNAVAILABLE} for an account that has no local
     *         password at all
     * @throws cr.luparx.core.error.ValidationException when the new password fails the configured
     *         strength policy — the same {@link PasswordService#validatePolicy} registration and
     *         reset apply, so there is one definition of "strong enough"
     */
    @Transactional
    public User change(UserId userId, String currentPassword, String newPassword) {
        User user = userRepository.findById(userId.value())
                .orElseThrow(() -> NotFoundException.of(ErrorCode.USER_NOT_FOUND, "error.user.notFound"));
        UserCredentials credentials = credentialsRepository.findById(user.getId())
                .orElseThrow(() -> UnauthorizedException.of(ErrorCode.PASSWORD_LOGIN_UNAVAILABLE,
                        "error.auth.passwordLoginUnavailable"));

        if (!passwordService.matches(currentPassword, credentials.getPasswordHash())) {
            throw UnauthorizedException.of(ErrorCode.CURRENT_PASSWORD_INVALID, "error.password.currentInvalid");
        }
        passwordService.validatePolicy(newPassword, "newPassword");

        Instant now = clock.instant();
        credentials.replace(passwordService.hash(newPassword), passwordService.algorithm(), now);
        user.bumpCredentialsVersion(now);
        refreshTokenService.revokeAllForUser(userId);
        return user;
    }
}
