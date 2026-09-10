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

    /**
     * Sessions for this plate that <b>ran out</b> recently, newest first.
     *
     * <p>What makes "pagó y se le venció hace doce minutos" sayable at all. Until v0.28 such a stay
     * simply vanished from the answer and the plate read as {@code NOT_COVERED}, so the officer could
     * not tell it apart from a car that never paid — a distinction that is often a different
     * infraction and is always a different conversation with the driver.</p>
     *
     * <p>Only sessions the clock ended. A stay the citizen closed early is not "expired": they said
     * they were leaving, and reporting that as a lapsed payment would put words in their mouth.</p>
     *
     * <p>Bounded by {@code since} because this is a question about the recent past, not a history:
     * an unbounded lookback would eventually scan a table that grows with every stay ever paid.</p>
     */
    List<ActiveStay> recentlyExpiredStays(TenantId tenantId, String plateNormalized, Instant since);

    /**
     * The municipality's tolerance, in minutes, after a session's clock runs out.
     *
     * <p>The parking domain already applies it — a stay inside the tolerance is still returned by
     * {@link #activeStays} — and this exposes the number so the answer can <em>explain</em> itself.
     * Without it the officer reads "vigente" beside an expiry time that has already passed and has
     * no way to know that is correct.</p>
     */
    int graceMinutes(TenantId tenantId);

    /** The bay the inspector is standing at, resolved from the code painted on it. */
    Optional<Bay> findBay(TenantId tenantId, UUID zoneId, String spaceCode);

    /** The bay a citation refers to, when the device sent its identifier rather than its code. */
    Optional<Bay> findBayById(TenantId tenantId, UUID spaceId);

    /**
     * The zone a mirrored citation names, resolved from its code (CONTRACT.md v0.34).
     *
     * <p>Another system knows its own sectors by whatever it calls them, not by our identifiers. When
     * the code happens to be one of ours the citation lands in the right zone and the municipality's
     * reports add it up with everything else; when it does not, the citation is still complete — the
     * place is written in its address and its own text — and it simply belongs to no zone of ours.</p>
     *
     * <p>Empty is an ordinary answer here and never an error. Refusing a citation because its sector
     * is unknown would be refusing an act that already happened.</p>
     */
    Optional<Zone> findZoneByCode(TenantId tenantId, String zoneCode);

    /**
     * The single registered vehicle carrying this plate, if there is exactly one on the platform.
     *
     * <p>Empty when nobody registered it (the ordinary case for a car that never used the app) and
     * <b>also</b> when several people did. Refusing to choose is deliberate: linking a citation to
     * the wrong person is worse than leaving it linked to nobody, and the plate on the citation is
     * enough to identify the vehicle in the register the municipality actually enforces against.</p>
     */
    Optional<RegisteredVehicle> findUniqueVehicleByPlate(String plateNormalized);

    /**
     * A parking session as enforcement sees it: where it is, until when, what was paid, and nothing
     * personal.
     *
     * <p>Since v0.32 it carries the <b>payment</b>, which is the point of the whole port: the officer
     * reads whether the stay was paid from the same row that produced the payment, instead of
     * inferring it from the fact that a stay exists. A stay can exist and have cost nothing —
     * courtesy, the citizen's own saved minutes, an hour this municipality does not charge for — and
     * an officer who cannot tell those apart from a payment has nothing to say to the person arguing
     * with them.</p>
     *
     * <p>The two enumerations travel as <b>strings</b> and not as types. This module does not depend
     * on {@code module-parking}, and importing its enums here to save a cast would be exactly the
     * dependency the port exists to avoid — the day this becomes an HTTP client, a string is what
     * comes over the wire anyway.</p>
     *
     * @param paymentStatus       {@code PAID}, {@code NO_CHARGE}, {@code PENDING} or {@code FAILED}
     * @param noChargeReason      {@code COURTESY}, {@code CREDIT} or {@code OUTSIDE_HOURS}; null
     *                            unless nothing was charged, and null too on rows written before
     *                            V31_0 where the reason could not be reconstructed
     * @param amountMinor         what the stay cost, in minor units of {@code currencyCode}
     * @param paymentTransactionId the wallet movement that settled it, so a complaint at the bay can
     *                            be traced to the money without leaving the street
     */
    record ActiveStay(UUID sessionId, UUID zoneId, String zoneCode, String zoneName, UUID spaceId,
                      String spaceCode, Instant startedAt, Instant expiresAt,
                      String paymentStatus, String noChargeReason, long amountMinor, String currencyCode,
                      UUID paymentTransactionId) {
    }

    /** A numbered bay and the zone it belongs to. */
    /** A sector of the municipality, as much of it as enforcement has any business knowing. */
    record Zone(UUID zoneId, String code, String name) {
    }

    record Bay(UUID spaceId, String code, UUID zoneId, String zoneCode, String zoneName) {
    }

    /**
     * A vehicle in the register, as a reference. The owner travels as an identifier only: a citation
     * stores the plate, never a copy of the citizen's data (CONTRACT.md v0.6, "Datos personales").
     */
    record RegisteredVehicle(UUID vehicleId, UUID ownerUserId, String plateNormalized) {
    }
}
