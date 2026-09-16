package cr.luparx.app.config;

import cr.luparx.app.config.DevDataSeeder.DemoCitizen;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.money.Money;
import cr.luparx.parking.entity.ParkingRate;
import cr.luparx.parking.model.ZonePriceBook;
import cr.luparx.parking.entity.ParkingSpace;
import cr.luparx.parking.entity.ParkingZone;
import cr.luparx.parking.entity.Vehicle;
import cr.luparx.parking.model.ParkingSessionStatus;
import cr.luparx.parking.model.TimeCreditSource;
import cr.luparx.parking.model.VehicleColor;
import cr.luparx.parking.model.VehicleType;
import cr.luparx.parking.repository.ParkingRateRepository;
import cr.luparx.parking.repository.ParkingSessionRepository;
import cr.luparx.parking.repository.ParkingSpaceRepository;
import cr.luparx.parking.repository.ParkingZoneRepository;
import cr.luparx.parking.service.ParkingPolicyService;
import cr.luparx.parking.service.TimeCreditService;
import cr.luparx.parking.service.VehicleService;
import cr.luparx.parking.service.WalletService;
import cr.luparx.tenancy.entity.Tenant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Gives the seeded citizens a past: vehicles, parking sessions that already happened, a wallet with
 * movements behind its balance, and minutes already to their favour.
 *
 * <h2>Why history and not empty rows</h2>
 *
 * <p>A fixture of empty tables makes every screen look correct. A list with nothing in it renders
 * the same whether the query is right or wrong; a balance of zero hides a currency mismatch; a
 * receipt with no movements behind it never reveals that the ledger and the account disagree. The
 * rows below exist so that the citizen app, the inspector app and the admin reports have something
 * that can actually be <em>wrong</em>.</p>
 *
 * <p><b>Plates repeat across citizens on purpose.</b> Two people registering the same plate is a
 * legitimate and expected case — a shared family car, a company car, a plate reused after a transfer
 * — and the uniqueness rule is {@code (user_id, plate_normalized)}, never the plate alone
 * (CONTRACT.md v0.2, rule 2). The fixture makes that real so an inspector lookup by plate returns
 * more than one match in development, which is exactly the ambiguity the product still has to
 * resolve.</p>
 *
 * <h2>Why the ledger is written directly</h2>
 *
 * <p>Everything else in this fixture goes through the real services, and for good reason. History
 * cannot: {@code ParkingSessionService} charges against the clock of the moment it runs, so a session
 * that ended last Tuesday is not something it can be asked for, and a municipality whose charging
 * hours are closed right now would refuse to open one at all. So the past is written with SQL — in
 * one transaction, with the wallet arithmetic carried explicitly so that every
 * {@code balance_after_minor} is the running total and the account's balance is the last one. A
 * ledger that does not add up would be worse than no ledger.</p>
 *
 * <p>The opening top-up and the minute credits <em>do</em> go through {@link WalletService} and
 * {@link TimeCreditService}, because those have no reason to be backdated.</p>
 *
 * <p>Idempotent by citizen and municipality: a citizen who already has a session in a municipality is
 * left alone, so a restart neither duplicates history nor quietly refills a wallet a developer spent.</p>
 */
@Component
// `demo` es el mismo sembrado en una instancia publicada, pero sin las concesiones de `dev`
// (llaves efímeras, pepper del repositorio, SQL en el log). Ver application-demo.yml.
@Profile({"dev", "demo"})
@ConditionalOnProperty(prefix = "luparx.dev", name = "seed-demo-data", havingValue = "true", matchIfMissing = true)
public class DevActivitySeeder {

    private static final Logger LOGGER = LoggerFactory.getLogger(DevActivitySeeder.class);

