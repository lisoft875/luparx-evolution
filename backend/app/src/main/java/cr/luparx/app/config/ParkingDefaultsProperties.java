package cr.luparx.app.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * Parking <b>defaults</b> of this deployment ({@code platform.defaults.parking.*}).
 *
 * <p>They fill in the policy of a municipality that has not configured one yet, and nothing more.
 * CONTRACT.md v0.2 makes every one of these values a decision of the municipality — "Todo con
 * valores por defecto de plataforma; nada de constantes en el código" — so the fallback lives in
 * YAML and the real value lives in {@code parking_policies}. Nothing in the domain reads this class:
 * it is converted once into {@code ParkingPolicyDefaults} by {@code DomainBeansConfiguration}.</p>
 *
 * @param sessionIncrementsMinutes   options offered when starting a session
 * @param sessionMinMinutes          shortest session accepted
 * @param sessionMaxMinutes          longest session accepted
 * @param extensionEnabled           whether a running session may be extended
 * @param extensionIncrementsMinutes options offered when extending
 * @param extensionMaxTotalMinutes   cap on session + extensions; never below the session maximum
 * @param earlyFinishEnabled         whether a citizen may close a session before it expires
 * @param creditOnEarlyFinishEnabled whether the minutes left over come back as credit
 * @param creditMinRemainingMinutes  minimum remaining minutes for a credit to be granted
 * @param creditExpiryDays           days a credited minute stays usable; 0 means it never expires
 * @param graceMinutes               tolerance before a session counts as expired
 * @param freeMinutes                minutes of courtesy at the start of a stay; 0 means none
 */
@ConfigurationProperties(prefix = "platform.defaults.parking")
public record ParkingDefaultsProperties(
        List<Integer> sessionIncrementsMinutes,
        Integer sessionMinMinutes,
        Integer sessionMaxMinutes,
        Boolean extensionEnabled,
        List<Integer> extensionIncrementsMinutes,
        Integer extensionMaxTotalMinutes,
        Boolean earlyFinishEnabled,
        Boolean creditOnEarlyFinishEnabled,
        Integer creditMinRemainingMinutes,
        Integer creditExpiryDays,
        Integer graceMinutes,
        Integer freeMinutes) {

    /*
     * Wrapper types on purpose, exactly as DevSeedProperties does: an absent property binds to null
     * rather than to 0 or false, so "not configured" and "configured to zero" stay distinguishable
     * and the fallback below is applied deliberately instead of by accident.
     */

    public List<Integer> sessionIncrementsOrDefault() {
        return sessionIncrementsMinutes == null || sessionIncrementsMinutes.isEmpty()
                ? List.of(Integer.valueOf(30), Integer.valueOf(60), Integer.valueOf(120))
                : sessionIncrementsMinutes;
    }

    public List<Integer> extensionIncrementsOrDefault() {
        return extensionIncrementsMinutes == null || extensionIncrementsMinutes.isEmpty()
                ? List.of(Integer.valueOf(15), Integer.valueOf(30), Integer.valueOf(60))
                : extensionIncrementsMinutes;
    }

    public int sessionMinOrDefault() {
        return sessionMinMinutes == null || sessionMinMinutes.intValue() <= 0 ? 30 : sessionMinMinutes.intValue();
    }

    public int sessionMaxOrDefault() {
        return sessionMaxMinutes == null || sessionMaxMinutes.intValue() <= 0 ? 480 : sessionMaxMinutes.intValue();
    }

    public boolean extensionEnabledOrDefault() {
        return extensionEnabled == null || extensionEnabled.booleanValue();
    }

    public int extensionMaxTotalOrDefault() {
        int fallback = Math.max(sessionMaxOrDefault(), 720);
        return extensionMaxTotalMinutes == null || extensionMaxTotalMinutes.intValue() <= 0
                ? fallback
                : Math.max(extensionMaxTotalMinutes.intValue(), sessionMaxOrDefault());
    }

    public boolean earlyFinishEnabledOrDefault() {
        return earlyFinishEnabled == null || earlyFinishEnabled.booleanValue();
    }

    public boolean creditOnEarlyFinishEnabledOrDefault() {
        return earlyFinishEnabledOrDefault()
                && (creditOnEarlyFinishEnabled == null || creditOnEarlyFinishEnabled.booleanValue());
    }

    public int creditMinRemainingOrDefault() {
        return creditMinRemainingMinutes == null || creditMinRemainingMinutes.intValue() < 0
                ? 10
                : creditMinRemainingMinutes.intValue();
    }

    public int creditExpiryDaysOrDefault() {
        return creditExpiryDays == null || creditExpiryDays.intValue() < 0 ? 90 : creditExpiryDays.intValue();
    }

    public int graceMinutesOrDefault() {
        return graceMinutes == null || graceMinutes.intValue() < 0 ? 5 : graceMinutes.intValue();
    }

    /**
     * Zero unless a deployment says otherwise, which is what every municipality had before v0.31.
     * Courtesy is a policy decision with a revenue cost, so the platform does not hand it out by
     * default on somebody else's behalf.
     */
    public int freeMinutesOrDefault() {
        return freeMinutes == null || freeMinutes.intValue() < 0 ? 0 : freeMinutes.intValue();
    }
}
