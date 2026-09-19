package cr.luparx.enforcement.service;

import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.enforcement.model.PlateStatus;
import cr.luparx.enforcement.model.PlateVerdict;
import cr.luparx.enforcement.port.ParkingStatusPort;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Two stays, one bay, nobody fined (v0.37, ADR 0020).
 *
 * <p>Since {@code parking_policies.overlapping_stays_enabled} a bay may hold more than one running
 * stay: somebody pays for two hours, leaves after fifteen minutes without finishing, and the next
 * citizen pays for the space they are actually standing in. The whole change rests on a claim about
 * <em>this</em> service — that a stay does not make its holder the owner of the bay, so the second
 * stay does not have to displace the first for either driver to be covered. If that claim is wrong,
 * allowing the overlap stops being generous and starts producing citations against people who paid.
 * These tests are that claim, written down.</p>
 */
class PlateStatusServiceOverlappingStaysTest {

    private static final Instant NOW = Instant.parse("2026-09-10T15:20:00Z");

    /** The one who paid for two hours at 15:00 and walked away at 15:15 without finishing. */
    private static final String PLATE_LEFT_EARLY = "SJP123";
    /** The one who arrived at 15:20, found the space empty, and paid for it. */
    private static final String PLATE_PARKED_NOW = "BHL019";
    /** Nobody's stay. The car that simply did not pay. */
    private static final String PLATE_NEVER_PAID = "CRC777";

    private final TenantId tenantId = TenantId.generate();
    private final UUID zoneId = Uuid7.generate();
    private final UUID spaceId = Uuid7.generate();
    private final ParkingStatusPort.Bay bay =
            new ParkingStatusPort.Bay(spaceId, "LUP-0007", zoneId, "CEN", "Centro");

    private final StubParkingStatus parkingStatus = new StubParkingStatus(bay);
    private final PlateExemptionService exemptions = mock(PlateExemptionService.class);
    private final PlateStatusService service =
            new PlateStatusService(parkingStatus, exemptions, Clock.fixed(NOW, ZoneOffset.UTC));

    private final ParkingStatusPort.ActiveStay stayLeftEarly = stayOn(spaceId, NOW.plusSeconds(105 * 60L));
    private final ParkingStatusPort.ActiveStay stayParkedNow = stayOn(spaceId, NOW.plusSeconds(45 * 60L));

    PlateStatusServiceOverlappingStaysTest() {
        when(exemptions.inForce(any(), anyString())).thenReturn(Optional.empty());
        parkingStatus.put(PLATE_LEFT_EARLY, stayLeftEarly);
        parkingStatus.put(PLATE_PARKED_NOW, stayParkedNow);
    }

    @Test
    void bothPlatesReadCoveredOnTheSharedBay() {
        PlateStatus left = service.lookup(tenantId, PLATE_LEFT_EARLY, zoneId, "LUP-0007");
        PlateStatus parked = service.lookup(tenantId, PLATE_PARKED_NOW, zoneId, "LUP-0007");

        // Neither stay shadows the other: each plate is answered with its OWN stay, which is the
        // difference between "this bay is paid for" (which nobody ever asked) and "this plate paid
        // for this bay" (which is the question an officer is standing there with).
        assertThat(left.verdict()).isEqualTo(PlateVerdict.COVERED);
        assertThat(left.coveringStay()).isEqualTo(stayLeftEarly);
        assertThat(parked.verdict()).isEqualTo(PlateVerdict.COVERED);
        assertThat(parked.coveringStay()).isEqualTo(stayParkedNow);
    }

    @Test
    void theSecondStayDoesNotLeakIntoTheFirstPlatesOtherStays() {
        PlateStatus parked = service.lookup(tenantId, PLATE_PARKED_NOW, zoneId, "LUP-0007");

        // `otherStays` is where the screen tells the officer "this plate paid, but over there".
        // Somebody else's stay on this same bay is not this plate's business and putting it here
        // would show the officer a stay that has nothing to do with the car in front of them.
        assertThat(parked.otherStays()).isEmpty();
    }