    /**
     * The vehicles each citizen registers, by email.
     *
     * <p>{@code SJP123} appears twice, under two different people. See the class comment: that is the
     * case the platform must support, not a mistake.</p>
     */
    private static final Map<String, List<VehicleSeed>> VEHICLES = Map.of(
            "ana.morales@luparx.test", List.of(
                    new VehicleSeed("BCT456", "El carro de la casa", "Toyota", "Yaris", 2019,
                            VehicleType.CAR, VehicleColor.GRAY, true),
                    // A motorcycle on purpose: the type that stops being cosmetic the day a
                    // municipality prices it differently.
                    new VehicleSeed("SJP123", "La moto", "Honda", "CB125", 2022,
                            VehicleType.MOTORCYCLE, VehicleColor.RED, false)),
            "bruno.castro@luparx.test", List.of(
                    // Same plate as Ana's second vehicle, on purpose: uniqueness is per user. A
                    // different make, colour and type under the same plate is also what makes an
                    // inspector's lookup ambiguous in development, which is the point.
                    new VehicleSeed("SJP123", "Mi carro", "Toyota", "Hilux", 2021,
                            VehicleType.CAR, VehicleColor.WHITE, true)),
            "carla.jimenez@luparx.test", List.of(
                    new VehicleSeed("CTG789", "El de mamá", "Nissan", "March", 2015,
                            VehicleType.CAR, VehicleColor.SILVER, true)));

    /** Minutes a past session ran for. Two closed stays per municipality, of different lengths. */
    private static final int[] PAST_SESSION_MINUTES = {60, 120};

    /** How many days ago each of those started. Recent enough to be inside any sensible report. */
    private static final int[] PAST_SESSION_DAYS_AGO = {6, 2};

    /** Minutes still to the favour of the citizen who finished a stay early, in their first municipality. */
    private static final int SEEDED_CREDIT_MINUTES = 45;

    /** How long a seeded credit lot stays usable. Long enough that a developer never finds it expired. */
    private static final int SEEDED_CREDIT_EXPIRY_DAYS = 90;

    /** Minutes a running session was opened for, and how long ago it started. */
    private static final int ACTIVE_SESSION_MINUTES = 120;
    private static final int ACTIVE_SESSION_STARTED_MINUTES_AGO = 25;

    /**
     * {@code payment_status} and {@code no_charge_reason} are here because V31_0 made the first one
     * NOT NULL, and this seeder was not updated with it: every history insert failed on the
     * constraint and was swallowed by the per-municipality try/catch, so the demo data silently came
     * up with citizens who had no movements at all. The symptom on screen — a wallet with balance and
     * an empty "recent activity" — looked like a UI bug for as long as nobody read the log.
     *
     * <p>They are two columns and not one because the database says so: {@code PAID} requires a
     * positive amount, and only {@code NO_CHARGE} may carry a reason (see the CHECKs in V31_0). A
     * seeder that wrote {@code PAID} on everything would have produced rows the domain can never
     * produce, which is worse than failing — it is a fixture that teaches the wrong shape.</p>
     */
    private static final String INSERT_SESSION_SQL = """
            INSERT INTO parking_sessions (id, tenant_id, user_id, vehicle_id, plate_snapshot, zone_id, space_id,
                                          started_at, expires_at, ended_at, status, amount_minor, currency_code,
                                          payment_status, no_charge_reason,
                                          credit_minutes_applied, created_at, updated_at, version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0)
            """;

    private static final String INSERT_TRANSACTION_SQL = """
            INSERT INTO wallet_transactions (id, tenant_id, account_id, user_id, type, amount_minor,
                                             currency_code, balance_after_minor, session_id, idempotency_key,
                                             created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """;

    private static final String UPDATE_BALANCE_SQL =
            "UPDATE wallet_accounts SET balance_minor = ?, updated_at = ? WHERE id = ?";

    private final VehicleService vehicleService;
    private final WalletService walletService;
    private final TimeCreditService timeCreditService;
    private final ParkingPolicyService policyService;
    private final ParkingZoneRepository zoneRepository;
    private final ParkingRateRepository rateRepository;
    private final ParkingSpaceRepository spaceRepository;
    private final ParkingSessionRepository sessionRepository;
    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactionTemplate;
    private final Clock clock;

