package cr.luparx.parking.model;

import cr.luparx.parking.entity.ParkingPolicy;
import cr.luparx.parking.entity.ParkingZonePolicy;

/**
 * The parking rules that actually apply in one zone: the municipality's, with the zone's departures
 * folded in (CONTRACT.md v0.31).
 *
 * <p>Resolution happens <b>once, here</b>, and everything downstream reads a plain number. The
 * alternative — every caller reaching for the zone row and falling back to the municipality's — is
 * the same three-line conditional written in six places, and the day one of them forgets the fallback
 * a zone silently gets a maximum stay of zero.</p>
 *
 * <p>The fields that a zone cannot depart from are carried here too, straight from the municipality,
 * so that a caller with a {@code ZoneRules} never needs the policy row as well. Whether they are
 * overridable is a decision recorded in {@link ParkingZonePolicy}; whether they are <em>readable</em>
 * from here is just convenience.</p>
 *
 * @param zoneId                  the zone these resolved to, or null for the municipality's own
 * @param sessionIncrements       durations offered when starting
 * @param sessionMinMinutes       shortest stay sold
 * @param sessionMaxMinutes       longest a car may hold a bay — the rotation lever
 * @param extensionEnabled        municipal; a zone cannot depart
 * @param extensionIncrements     durations offered when extending
 * @param extensionMaxTotalMinutes ceiling on start plus every extension
 * @param earlyFinishEnabled      municipal; a zone cannot depart
 * @param creditOnEarlyFinishEnabled municipal; a zone cannot depart
 * @param creditMinRemainingMinutes municipal; a zone cannot depart
 * @param creditExpiryDays        municipal; a zone cannot depart
 * @param graceMinutes            the officer's tolerance; municipal
 * @param freeMinutes             courtesy at the start of a stay; 0 means no courtesy
 */
public record ZoneRules(java.util.UUID zoneId,
                        MinuteIncrements sessionIncrements,
                        int sessionMinMinutes,
                        int sessionMaxMinutes,
                        boolean extensionEnabled,
                        MinuteIncrements extensionIncrements,
                        int extensionMaxTotalMinutes,
                        boolean earlyFinishEnabled,
                        boolean creditOnEarlyFinishEnabled,
                        int creditMinRemainingMinutes,
                        int creditExpiryDays,
                        int graceMinutes,
                        int freeMinutes) {

    /** The municipality's rules, with nothing overridden. */
    public static ZoneRules of(ParkingPolicy policy) {
        return of(policy, null, null);
    }

    /**
     * The rules of one zone.
     *
     * @param override the zone's departures, or null when it has none — which is the normal case and
     *                 not a missing row to be created
     */
    public static ZoneRules of(ParkingPolicy policy, java.util.UUID zoneId, ParkingZonePolicy override) {
        MinuteIncrements sessionIncrements = policy.sessionIncrements();
        MinuteIncrements extensionIncrements = policy.extensionIncrements();
        int sessionMin = policy.getSessionMinMinutes();
        int sessionMax = policy.getSessionMaxMinutes();
        int extensionMaxTotal = policy.getExtensionMaxTotalMinutes();
        int freeMinutes = policy.getFreeMinutes();

        if (override != null) {
            if (override.sessionIncrements() != null) {
                sessionIncrements = override.sessionIncrements();
            }
            if (override.extensionIncrements() != null) {
                extensionIncrements = override.extensionIncrements();
            }
            if (override.getSessionMinMinutes() != null) {
                sessionMin = override.getSessionMinMinutes().intValue();
            }
            if (override.getSessionMaxMinutes() != null) {
                sessionMax = override.getSessionMaxMinutes().intValue();
            }
            if (override.getExtensionMaxTotalMinutes() != null) {
                extensionMaxTotal = override.getExtensionMaxTotalMinutes().intValue();
            }
            if (override.getFreeMinutes() != null) {
                freeMinutes = override.getFreeMinutes().intValue();
            }
        }
        // A zone that lowered its maximum below the municipality's extension ceiling would otherwise
        // let an extension carry a car past the maximum the zone itself set — which is the one number
        // the zone departed in order to enforce. The ceiling follows the maximum down, never up.
        extensionMaxTotal = Math.max(sessionMax, extensionMaxTotal);

        return new ZoneRules(zoneId, sessionIncrements, sessionMin, sessionMax, policy.isExtensionEnabled(),
                extensionIncrements, extensionMaxTotal, policy.isEarlyFinishEnabled(),
                policy.isCreditOnEarlyFinishEnabled(), policy.getCreditMinRemainingMinutes(),
                policy.getCreditExpiryDays(), policy.getGraceMinutes(), freeMinutes);
    }

    /** Whether a stay of this length is short enough to be given away, when the zone gives any away. */
    public boolean isCourtesyLength(int minutes) {
        return freeMinutes > 0 && minutes > 0 && minutes <= freeMinutes;
    }
}
