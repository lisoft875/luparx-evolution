package cr.luparx.core.i18n;

import java.time.ZoneId;
import java.time.DateTimeException;
import java.util.Optional;

/**
 * IANA time-zone helpers. Timestamps are always stored in UTC and converted for presentation using
 * the user's or the tenant's configured zone (CONTRACT.md §7).
 */
public final class TimeZones {

    private TimeZones() {
    }

    public static Optional<ZoneId> parse(String zoneId) {
        if (zoneId == null || zoneId.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(ZoneId.of(zoneId.trim()));
        } catch (DateTimeException exception) {
            // ZoneRulesException (unknown region) is a DateTimeException, so one catch covers both
            // "not a zone id at all" and "syntactically valid but unknown".
            return Optional.empty();
        }
    }

    /** Deterministic resolution order: explicit value, then tenant default, then platform default, then UTC. */
    public static ZoneId resolve(String preferred, String tenantDefault, String platformDefault) {
        return parse(preferred)
                .or(() -> parse(tenantDefault))
                .or(() -> parse(platformDefault))
                .orElse(ZoneId.of("UTC"));
    }

    public static boolean isValid(String zoneId) {
        return parse(zoneId).isPresent();
    }
}