    public DevActivitySeeder(VehicleService vehicleService,
                             WalletService walletService,
                             TimeCreditService timeCreditService,
                             ParkingPolicyService policyService,
                             ParkingZoneRepository zoneRepository,
                             ParkingRateRepository rateRepository,
                             ParkingSpaceRepository spaceRepository,
                             ParkingSessionRepository sessionRepository,
                             JdbcTemplate jdbcTemplate,
                             PlatformTransactionManager transactionManager,
                             Clock clock) {
        this.vehicleService = vehicleService;
        this.walletService = walletService;
        this.timeCreditService = timeCreditService;
        this.policyService = policyService;
        this.zoneRepository = zoneRepository;
        this.rateRepository = rateRepository;
        this.spaceRepository = spaceRepository;
        this.sessionRepository = sessionRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.clock = clock;
    }

    /**
     * @param tenants  every seeded municipality, by slug
     * @param citizens the user id of each seeded citizen, by email
     * @param profiles the citizens as declared, in order, with their opening balances
     */
    public void seed(Map<String, Tenant> tenants, Map<String, UserId> citizens, List<DemoCitizen> profiles) {
        int failures = 0;
        for (DemoCitizen profile : profiles) {
            UserId userId = citizens.get(profile.email());
            if (userId == null) {
                continue;
            }
            List<Vehicle> vehicles = ensureVehicles(userId, profile.email());
            if (vehicles.isEmpty()) {
                LOGGER.warn("Development seed: {} has no vehicle; history skipped.", profile.email());
                continue;
            }
            boolean firstMunicipality = true;
            for (Map.Entry<String, Long> entry : profile.openingBalances().entrySet()) {
                Tenant tenant = tenants.get(entry.getKey());
                if (tenant == null) {
                    continue;
                }
                try {
                    seedForMunicipality(tenant, userId, profile, vehicles, entry.getValue().longValue(),
                            firstMunicipality);
                } catch (RuntimeException exception) {
                    // Un WARN por municipalidad no alcanzó. Cuando la V31_0 añadió una columna
                    // obligatoria que este sembrador no conocía, esto falló CINCO veces seguidas y el
                    // resultado fue un fixture sin una sola estadía: en pantalla, billeteras con saldo
                    // y «actividad reciente» vacía, que se lee como un error de interfaz. El log lo
                    // decía, pero entre cien líneas de arranque y con nivel WARN nadie lo leyó.
                    //
                    // Se registra con ERROR y la traza completa —la causa real venía anidada en el
                    // toString()— y se cuenta, para poder decir al final que el sembrado quedó
                    // incompleto en vez de terminar anunciando cuentas listas que no lo están.
                    failures++;
                    LOGGER.error("Development seed: history for {} in {} FAILED. The fixture is "
                            + "incomplete: this citizen will have a balance and no movements.",
                            profile.email(), entry.getKey(), exception);
                }
                firstMunicipality = false;
            }
        }
        if (failures > 0) {
            LOGGER.error("Development seed: {} history block(s) failed. The demo data is INCOMPLETE — "
                    + "citizens may show a balance with no movements. Read the errors above before "
                    + "showing this instance to anybody.", Integer.valueOf(failures));
        }
    }

    // --- vehicles --------------------------------------------------------------------------------

    /**
     * The citizen's cars, registered through the real {@link VehicleService} so the plate is
     * normalised and the "at most one primary" rule is enforced by the domain rather than by the
     * fixture. Idempotent: a citizen who already has vehicles keeps exactly the ones they have.
     */
    private List<Vehicle> ensureVehicles(UserId userId, String email) {
        List<Vehicle> existing = vehicleService.listOwn(userId);
        if (!existing.isEmpty()) {
            return existing;
        }
        List<Vehicle> created = new ArrayList<>();
        for (VehicleSeed seed : VEHICLES.getOrDefault(email, List.of())) {
            created.add(vehicleService.register(userId, seed.plate(), seed.name(), seed.brand(), seed.model(),
                    Integer.valueOf(seed.year()), seed.type().name(), seed.color().name(),
                    true, seed.primary()));
        }
        return created;
    }

