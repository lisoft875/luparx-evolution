package cr.luparx.app.config;

import cr.luparx.core.domain.Portal;
import cr.luparx.identity.port.JwtKeySource;
import cr.luparx.identity.repository.UserMfaRecoveryCodeRepository;
import cr.luparx.identity.repository.UserMfaTotpRepository;
import cr.luparx.identity.repository.UserRepository;
import cr.luparx.identity.service.MfaPolicy;
import cr.luparx.identity.service.MfaService;
import cr.luparx.identity.service.PasswordProperties;
import cr.luparx.identity.service.PasswordService;
import cr.luparx.identity.service.RateLimitProperties;
import cr.luparx.identity.service.RegistrationPolicy;
import cr.luparx.identity.service.SecretCipher;
import cr.luparx.identity.service.TokenProperties;
import cr.luparx.identity.service.TokenService;
import cr.luparx.identity.service.TotpService;
import cr.luparx.parking.model.MinuteIncrements;
import cr.luparx.parking.model.ParkingPolicyDefaults;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/**
 * Wires the framework-free domain services of the modules that intentionally do not carry Spring
 * annotations (value objects with constructor arguments that come from configuration).
 *
 * <p>Keeping this composition in the application module is what allows platform-core, module-geo,
 * module-identity and module-tenancy to stay free of deployment concerns.</p>
 */
@Configuration
public class DomainBeansConfiguration {

    private static final Logger LOGGER = LoggerFactory.getLogger(DomainBeansConfiguration.class);

    /**
     * A single UTC clock, injected everywhere instead of calling {@code Instant.now()} — timestamps
     * are stored in UTC and converted per user/tenant at the edge (CONTRACT.md §7).
     */
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    public PasswordProperties passwordProperties(SecurityProperties securityProperties) {
        PasswordProperties defaults = PasswordProperties.defaults();
        int minLength = securityProperties.passwordMinLength() > 0
                ? securityProperties.passwordMinLength()
                : defaults.minLength();
        return new PasswordProperties(minLength, defaults.memoryKib(), defaults.iterations(),
                defaults.parallelism(), defaults.saltLength(), defaults.hashLength());
    }

    @Bean
    public TokenProperties tokenProperties(JwtProperties jwtProperties) {
        return new TokenProperties(
                jwtProperties.issuer(),
                jwtProperties.accessTokenTtl(),
                jwtProperties.refreshTokenTtl(),
                jwtProperties.mfaChallengeTtl(),
                jwtProperties.oauthStateTtl());
    }

    @Bean
    public RateLimitProperties rateLimitProperties(SecurityProperties securityProperties) {
        return new RateLimitProperties(
                securityProperties.loginWindow(),
                securityProperties.loginMaxPerEmail(),
                securityProperties.loginMaxPerIp(),
                securityProperties.loginLockout(),
                securityProperties.ipHashPepper());
    }

    @Bean
    public RegistrationPolicy registrationPolicy(PlatformDefaultsProperties defaults) {
        return new RegistrationPolicy(
                defaults.minimumAge(),
                defaults.locale(),
                defaults.timeZone(),
                defaults.countryCode(),
                defaults.termsVersion());
    }

    /**
     * Resolves {@code luparx.security.mfa-enforced-portals} into the policy the login flow, the
     * portal filter chains and the "disable my TOTP" endpoint all share.
     *
     * <p>An unknown slug is ignored with a warning rather than failing the start: a typo in one
     * entry must not take the whole deployment down, and the remaining portals stay protected. An
     * empty list means MFA is enforced nowhere, which is legitimate on a laptop and a serious
     * finding anywhere else, so it is stated loudly on every start.</p>
     */
    @Bean
    public MfaPolicy mfaPolicy(SecurityProperties securityProperties) {
        List<String> configured = securityProperties.mfaEnforcedPortals();
        Set<Portal> enforced = EnumSet.noneOf(Portal.class);
        if (configured != null) {
            for (String slug : configured) {
                if (slug == null || slug.isBlank()) {
                    continue;
                }
                Portal.fromSlug(slug.trim()).ifPresentOrElse(
                        enforced::add,
                        () -> LOGGER.warn("luparx.security.mfa-enforced-portals contains an unknown portal"
                                + " '{}'; it is ignored.", slug));
            }
        }
        if (enforced.isEmpty()) {
            LOGGER.warn("MFA ENFORCEMENT IS DISABLED on every portal (luparx.security.mfa-enforced-portals is"
                    + " empty). This is acceptable only on a developer laptop; every shared environment must"
                    + " set it back to admin,inspector,platform.");
        } else {
            LOGGER.info("MFA enforced on portals: {}", enforced);
        }
        return new MfaPolicy(enforced);
    }

    /**
     * Turns {@code platform.defaults.parking.*} into the value object the parking domain reads.
     *
     * <p>Composed here rather than annotated inside module-parking for the same reason as
     * {@link #registrationPolicy}: the bounded contexts stay free of deployment concerns, and the
     * one place that knows about YAML is the application module. A municipality that has configured
     * its own policy never sees these values — they only fill in the row it has not written yet.</p>
     */
    @Bean
    public ParkingPolicyDefaults parkingPolicyDefaults(ParkingDefaultsProperties properties) {
        return new ParkingPolicyDefaults(
                MinuteIncrements.of(properties.sessionIncrementsOrDefault()),
                properties.sessionMinOrDefault(),
                properties.sessionMaxOrDefault(),
                properties.extensionEnabledOrDefault(),
                MinuteIncrements.of(properties.extensionIncrementsOrDefault()),
                properties.extensionMaxTotalOrDefault(),
                properties.earlyFinishEnabledOrDefault(),
                properties.creditOnEarlyFinishEnabledOrDefault(),
                properties.creditMinRemainingOrDefault(),
                properties.creditExpiryDaysOrDefault(),
                properties.graceMinutesOrDefault());
    }

    @Bean
    public JwtKeySource jwtKeySource(JwtProperties jwtProperties) {
        return new RsaJwtKeySource(jwtProperties);
    }

    @Bean
    public TokenService tokenService(JwtKeySource keySource, TokenProperties tokenProperties, Clock clock) {
        return new TokenService(keySource, tokenProperties, clock);
    }

    @Bean
    public TotpService totpService() {
        return new TotpService();
    }

    @Bean
    public SecretCipher totpSecretCipher(SecurityProperties securityProperties) {
        return new SecretCipher(securityProperties.mfaEncryptionKey());
    }

    @Bean
    public MfaService mfaService(UserRepository userRepository,
                                 UserMfaTotpRepository totpRepository,
                                 UserMfaRecoveryCodeRepository recoveryCodeRepository,
                                 TotpService totpService,
                                 SecretCipher secretCipher,
                                 PasswordService passwordService,
                                 SecurityProperties securityProperties,
                                 Clock clock) {
        return new MfaService(userRepository, totpRepository, recoveryCodeRepository, totpService, secretCipher,
                passwordService, securityProperties.mfaIssuerName(), clock);
    }
}
