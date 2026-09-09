package cr.luparx.enforcement.port;

import cr.luparx.core.id.TenantId;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * What enforcement needs to know from the parking domain, and nothing else.
 *
 * <p>This module does not depend on {@code module-parking}. It depends on this interface, and the
 * application wires an adapter that happens to call the parking services today. The reason is not
 * ceremony: a citation outlives by years the session it may or may not relate to, has its own legal
 * cycle, and is the part of the platform most likely to be extracted into its own service. When that
 * day comes, this port is the seam — the adapter becomes an HTTP client and nothing inside this
 * module changes. A direct call into {@code ParkingSessionService} would instead have to be found
 * and rewritten in every service that made one.</p>
 *
 * <p>It is deliberately a read-only, question-shaped interface. Enforcement never starts, extends or
 * closes a parking session: doing that from a citation would be one domain quietly writing another's
 * state, which is how a modular monolith turns into a ball of mud.</p>
 */
public interface ParkingStatusPort {

    /**
     * Every parking session running right now, in this municipality, for this normalised plate.
     *
     * <p>A list, not an optional, and that is the whole point — see {@code PlateVerdict} for why
     * more than one match is a legitimate state of the world and what the caller must do about it.
     * Sessions that have run past the municipality's tolerance are not returned: the parking domain
     * decides what "still running" means, not this module.</p>
     */
    List<ActiveStay> activeStays(TenantId tenantId, String plateNormalized);

    /** The bay the inspector is standing at, resolved from the code painted on it. */
    Optional<Bay> findBay(TenantId tenantId, UUID zoneId, String spaceCode);

    /** The bay a citation refers to, when the device sent its identifier rather than its code. */
    Optional<Bay> findBayById(TenantId tenantId, UUID spaceId);

    /**
     * The single registered vehicle carrying this plate, if there is exactly one on the platform.
     *
     * <p>Empty when nobody registered it (the ordinary case for a car that never used the app) and
     * <b>also</b> when several people did. Refusing to choose is deliberate: linking a citation to
     * the wrong person is worse than leaving it linked to nobody, and the plate on the citation is
     * enough to identify the vehicle in the register the municipality actually enforces against.</p>
     */
    Optional<RegisteredVehicle> findUniqueVehicleByPlate(String plateNormalized);

    /** A parking session as enforcement sees it: where it is, until when, and nothing personal. */
    record ActiveStay(UUID sessionId, UUID zoneId, String zoneCode, String zoneName, UUID spaceId,
                      String spaceCode, Instant startedAt, Instant expiresAt) {
    }

    /** A numbered bay and the zone it belongs to. */
    record Bay(UUID spaceId, String code, UUID zoneId, String zoneCode, String zoneName) {
    }

    /**
     * A vehicle in the register, as a reference. The owner travels as an identifier only: a citation
     * stores the plate, never a copy of the citizen's data (CONTRACT.md v0.6, "Datos personales").
     */
    record RegisteredVehicle(UUID vehicleId, UUID ownerUserId, String plateNormalized) {
    }
}