    // --- per municipality ------------------------------------------------------------------------

    private void seedForMunicipality(Tenant tenant, UserId userId, DemoCitizen profile, List<Vehicle> vehicles,
                                     long openingMajor, boolean firstMunicipality) {
        TenantId tenantId = TenantId.of(tenant.getId());
        if (sessionRepository.findByTenantIdAndUserIdAndStatusOrderByStartedAtDesc(tenant.getId(),
                userId.value(), ParkingSessionStatus.FINISHED, PageRequest.of(0, 1)).hasContent()) {
            // This citizen already has history here. Leave everything alone, wallet included: a
            // developer who spent the balance on test sessions keeps their state across restarts.
            return;
        }

        List<ParkingZone> zones = zoneRepository.findByTenantIdAndActiveTrueOrderByCodeAsc(tenant.getId());
        if (zones.isEmpty()) {
            return;
        }
        // The account is created by the real service, in the municipality's own currency. Its
        // movements are not: see the class comment — a statement has to read in chronological order,
        // and the top-up that paid for a stay from last week cannot be dated today.
        UUID accountId = walletService.require(tenantId, userId).getId();
        if (walletService.listTransactions(tenantId, userId,
                new cr.luparx.core.page.PageRequest(0, 1, null, null)).totalElements() > 0L) {
            // Already has a ledger here. Leave it alone: a developer who spent the balance on test
            // sessions keeps their state across restarts.
            return;
        }
        Money opening = Money.ofMajor(BigDecimal.valueOf(openingMajor), tenant.getCurrencyCode());

        Instant now = clock.instant();
        List<SessionPlan> plans = planSessions(tenant, userId, vehicles, zones, now, firstMunicipality);
        if (plans.isEmpty()) {
            return;
        }
        long finalBalance = transactionTemplate.execute(
                status -> writeHistory(tenant, userId, accountId, opening, plans, now));

        // Minutes already to their favour, from a stay they closed early — but only where the
        // municipality actually credits them. Seeding a credit lot in a municipality whose policy says
        // minutes are never credited would contradict the very configuration that municipality exists
        // to exercise.
        boolean credited = firstMunicipality && policyService.require(tenantId).isCreditOnEarlyFinishEnabled();
        if (credited) {
            // Through the real service, so the lot carries its expiry exactly as the domain writes it.
            timeCreditService.grant(tenantId, userId, SEEDED_CREDIT_MINUTES, TimeCreditSource.EARLY_FINISH,
                    null, SEEDED_CREDIT_EXPIRY_DAYS);
        }
        LOGGER.info("Development seed: {} in {} — opening {} {}, up to {} sessions written, balance now {} {}"
                        + "{}.",
                profile.email(), tenant.getSlug(), openingMajor, tenant.getCurrencyCode(), plans.size(),
                Money.ofMinor(finalBalance, tenant.getCurrencyCode()).toMajor(), tenant.getCurrencyCode(),
                credited ? ", " + SEEDED_CREDIT_MINUTES + " minutes of credit" : "");
    }

