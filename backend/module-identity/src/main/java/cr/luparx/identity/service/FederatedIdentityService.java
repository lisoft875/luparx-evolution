package cr.luparx.identity.service;

import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ForbiddenException;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.UnauthorizedException;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.entity.UserFederatedIdentity;
import cr.luparx.identity.entity.VerificationToken;
import cr.luparx.identity.model.VerificationPurpose;
import cr.luparx.identity.repository.UserCredentialsRepository;
import cr.luparx.identity.repository.UserFederatedIdentityRepository;
import cr.luparx.identity.repository.UserRepository;
import cr.luparx.identity.repository.VerificationTokenRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;

/**
 * Linking and login through Google, Microsoft Entra ID and Facebook (CONTRACT.md §3, ADR 0006).
 *
 * <p>The rules that matter for account safety:</p>
 * <ul>
 *   <li>{@code (provider, subject)} is the identity, never the email — providers let people change
 *       their address, and a unique constraint on the subject stops two accounts sharing one;</li>
 *   <li>a provider email that is not marked verified never links to anything;</li>
 *   <li>if the address already belongs to an account <b>with a local password</b>, the link is not
 *       made automatically: an explicit confirmation, emailed to that address, is required, otherwise
 *       registering a provider account with someone else's address would be a takeover path.</li>
 * </ul>
 */
@Service
public class FederatedIdentityService {

    private static final Duration CONFIRMATION_TTL = Duration.ofMinutes(30);

    private final UserFederatedIdentityRepository federatedIdentityRepository;
    private final UserRepository userRepository;
    private final UserCredentialsRepository credentialsRepository;
    private final VerificationTokenRepository verificationTokenRepository;
    private final Clock clock;

    public FederatedIdentityService(UserFederatedIdentityRepository federatedIdentityRepository,
                                    UserRepository userRepository,
                                    UserCredentialsRepository credentialsRepository,
                                    VerificationTokenRepository verificationTokenRepository,
                                    Clock clock) {
        this.federatedIdentityRepository = federatedIdentityRepository;
        this.userRepository = userRepository;
        this.credentialsRepository = credentialsRepository;
        this.verificationTokenRepository = verificationTokenRepository;
        this.clock = clock;
    }

    /**
     * Resolves an external identity to a local user.
     *
     * @throws ForbiddenException with {@code FEDERATION_EMAIL_NOT_VERIFIED} when the provider did not
     *                            verify the address
     * @throws ConflictException  with {@code FEDERATION_LINK_CONFIRMATION_REQUIRED} when the address
     *                            belongs to a password account; a confirmation token has been issued
     * @throws NotFoundException  with {@code FEDERATION_REGISTRATION_REQUIRED} when nobody owns the
     *                            address: the platform cannot invent the mandatory registration data
     *                            of CONTRACT.md §2 (document, address, birth date) from provider
     *                            claims, so the person must complete the registration form first
     */
    @Transactional
    public User resolve(ExternalIdentity identity) {
        Optional<UserFederatedIdentity> existing = federatedIdentityRepository
                .findByProviderAndSubject(identity.provider(), identity.subject());
        if (existing.isPresent()) {
            return userRepository.findById(existing.get().getUserId())
                    .orElseThrow(() -> NotFoundException.of(ErrorCode.USER_NOT_FOUND, "error.user.notFound"));
        }

        if (!identity.emailVerified() || identity.email() == null || identity.email().isBlank()) {
            throw ForbiddenException.of(ErrorCode.FEDERATION_EMAIL_NOT_VERIFIED,
                    "error.federation.emailNotVerified");
        }

        String email = identity.email().trim().toLowerCase(Locale.ROOT);
        Optional<User> byEmail = userRepository.findByEmail(email);
        if (byEmail.isEmpty()) {
            throw NotFoundException.of(ErrorCode.FEDERATION_REGISTRATION_REQUIRED,
                    "error.federation.registrationRequired");
        }

        User user = byEmail.get();
        boolean hasLocalPassword = credentialsRepository.findById(user.getId()).isPresent();
        if (hasLocalPassword) {
            issueLinkConfirmation(UserId.of(user.getId()));
            throw ConflictException.of(ErrorCode.FEDERATION_LINK_CONFIRMATION_REQUIRED,
                    "error.federation.confirmationRequired");
        }

        link(user, identity);
        return user;
    }

    /** Links after the user clicked the confirmation link sent to their address. */
    @Transactional
    public User confirmLink(String rawToken, ExternalIdentity identity) {
        Instant now = clock.instant();
        VerificationToken token = verificationTokenRepository.findByTokenHash(Hashing.sha256Hex(rawToken))
                .filter(candidate -> candidate.getPurpose() == VerificationPurpose.FEDERATED_LINK_CONFIRMATION)
                .filter(candidate -> candidate.isUsable(now))
                .orElseThrow(() -> UnauthorizedException.of(ErrorCode.VERIFICATION_TOKEN_INVALID,
                        "error.verification.token.invalid"));
        User user = userRepository.findById(token.getUserId())
                .orElseThrow(() -> NotFoundException.of(ErrorCode.USER_NOT_FOUND, "error.user.notFound"));
        token.markUsed(now);
        link(user, identity);
        return user;
    }

    /** @return the plaintext confirmation token, to be emailed to the account owner */
    @Transactional
    public String issueLinkConfirmation(UserId userId) {
        Instant now = clock.instant();
        verificationTokenRepository.consumeOutstanding(userId.value(),
                VerificationPurpose.FEDERATED_LINK_CONFIRMATION, now);
        String raw = Hashing.randomToken();
        verificationTokenRepository.save(new VerificationToken(
                Uuid7.generate(),
                userId.value(),
                VerificationPurpose.FEDERATED_LINK_CONFIRMATION,
                Hashing.sha256Hex(raw),
                now,
                now.plus(CONFIRMATION_TTL)));
        return raw;
    }

    private void link(User user, ExternalIdentity identity) {
        Instant now = clock.instant();
        federatedIdentityRepository.save(new UserFederatedIdentity(
                Uuid7.generate(),
                user.getId(),
                identity.provider(),
                identity.subject(),
                identity.email() == null ? null : identity.email().trim().toLowerCase(Locale.ROOT),
                now));
        if (!user.isEmailVerified()) {
            // The provider vouched for the address, which is exactly what our own verification proves.
            user.markEmailVerified(now);
        }
    }
}
