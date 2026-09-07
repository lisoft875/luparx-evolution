package cr.luparx.identity.service;

import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.UnauthorizedException;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.entity.UserMfaRecoveryCode;
import cr.luparx.identity.entity.UserMfaTotp;
import cr.luparx.identity.model.TotpStatus;
import cr.luparx.identity.repository.UserMfaRecoveryCodeRepository;
import cr.luparx.identity.repository.UserMfaTotpRepository;
import cr.luparx.identity.repository.UserRepository;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * TOTP enrolment and verification (ADR 0007).
 *
 * <p>The secret is encrypted at rest with a key held outside the database, so a database dump alone
 * cannot bypass anybody's second factor. Recovery codes are hashed with Argon2id exactly like
 * passwords and are strictly single-use.</p>
 */
public class MfaService {

    private static final int RECOVERY_CODE_COUNT = 10;
    private static final String RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int RECOVERY_CODE_LENGTH = 10;

    private final UserRepository userRepository;
    private final UserMfaTotpRepository totpRepository;
    private final UserMfaRecoveryCodeRepository recoveryCodeRepository;
    private final TotpService totpService;
    private final SecretCipher secretCipher;
    private final PasswordService passwordService;
    private final String issuerName;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public MfaService(UserRepository userRepository,
                      UserMfaTotpRepository totpRepository,
                      UserMfaRecoveryCodeRepository recoveryCodeRepository,
                      TotpService totpService,
                      SecretCipher secretCipher,
                      PasswordService passwordService,
                      String issuerName,
                      Clock clock) {
        this.userRepository = userRepository;
        this.totpRepository = totpRepository;
        this.recoveryCodeRepository = recoveryCodeRepository;
        this.totpService = totpService;
        this.secretCipher = secretCipher;
        this.passwordService = passwordService;
        this.issuerName = issuerName;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public boolean isActive(UserId userId) {
        return totpRepository.findById(userId.value()).map(UserMfaTotp::isActive).orElse(false);
    }

    /**
     * Generates (or regenerates) a pending secret and a fresh set of recovery codes.
     *
     * @throws ConflictException when MFA is already active — disabling it first is an explicit,
     *                           code-verified action, not a side effect of calling setup again
     */
    @Transactional
    public MfaSetup startSetup(UserId userId) {
        User user = requireUser(userId);
        Instant now = clock.instant();
        Optional<UserMfaTotp> existing = totpRepository.findById(userId.value());
        if (existing.isPresent() && existing.get().isActive()) {
            throw ConflictException.of(ErrorCode.MFA_ALREADY_ACTIVE, "error.mfa.alreadyActive");
        }

        String secret = totpService.generateSecret();
        String encrypted = secretCipher.encrypt(secret);
        if (existing.isPresent()) {
            existing.get().replaceSecret(encrypted, now);
        } else {
            totpRepository.save(new UserMfaTotp(userId.value(), encrypted, TotpStatus.PENDING, now));
        }

        recoveryCodeRepository.deleteByUserId(userId.value());
        List<String> plaintextCodes = new ArrayList<>(RECOVERY_CODE_COUNT);
        for (int index = 0; index < RECOVERY_CODE_COUNT; index++) {
            String code = generateRecoveryCode();
            plaintextCodes.add(code);
            recoveryCodeRepository.save(new UserMfaRecoveryCode(Uuid7.generate(), userId.value(),
                    passwordService.hash(code), now));
        }

        String otpauthUri = totpService.buildOtpauthUri(issuerName, user.getEmail(), secret);
        return new MfaSetup(secret, otpauthUri, plaintextCodes);
    }

    /** Confirms enrolment: the user must prove they can produce a current code. */
    @Transactional
    public void activate(UserId userId, String code) {
        UserMfaTotp totp = totpRepository.findById(userId.value())
                .orElseThrow(() -> NotFoundException.of(ErrorCode.MFA_NOT_ENABLED, "error.mfa.notEnabled"));
        if (totp.isActive()) {
            throw ConflictException.of(ErrorCode.MFA_ALREADY_ACTIVE, "error.mfa.alreadyActive");
        }
        String secret = secretCipher.decrypt(totp.getSecretEncrypted());
        if (!totpService.verify(secret, code, clock.instant())) {
            throw UnauthorizedException.of(ErrorCode.INVALID_MFA_CODE, "error.mfa.code.invalid");
        }
        totp.activate(clock.instant());
    }

    /** Disabling requires a valid current code (or a recovery code): losing the phone is not enough. */
    @Transactional
    public void disable(UserId userId, String code) {
        UserMfaTotp totp = totpRepository.findById(userId.value())
                .orElseThrow(() -> NotFoundException.of(ErrorCode.MFA_NOT_ENABLED, "error.mfa.notEnabled"));
        if (!verifyCode(userId, code)) {
            throw UnauthorizedException.of(ErrorCode.INVALID_MFA_CODE, "error.mfa.code.invalid");
        }
        totp.disable(clock.instant());
        recoveryCodeRepository.deleteByUserId(userId.value());
    }

    /**
     * Verifies a second factor: first as a TOTP code, then as a single-use recovery code.
     *
     * @return true when the code was accepted; a recovery code is consumed in the process
     */
    @Transactional
    public boolean verifyCode(UserId userId, String code) {
        if (code == null || code.isBlank()) {
            return false;
        }
        Optional<UserMfaTotp> totp = totpRepository.findById(userId.value());
        if (totp.isPresent() && totp.get().isActive()) {
            String secret = secretCipher.decrypt(totp.get().getSecretEncrypted());
            if (totpService.verify(secret, code, clock.instant())) {
                return true;
            }
        }
        return consumeRecoveryCode(userId, code);
    }

    private boolean consumeRecoveryCode(UserId userId, String code) {
        String normalized = code.replace("-", "").replace(" ", "").toUpperCase(Locale.ROOT);
        List<UserMfaRecoveryCode> available = recoveryCodeRepository.findByUserIdAndUsedAtIsNull(userId.value());
        for (UserMfaRecoveryCode candidate : available) {
            if (passwordService.matches(normalized, candidate.getCodeHash())) {
                candidate.markUsed(clock.instant());
                return true;
            }
        }
        return false;
    }

    private String generateRecoveryCode() {
        StringBuilder builder = new StringBuilder(RECOVERY_CODE_LENGTH);
        for (int index = 0; index < RECOVERY_CODE_LENGTH; index++) {
            builder.append(RECOVERY_ALPHABET.charAt(random.nextInt(RECOVERY_ALPHABET.length())));
        }
        return builder.toString();
    }

    private User requireUser(UserId userId) {
        return userRepository.findById(userId.value())
                .orElseThrow(() -> NotFoundException.of(ErrorCode.USER_NOT_FOUND, "error.user.notFound"));
    }
}
