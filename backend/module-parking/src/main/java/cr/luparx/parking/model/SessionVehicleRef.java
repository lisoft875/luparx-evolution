package cr.luparx.parking.model;

import java.util.UUID;

/**
 * Which car a stay is being opened for: one the citizen registered, or a plate they typed on the
 * spot because they are parking for somebody else (CONTRACT.md v0.11).
 *
 * <p>The two cases are one type rather than two overloads of {@code start(...)} because every
 * caller has to answer the question, and a signature with a nullable {@code vehicleId} beside a
 * nullable {@code plate} invites the two states nobody wants: both given, or neither. Here they are
 * unrepresentable — {@link #registered} and {@link #guest} are the only ways in, and
 * {@link #isGuest()} is the only question the service asks.</p>
 *
 * <p>The typed plate arrives raw, exactly as the person wrote it. Normalising is deliberately not
 * done here: {@link PlateNormalizer} is the one place that decides what a plate looks like stored,
 * and a value object that quietly rewrote its input would make the service's validation error
 * ("this is not a plate") impossible to produce.</p>
 */
public record SessionVehicleRef(UUID vehicleId, String plate, VehicleType vehicleType) {

    /** A vehicle in the citizen's own list. The plate and type come from that record, not the wire. */
    public static SessionVehicleRef registered(UUID vehicleId) {
        if (vehicleId == null) {
            throw new IllegalArgumentException("a registered reference needs a vehicle id");
        }
        return new SessionVehicleRef(vehicleId, null, null);
    }

    /**
     * Somebody else's car: a plate as typed, and what kind of vehicle it is.
     *
     * <p>Nothing is saved to the citizen's vehicle list — that was the product decision, and it is
     * the whole point: lending a friend a stay must not leave their plate in your garage for ever.
     * The plate lives on the session row, which is exactly as long as it is needed for: the
     * inspector's lookup, the receipt, and a fine if one is written.</p>
     */
    public static SessionVehicleRef guest(String plate, VehicleType vehicleType) {
        return new SessionVehicleRef(null, plate, vehicleType == null ? VehicleType.DEFAULT : vehicleType);
    }

    public boolean isGuest() {
        return vehicleId == null;
    }
}
