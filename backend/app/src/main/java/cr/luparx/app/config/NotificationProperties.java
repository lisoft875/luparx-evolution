package cr.luparx.app.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Notification behaviour of this deployment ({@code luparx.notifications.*}).
 *
 * <p>Every number here is a judgement about somebody else's attention, so none of them is a constant
 * in Java — the same rule the parking defaults follow. "Warn me fifteen minutes before" is right for
 * a municipality selling half hours and wrong for one selling eight-hour stays, and that is a line of
 * YAML, not a redeploy.</p>
 *
 * @param sessionExpiringBeforeMinutes how long before a stay runs out the citizen hears about it
 * @param sessionExpiredWithinMinutes  how far back the job still calls a lapsed stay news. Bounded so
 *                                     that a backend down all weekend does not come up and tell
 *                                     everybody about Friday.
 * @param timeCreditsExpiringBeforeDays how long before saved minutes lapse the citizen hears about it
 * @param relayBatchSize               rows the email relay takes per pass
 * @param relayMaxAttempts             tries before a queued email is given up on and marked failed
 * @param relayBackoffCeilingMinutes   longest gap between retries; the doubling stops here
 */
@ConfigurationProperties(prefix = "luparx.notifications")
public record NotificationProperties(
        Integer sessionExpiringBeforeMinutes,
        Integer sessionExpiredWithinMinutes,
        Integer timeCreditsExpiringBeforeDays,
        Integer relayBatchSize,
        Integer relayMaxAttempts,
        Integer relayBackoffCeilingMinutes) {

    /* Wrapper types, as everywhere else in this package: an absent property binds to null rather
     * than to 0, so "not configured" and "configured to zero" stay distinguishable. */

    public int sessionExpiringBeforeOrDefault() {
        return sessionExpiringBeforeMinutes == null || sessionExpiringBeforeMinutes.intValue() <= 0
                ? 15
                : sessionExpiringBeforeMinutes.intValue();
    }

    public int sessionExpiredWithinOrDefault() {
        return sessionExpiredWithinMinutes == null || sessionExpiredWithinMinutes.intValue() <= 0
                ? 120
                : sessionExpiredWithinMinutes.intValue();
    }

    public int timeCreditsExpiringBeforeOrDefault() {
        return timeCreditsExpiringBeforeDays == null || timeCreditsExpiringBeforeDays.intValue() <= 0
                ? 3
                : timeCreditsExpiringBeforeDays.intValue();
    }

    public int relayBatchSizeOrDefault() {
        return relayBatchSize == null || relayBatchSize.intValue() <= 0 ? 50 : relayBatchSize.intValue();
    }

    public int relayMaxAttemptsOrDefault() {
        return relayMaxAttempts == null || relayMaxAttempts.intValue() <= 0 ? 8 : relayMaxAttempts.intValue();
    }

    public int relayBackoffCeilingOrDefault() {
        return relayBackoffCeilingMinutes == null || relayBackoffCeilingMinutes.intValue() <= 0
                ? 60
                : relayBackoffCeilingMinutes.intValue();
    }
}