    /**
     * Decides what happened: two stays that are over, and — in the citizen's first municipality — one
     * that is still running.
     *
     * <p>Each stay is priced at the tariff in force in its zone, per started block, which is what the
     * domain would have charged. A bay is taken from the zone's own bays; the running one takes a bay
     * no other running session holds, because {@code uq_parking_sessions_active_space} would refuse a
     * second one and the fixture must not be the thing that trips it.</p>
     */
    private List<SessionPlan> planSessions(Tenant tenant, UserId userId, List<Vehicle> vehicles,
                                           List<ParkingZone> zones, Instant now, boolean firstMunicipality) {
        List<SessionPlan> plans = new ArrayList<>();
        for (int index = 0; index < PAST_SESSION_MINUTES.length; index++) {
            ParkingZone zone = zones.get(index % zones.size());
            ZonePriceBook prices = pricesInForce(tenant, zone, now);
            ParkingSpace space = bayOf(tenant, zone, index);
            if (prices == null || space == null) {
                continue;
            }
            Vehicle vehicle = vehicles.get(index % vehicles.size());
            int minutes = PAST_SESSION_MINUTES[index];
            Instant startedAt = now.minus(PAST_SESSION_DAYS_AGO[index], ChronoUnit.DAYS);
            Instant expiresAt = startedAt.plus(minutes, ChronoUnit.MINUTES);
            plans.add(new SessionPlan(zone, space, vehicle, startedAt, expiresAt,
                    // The first stay was closed by the citizen; the second simply ran out.
                    index == 0 ? ParkingSessionStatus.FINISHED : ParkingSessionStatus.EXPIRED,
                    index == 0 ? expiresAt : null,
                    prices.priceOf(minutes).minorUnits()));
        }
        if (firstMunicipality) {
            ParkingZone zone = zones.get(0);
            ZonePriceBook prices = pricesInForce(tenant, zone, now);
            ParkingSpace space = bayOf(tenant, zone, PAST_SESSION_MINUTES.length);
            Vehicle vehicle = vehicles.get(0);
            if (prices != null && space != null && !sessionRepository.existsByVehicleIdAndStatus(vehicle.getId(),
                    ParkingSessionStatus.ACTIVE)) {
                Instant startedAt = now.minus(ACTIVE_SESSION_STARTED_MINUTES_AGO, ChronoUnit.MINUTES);
                plans.add(new SessionPlan(zone, space, vehicle, startedAt,
                        startedAt.plus(ACTIVE_SESSION_MINUTES, ChronoUnit.MINUTES),
                        ParkingSessionStatus.ACTIVE, null, prices.priceOf(ACTIVE_SESSION_MINUTES).minorUnits()));
            }
        }
        return plans;
    }

    /**
     * Writes the whole ledger of one citizen in one municipality, in one transaction and in
     * chronological order: the opening top-up first, dated before the earliest stay, then each stay
     * and the charge that paid for it.
     *
     * <p>The running balance is carried explicitly, so every {@code balance_after_minor} is the total
     * after its own movement and the account's balance is the last line of the statement. Reading the
     * ledger from oldest to newest has to add up to the balance shown on the screen; a top-up dated
     * after the charges it funded would make a correct statement impossible.</p>
     */
    private long writeHistory(Tenant tenant, UserId userId, UUID accountId, Money opening,
                              List<SessionPlan> plans, Instant now) {
        String currency = tenant.getCurrencyCode();
        Instant earliest = now;
        for (SessionPlan plan : plans) {
            if (plan.startedAt().isBefore(earliest)) {
                earliest = plan.startedAt();
            }
        }
        long balance = opening.minorUnits();
        jdbcTemplate.update(INSERT_TRANSACTION_SQL,
                Uuid7.generate(), tenant.getId(), accountId, userId.value(),
                "TOP_UP", Long.valueOf(balance), currency, Long.valueOf(balance), null,
                "dev-seed-opening-" + tenant.getSlug(), at(earliest.minus(1, ChronoUnit.DAYS)));

        for (SessionPlan plan : plans) {
            long charge = plan.amountMinor();
            if (charge > balance) {
                // The citizen could not have afforded this stay, so it never happened. Charging a
                // reduced amount instead would put a line in the ledger the domain would never write:
                // a stay is paid in full or it is refused with INSUFFICIENT_BALANCE. The low-balance
                // citizen therefore ends up with less history, which is exactly what being short of
                // money looks like.
                continue;
            }
            UUID sessionId = Uuid7.generate();
            // Una estadía de cortesía —los minutos gratis del inicio— se cobra en cero, y para la
            // base eso NO es "pagada": es NO_CHARGE con su motivo. Es la distinción que le permite a
            // un funcionario en la calle contestarle al ciudadano que reclama por qué no se le cobró.
            boolean charged = charge > 0L;
            jdbcTemplate.update(INSERT_SESSION_SQL,
                    sessionId, tenant.getId(), userId.value(), plan.vehicle().getId(),
                    plan.vehicle().getPlateNormalized(), plan.zone().getId(), plan.space().getId(),
                    at(plan.startedAt()), at(plan.expiresAt()),
                    plan.endedAt() == null ? null : at(plan.endedAt()),
                    plan.status().name(), Long.valueOf(charge), currency,
                    charged ? "PAID" : "NO_CHARGE",
                    charged ? null : "COURTESY",
                    at(plan.startedAt()), at(plan.startedAt()));
            if (charged) {
                balance -= charge;
                UUID transactionId = Uuid7.generate();
                jdbcTemplate.update(INSERT_TRANSACTION_SQL,
                        transactionId, tenant.getId(), accountId, userId.value(),
                        "SESSION_CHARGE", Long.valueOf(-charge), currency, Long.valueOf(balance),
                        sessionId, "dev-seed-" + sessionId, at(plan.startedAt()));
                // La estadía apunta al movimiento que la pagó. Sin esto el fixture tiene el cobro y
                // la estadía por separado y nada que los una: la pantalla de conciliación no puede
                // ver la mitad de sus propios datos, que es justo lo que la V31_0 vino a arreglar.
                jdbcTemplate.update(
                        "UPDATE parking_sessions SET payment_transaction_id = ? WHERE id = ?",
                        transactionId, sessionId);
            }
        }
        jdbcTemplate.update(UPDATE_BALANCE_SQL, Long.valueOf(balance), at(now), accountId);
        return balance;
    }