    @Test
    void aPlateWithNoStayIsStillNotCoveredByTheOverlap() {
        PlateStatus never = service.lookup(tenantId, PLATE_NEVER_PAID, zoneId, "LUP-0007");

        // The expensive failure mode this module names in PlateVerdict: one citizen's payment
        // excusing another citizen's infraction. Two paid stays on this bay must not add up to
        // "the bay is fine", or the overlap would quietly stop enforcement working on it.
        assertThat(never.verdict()).isEqualTo(PlateVerdict.NOT_COVERED);
        assertThat(never.coveringStay()).isNull();
    }

    @Test
    void withoutABayTheAnswerIsStillAmbiguous() {
        PlateStatus left = service.lookup(tenantId, PLATE_LEFT_EARLY, null, null);

        // Unchanged by v0.37 and worth pinning: overlapping stays make the bay MORE load-bearing as
        // the discriminator, not less, so a lookup without one must keep refusing to commit.
        assertThat(left.verdict()).isEqualTo(PlateVerdict.AMBIGUOUS);
        assertThat(left.requiresBay()).isTrue();
    }

    private ParkingStatusPort.ActiveStay stayOn(UUID space, Instant expiresAt) {
        return new ParkingStatusPort.ActiveStay(Uuid7.generate(), zoneId, "CEN", "Centro", space,
                "LUP-0007", NOW.minusSeconds(300L), expiresAt, "PAID", null, 1_000L, "CRC",
                Uuid7.generate());
    }

    /**
     * The parking domain as this module is allowed to see it: a plate in, its stays out.
     *
     * <p>Hand-written rather than mocked because the point of the test is the shape of the port —
     * {@code activeStays} answers per PLATE and never per bay, which is exactly why two stays can
     * share one bay without either one answering for the other.</p>
     */
    private static final class StubParkingStatus implements ParkingStatusPort {

        private final Bay bay;
        private final Map<String, List<ActiveStay>> byPlate = new HashMap<>();

        private StubParkingStatus(Bay bay) {
            this.bay = bay;
        }

        private void put(String plate, ActiveStay stay) {
            byPlate.put(plate, List.of(stay));
        }

        @Override
        public List<ActiveStay> activeStays(TenantId tenantId, String plateNormalized) {
            return byPlate.getOrDefault(plateNormalized, List.of());
        }

        @Override
        public List<ActiveStay> recentlyExpiredStays(TenantId tenantId, String plateNormalized, Instant since) {
            return List.of();
        }

        @Override
        public int graceMinutes(TenantId tenantId) {
            return 5;
        }

        @Override
        public Optional<Bay> findBay(TenantId tenantId, UUID zoneId, String spaceCode) {
            return bay.code().equals(spaceCode) ? Optional.of(bay) : Optional.empty();
        }

        @Override
        public Optional<Bay> findBayById(TenantId tenantId, UUID spaceId) {
            return bay.spaceId().equals(spaceId) ? Optional.of(bay) : Optional.empty();
        }

        @Override
        public Optional<Zone> findZoneByCode(TenantId tenantId, String zoneCode) {
            return Optional.empty();
        }

        @Override
        public Optional<RegisteredVehicle> findUniqueVehicleByPlate(String plateNormalized) {
            return Optional.empty();
        }

        // Esta prueba es sobre solapes de estadías y no sobre a quién pertenece un vehículo: sin
        // registro, que es el caso de la mayoría de las placas.
        @Override
        public List<RegisteredVehicle> findVehiclesByPlate(String plateNormalized) {
            return List.of();
        }

        @Override
        public Optional<RegisteredVehicle> findVehicleWithStayAt(TenantId tenantId, String plateNormalized,
                                                                 Instant moment) {
            return Optional.empty();
        }
    }
}
