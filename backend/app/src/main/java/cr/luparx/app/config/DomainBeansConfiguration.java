package cr.luparx.app.config;

import cr.luparx.core.domain.Portal;
import cr.luparx.enforcement.model.DocumentPolicy;
import cr.luparx.enforcement.model.EvidencePolicy;
import cr.luparx.identity.port.JwtKeySource;
import cr.luparx.identity.repository.UserRepository;
import cr.luparx.identity.service.PasswordProperties;
import cr.luparx.identity.service.PasswordService;
import cr.luparx.identity.service.RateLimitProperties;
import cr.luparx.identity.service.RegistrationPolicy;
import cr.luparx.identity.service.TokenProperties;
import cr.luparx.identity.service.TokenService;
import cr.luparx.parking.model.MinuteIncrements;
import cr.luparx.parking.model.ParkingPolicyDefaults;
import cr.luparx.parking.model.ParkingScheduleDefaults;
import cr.luparx.parking.model.ParkingSpaceFormatDefaults;
import cr.luparx.tenancy.service.EffectiveLocaleService;
import cr.luparx.tenancy.service.TenantLocaleService;
import cr.luparx.tenancy.service.TenantService;
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
                properties.graceMinutesOrDefault(),
                properties.freeMinutesOrDefault());
    }

    /**
     * Turns {@code platform.defaults.parking.charging-*} into the timetable a municipality starts
     * with. Composed here for the same reason as {@link #parkingPolicyDefaults}: "Monday to Saturday,
     * 07:00 to 18:00" is a line of YAML in this deployment, never a constant in the domain.
     */
    @Bean
    public ParkingScheduleDefaults parkingScheduleDefaults(ParkingOperationDefaultsProperties properties) {
        return ParkingScheduleDefaults.of(
                properties.chargesAllDayOrDefault(),
                properties.chargingWeekdaysOrDefault(),
                properties.chargingStartMinuteOrDefault(),
                properties.chargingEndMinuteOrDefault());
    }

    /** The bay-code shape a municipality starts with ({@code platform.defaults.parking.space-code-*}). */
    @Bean
    public ParkingSpaceFormatDefaults parkingSpaceFormatDefaults(ParkingOperationDefaultsProperties properties) {
        return new ParkingSpaceFormatDefaults(
                properties.spaceCodePrefixOrDefault(),
                properties.spaceCodeDigitsOrDefault(),
                properties.spaceCodeAllowLettersOrDefault());
    }

    /**
     * The deterministic locale resolution of CONTRACT.md v0.3, assembled here because the platform
     * default is deployment configuration and module-tenancy must not read YAML.
     */
    @Bean
    public EffectiveLocaleService effectiveLocaleService(TenantLocaleService tenantLocaleService,
                                                         TenantService tenantService,
                                                         PlatformDefaultsProperties defaults) {
        return new EffectiveLocaleService(tenantLocaleService, tenantService, defaults.locale());
    }

    /**
     * The limits every evidence upload is held to, assembled here because they are deployment
     * configuration and {@code module-enforcement} must not read YAML. Enforcing them in the domain,
     * before any storage implementation sees the bytes, is what keeps a filesystem store and an
     * object store from ever disagreeing about what is acceptable.
     */
    @Bean
    public EvidencePolicy evidencePolicy(EnforcementProperties properties) {
        return new EvidencePolicy(properties.maxEvidenceBytes(),
                Set.copyOf(properties.allowedImageTypes()),
                properties.maxPhotosPerCitation(),
                properties.maxNoteLength(),
                properties.maxAppealImageBytes());
    }

    /**
     * The limits a permit's backing documents are held to (CONTRACT.md v0.30). Its own bean and not
     * part of {@link EvidencePolicy}, because a scanned assessment and a windscreen photograph are
     * different files arriving from different places — see {@link DocumentPolicy}.
     */
    @Bean
    public DocumentPolicy documentPolicy(EnforcementProperties properties) {
        return new DocumentPolicy(properties.maxDocumentBytes(),
                Set.copyOf(properties.allowedDocumentTypes()),
                properties.maxDocumentsPerPermit());
    }

    @Bean
    public JwtKeySource jwtKeySource(JwtProperties jwtProperties) {
        return new RsaJwtKeySource(jwtProperties);
    }

    @Bean
    public TokenService tokenService(JwtKeySource keySource, TokenProperties tokenProperties, Clock clock) {
        return new TokenService(keySource, tokenProperties, clock);
    }
}