    // --- helpers ---------------------------------------------------------------------------------

    /** The n-th bay of a zone by code, or null when the zone has fewer than that. */
    private ParkingSpace bayOf(Tenant tenant, ParkingZone zone, int position) {
        return spaceRepository.findByTenantIdAndZoneIdOrderByCodeAsc(tenant.getId(), zone.getId(),
                        PageRequest.of(position, 1))
                .stream().findFirst().orElse(null);
    }

    /**
     * The zone's prices at that instant, resolved exactly as the domain resolves them.
     *
     * <p>This used to hand back one {@code ParkingRate} and multiply it by started blocks in a
     * private helper — a second copy of the pricing rule living in a fixture. Since v0.24 there are
     * two ways to price a stay, and a copy would not merely drift: the seeded history would show
     * amounts the application never would have charged, which is the one thing a fixture must not
     * do.</p>
     */
    private ZonePriceBook pricesInForce(Tenant tenant, ParkingZone zone, Instant at) {
        List<ParkingRate> open = new ArrayList<>();
        for (ParkingRate rate : rateRepository.findByTenantIdAndZoneIdAndValidFromLessThanEqualOrderByValidFromDesc(
                tenant.getId(), zone.getId(), at)) {
            if (rate.getValidTo() == null || rate.getValidTo().isAfter(at)) {
                open.add(rate);
            }
        }
        if (open.isEmpty()) {
            return null;
        }
        try {
            return ZonePriceBook.of(open);
        } catch (IllegalArgumentException noBase) {
            return null;
        }
    }

    private static OffsetDateTime at(Instant instant) {
        return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
    }

    /**
     * A vehicle the fixture registers. {@code primary} marks the one offered first when starting a
     * stay; {@code type} and {@code color} are what makes a card read "Toyota Yaris · Gris · 2019"
     * instead of leaving the citizen app to render a blank where the reference design has content.
     */
    private record VehicleSeed(String plate, String name, String brand, String model, int year,
                               VehicleType type, VehicleColor color, boolean primary) {
    }

    /** One stay the fixture is about to write, already priced. */
    private record SessionPlan(ParkingZone zone, ParkingSpace space, Vehicle vehicle, Instant startedAt,
                               Instant expiresAt, ParkingSessionStatus status, Instant endedAt,
                               long amountMinor) {
    }
}
