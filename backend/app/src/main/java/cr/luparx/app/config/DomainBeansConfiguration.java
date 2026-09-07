package cr.luparx.app.config;

import cr.luparx.identity.port.JwtKeySource;
import cr.luparx.identity.repository.UserMfaRecoveryCodeRepository;
import cr.luparx.identity.repository.UserMfaTotpRepository;
import cr.luparx.identity.repository.UserRepository;
import cr.luparx.identity.service.MfaService;
import cr.luparx.identity.service.PasswordProperties;
import cr.luparx.identity.service.PasswordService;
import cr.luparx.identity.service.RateLimitProperties;
import cr.luparx.identity.service.RegistrationPolicy;
import cr.luparx.identity.service.SecretCipher;
import cr.luparx.identity.service.TokenProperties;
import cr.luparx.identity.service.TokenService;
import cr.luparx.identity.service.TotpService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

/**
 * Wires the framework-free domain services of the modules that intentionally do not carry Spring
 * annotations (value objects with constructor arguments that come from configuration).
 *
 * <p>Keeping this composition in the application module is what allows platform-core, module-geo,
 * module-identity and module-tenancy to stay free of deployment concerns.</p>
 */
@Configuration
public class DomainBeansConfiguration {

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
