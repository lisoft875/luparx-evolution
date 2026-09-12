package cr.luparx.parking.model;

/**
 * Platform-wide defaults used when a municipality has not configured its own parking policy yet.
 *
 * <p>A framework-free value object, filled by the application module from
 * {@code platform.defaults.parking.*}. It exists so that "what a brand-new municipality offers" is a
 * line of YAML rather than a constant in a service: CONTRACT.md v0.2 says the increments and the
 * caps are the municipality's decision, and a default that lives in Java is a decision the
 * municipality cannot make.</p>
 *
 * @param sessionIncrementsMinutes   options offered when starting
 * @param sessionMinMinutes          shortest session accepted
 * @param sessionMaxMinutes          longest session accepted
 * @param extensionEnabled           whether a running session may be extended
 * @param extensionIncrementsMinutes options offered when extending
 * @param extensionMaxTotalMinutes   cap on session + extensions
 * @param earlyFinishEnabled         whether a citizen may close a session before it expires
 * @param creditOnEarlyFinishEnabled whether the remaining minutes come back as credit
 * @param creditMinRemainingMinutes  minimum remaining minutes for a credit to be granted
 * @param creditExpiryDays           days a credited minute stays usable; 0 means never expires
 * @param graceMinutes               tolerance before a session counts as expired
 * @param freeMinutes                minutes of courtesy at the start of a stay; 0 means none, which
 *                                   is what every municipality had before v0.31
 * @param overlappingStaysEnabled    whether a bay may hold more than one running stay at a time
 */
public record ParkingPolicyDefaults(
        MinuteIncrements sessionIncrementsMinutes,
        int sessionMinMinutes,
        int sessionMaxMinutes,
        boolean extensionEnabled,
        MinuteIncrements extensionIncrementsMinutes,
        int extensionMaxTotalMinutes,
        boolean earlyFinishEnabled,
        boolean creditOnEarlyFinishEnabled,
        int creditMinRemainingMinutes,
        int creditExpiryDays,
        int graceMinutes,
        int freeMinutes,
        boolean overlappingStaysEnabled) {

    public ParkingPolicyDefaults {
        if (sessionIncrementsMinutes == null || sessionIncrementsMinutes.isEmpty()) {
            throw new IllegalArgumentException("at least one session increment must be configured");
        }
        if (extensionIncrementsMinutes == null) {
            extensionIncrementsMinutes = MinuteIncrements.empty();
        }
        if (sessionMinMinutes <= 0 || sessionMaxMinutes < sessionMinMinutes) {
            throw new IllegalArgumentException("session bounds must satisfy 0 < min <= max");
        }
        if (extensionMaxTotalMinutes < sessionMaxMinutes) {
            throw new IllegalArgumentException("extension cap must not be below the session maximum");
        }
        if (creditMinRemainingMinutes < 0 || creditExpiryDays < 0 || graceMinutes < 0 || freeMinutes < 0) {
            throw new IllegalArgumentException("credit, grace and courtesy settings must not be negative");
        }
        if (freeMinutes > sessionMaxMinutes) {
            // Courtesy longer than the longest stay the municipality sells would make every stay free.
            throw new IllegalArgumentException("courtesy minutes must not exceed the session maximum");
        }
    }
}
