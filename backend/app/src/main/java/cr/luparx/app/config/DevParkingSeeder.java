package cr.luparx.app.config;

import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.money.Money;
import cr.luparx.geo.entity.AdministrativeDivision;
import cr.luparx.geo.repository.AdministrativeDivisionRepository;
import cr.luparx.parking.entity.ParkingPolicy;
import cr.luparx.parking.entity.ParkingRate;
import cr.luparx.parking.entity.ParkingScheduleSlot;
import cr.luparx.parking.entity.ParkingSpaceFormat;
import cr.luparx.parking.entity.ParkingZone;
import cr.luparx.parking.model.ParkingSpaceStatus;
import cr.luparx.parking.repository.ParkingRateRepository;
import cr.luparx.parking.repository.ParkingSpaceRepository;
import cr.luparx.parking.repository.ParkingZoneRepository;
import cr.luparx.parking.service.ParkingPolicyService;
import cr.luparx.parking.service.ParkingScheduleService;
import cr.luparx.parking.service.ParkingSpaceFormatService;
import cr.luparx.parking.service.WalletService;
import cr.luparx.tenancy.service.TenantLocaleService;
import cr.luparx.tenancy.entity.Tenant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Fills the launch municipality with the parking it actually operates: its policy, its zones, one
 * tariff per zone, the numbered bays a citizen types a code from, and a funded wallet for the
 * development citizen. Development only, and only alongside
 * {@link DevDataSeeder}, which owns the tenant and the accounts and calls this class once the
 * municipality exists.
 *
 * <p><b>The zones below are seed data, not an assumption of the code.</b> They name real districts
 * and real sectors of the canton of San José because a fixture that lies about the world teaches a
 * developer the wrong thing; nothing in the platform reads them, and a deployment elsewhere seeds a
 * different list without a line of domain logic changing. Country, currency, locale and time zone
 * still come from {@code platform.defaults.*} through the tenant — the amounts below are declared in
 * major units and converted with {@link Money#ofMajor}, so the fixture is priced in whatever currency
 * the municipality was configured with rather than in a hardcoded one.</p>
 *
 * <h2>How the bays are distributed</h2>
 *
 * <p>Codes run {@code 0001}..{@code NNNN} across the whole municipality and are dealt to the zones in
 * <em>contiguous blocks</em>, in the declared order, proportionally to each zone's
 * {@link ZoneSeed#share()}. Block boundaries are computed from the cumulative share
 * ({@code start = total × cumulative ÷ totalShare}), which partitions the range exactly: no remainder
 * to hand out, no bay in two zones, no gap. Contiguity is not cosmetic — bays are numbered along a
 * street in the real world, so a block per zone is what the paint would say.</p>
 *
 * <p>The insert is batched and runs inside one transaction, and it is idempotent by code: the codes
 * already present are read once and skipped, so an interrupted run completes on the next start
 * instead of failing on a duplicate. Only <em>missing</em> codes are created — an existing bay is
 * never moved to another zone, so changing the shares below after a seed has run has no effect until
 * the database is recreated.</p>
 */
@Component
@Profile("dev")
@ConditionalOnProperty(prefix = "luparx.dev", name = "seed-demo-data", havingValue = "true", matchIfMissing = true)
public class DevParkingSeeder {

    private static final Logger LOGGER = LoggerFactory.getLogger(DevParkingSeeder.class);

    /**
     * Administrative level the zone seeds point at. For Costa Rica level 3 is the district; this is
     * part of the seed data, exactly like the codes below, and not a claim about other countries.
     */
    private static final int DISTRICT_LEVEL = 3;

    /** Codes are zero-padded so "0001" and "0025" sort and read the way a painted sign does. */
    private static final String CODE_FORMAT = "%04d";

    /** Rows per JDBC batch. Large enough to matter, small enough to keep one statement modest. */
    private static final int BATCH_SIZE = 1_000;

    /** Every seeded tariff is an hourly one; a real duration ladder belongs to a later prompt. */
    private static final int RATE_MINUTES = 60;

    /**
     * The parking of the canton of San José: eight zones over six of its districts, each named after
     * the sector a driver would actually say out loud. {@code districtCode} is the official district
     * code seeded in V9_1/V9_2; {@code share} is this zone's weight in the code range;
     * {@code hourlyMajor} is the seeded hourly tariff in major units of the municipality's currency.
     */
    private static final List<ZoneSeed> ZONES = List.of(
            new ZoneSeed("SJ-AMON", "Barrio Amón",
                    "Barrio Amón, al norte del centro: calles estrechas y casas patrimoniales.",
                    "10101", 10, 600L),
            new ZoneSeed("SJ-ESCALANTE", "Barrio Escalante",
                    "Barrio Escalante y Calle 33, zona de restaurantes con alta rotación nocturna.",
                    "10101", 15, 800L),
            new ZoneSeed("SJ-MERCADO", "Mercado Central",
                    "Entorno del Mercado Central y Avenida Central, rotación alta durante el día.",
                    "10102", 15, 700L),
            new ZoneSeed("SJ-COLON", "Paseo Colón",
                    "Paseo Colón y sus calles transversales, corredor de oficinas hacia La Sabana.",
                    "10102", 15, 700L),
            new ZoneSeed("SJ-HOSPITAL", "Hospital San Juan de Dios",
                    "Distrito Hospital: alrededores del Hospital San Juan de Dios y el Paso de la Vaca.",
                    "10103", 12, 600L),
            new ZoneSeed("SJ-CATEDRAL", "Catedral – La Soledad",
                    "Distrito Catedral: barrios La Soledad y González Lahmann.",
                    "10104", 12, 600L),
            new ZoneSeed("SJ-ZAPOTE", "Zapote Centro",
                    "Zapote centro, entre la Casa Presidencial y el redondel de Zapote.",
                    "10105", 10, 500L),
            new ZoneSeed("SJ-SABANA", "La Sabana",
                    "Mata Redonda: costados del Parque Metropolitano La Sabana y el Estadio Nacional.",
                    "10108", 11, 500L));

    private static final String INSERT_SPACE_SQL = """
            INSERT INTO parking_spaces (id, tenant_id, zone_id, code, status, created_at, updated_at, version)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0)
            """;

    private static final String SELECT_CODES_SQL = "SELECT code FROM parking_spaces WHERE tenant_id = ?";

    /**
     * Opening balance of the development citizen, in MAJOR units of the municipality's own currency.
     * Enough for a long afternoon of testing at the seeded tariffs and deliberately not a round
     * million: a fixture that can never run out never exercises INSUFFICIENT_BALANCE.
     */
    private static final long DEMO_WALLET_MAJOR = 50_000L;

    private final DevSeedProperties properties;
    private final ParkingPolicyService policyService;
    private final ParkingSpaceFormatService spaceFormatService;
    private final ParkingScheduleService scheduleService;
    private final TenantLocaleService tenantLocaleService;
    private final WalletService walletService;
    private final ParkingZoneRepository zoneRepository;
    private final ParkingRateRepository rateRepository;
    private final ParkingSpaceRepository spaceRepository;
    private final AdministrativeDivisionRepository divisionRepository;
    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactionTemplate;
    private final Clock clock;

    public DevParkingSeeder(DevSeedProperties properties,
                            ParkingPolicyService policyService,
                            ParkingSpaceFormatService spaceFormatService,
                            ParkingScheduleService scheduleService,
                            TenantLocaleService tenantLocaleService,
                            WalletService walletService,
                            ParkingZoneRepository zoneRepository,
                            ParkingRateRepository rateRepository,
                            ParkingSpaceRepository spaceRepository,
                            AdministrativeDivisionRepository divisionRepository,
                            JdbcTemplate jdbcTemplate,
                            PlatformTransactionManager transactionManager,
                            Clock clock) {
        this.properties = properties;
        this.policyService = policyService;
        this.spaceFormatService = spaceFormatService;
        this.scheduleService = scheduleService;
        this.tenantLocaleService = tenantLocaleService;
        this.walletService = walletService;
        this.zoneRepository = zoneRepository;
        this.rateRepository = rateRepository;
        this.spaceRepository = spaceRepository;
        this.divisionRepository = divisionRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.clock = clock;
    }

    /**
     * Seeds zones, tariffs and bays for one municipality. Safe to call on every start: each step asks
     * what is already there first.
     */
    public void seed(Tenant tenant, UUID citizenUserId) {
        ensurePolicy(tenant);
        ensureOperationalSettings(tenant);
        ensureWallet(tenant, citizenUserId);
        List<ParkingZone> zones = ensureZones(tenant);
        if (zones.isEmpty()) {
            LOGGER.warn("Development seed: no parking zone could be created; bays skipped.");
            return;
        }
        ensureRates(tenant, zones);
        ensureSpaces(tenant, zones);
    }

    // --- policy ----------------------------------------------------------------------------------

    /**
     * Materialises the municipality's parking policy from {@code platform.defaults.parking.*}.
     *
     * <p>No values are written here on purpose. The seeder asks the domain for the policy and the
     * domain creates it from the deployment's configured defaults, so the fixture and a real
     * municipality's first day go through exactly the same code path. Changing what San José offers
     * in development is a change to application-dev.yml, not to this class — which is what
     * CONTRACT.md v0.2 means by "nada de constantes en el código".</p>
     */
    private void ensurePolicy(Tenant tenant) {
        ParkingPolicy policy = policyService.require(TenantId.of(tenant.getId()));
        LOGGER.info("Development seed: parking policy for {} — start {} min, extension {} ({}), early finish {},"
                        + " credit {} expiring in {} days.",
                tenant.getSlug(), policy.getSessionIncrementsMinutes(), policy.getExtensionIncrementsMinutes(),
                policy.isExtensionEnabled() ? "enabled" : "disabled",
                policy.isEarlyFinishEnabled() ? "enabled" : "disabled",
                policy.isCreditOnEarlyFinishEnabled() ? "enabled" : "disabled", policy.getCreditExpiryDays());
    }

    /**
     * Materialises the municipality's bay-code format and charging timetable
     * (CONTRACT.md v0.3), so the admin portal opens on real rows instead of on nothing.
     *
     * <p>No values are written here either: the seeder asks the domain, and the domain creates both
     * from {@code platform.defaults.parking.*}. San José therefore starts on four plain digits and on
     * Monday to Saturday, 07:00 to 18:00, with Sunday free — which is a line of YAML, not a constant
     * in this class.</p>
     */
    private void ensureOperationalSettings(Tenant tenant) {
        TenantId tenantId = TenantId.of(tenant.getId());
        ParkingSpaceFormat format = spaceFormatService.require(tenantId);
        scheduleService.require(tenantId);
        List<ParkingScheduleSlot> bands = scheduleService.slots(tenantId);
        // The languages of the municipality are materialised too, so the login dropdown has a list
        // to show on a fresh database (CONTRACT.md v0.3, "Idiomas por municipalidad").
        int locales = tenantLocaleService.list(tenantId).size();
        LOGGER.info("Development seed: {} bay codes look like {} (pattern {}), charging bands: {},"
                        + " languages offered: {}.",
                tenant.getSlug(), format.getExample(), format.getPattern(), bands.size(), locales);
    }

    // --- wallet ----------------------------------------------------------------------------------

    /**
     * Gives the development citizen a balance in this municipality, once.
     *
     * <p>Idempotent by balance rather than by a flag: a wallet that already holds money is left
     * alone, so a developer who spent it on test sessions keeps their state and a restart does not
     * quietly refill it. The amount is declared in major units and converted with
     * {@link Money#ofMajor}, so the fixture is denominated in whatever currency the municipality was
     * configured with.</p>
     */
    private void ensureWallet(Tenant tenant, UUID citizenUserId) {
        if (citizenUserId == null) {
            LOGGER.warn("Development seed: no citizen account available; wallet skipped.");
            return;
        }
        TenantId tenantId = TenantId.of(tenant.getId());
        UserId userId = UserId.of(citizenUserId);
        try {
            if (!walletService.balance(tenantId, userId).isZero()) {
                return;
            }
            Money opening = Money.ofMajor(BigDecimal.valueOf(DEMO_WALLET_MAJOR), tenant.getCurrencyCode());
            walletService.topUp(tenantId, userId, opening, "dev-seed-opening-balance");
            LOGGER.warn("Development seed: citizen wallet funded with {} in {}.", DEMO_WALLET_MAJOR,
                    tenant.getCurrencyCode());
        } catch (RuntimeException exception) {
            // A currency the JDK does not know, or one whose fraction digits the amount does not fit.
            LOGGER.warn("Development seed: citizen wallet not funded ({}).", exception.toString());
        }
    }

    // --- zones -----------------------------------------------------------------------------------

    /**
     * Creates the missing zones and returns all of them in the declared order, which is the order the
     * code blocks are dealt in. A zone that already exists is returned untouched: a developer who
     * renamed one locally keeps their change.
     */
    private List<ParkingZone> ensureZones(Tenant tenant) {
        Map<String, UUID> districts = resolveDistricts(tenant.getCountryCode());
        Instant now = clock.instant();
        List<ParkingZone> zones = new ArrayList<>(ZONES.size());
        int created = 0;
        for (ZoneSeed seed : ZONES) {
            Optional<ParkingZone> existing = zoneRepository.findByTenantIdAndCode(tenant.getId(), seed.code());
            if (existing.isPresent()) {
                zones.add(existing.get());
                continue;
            }
            UUID divisionId = districts.get(seed.districtCode());
            if (divisionId == null) {
                // The zone is still worth having: division_id is nullable precisely because the tree
                // of the configured country may not contain this district.
                LOGGER.warn("Development seed: district {} not found for country {}; zone {} has no division.",
                        seed.districtCode(), tenant.getCountryCode(), seed.code());
            }
            zones.add(zoneRepository.save(new ParkingZone(Uuid7.generate(), tenant.getId(), seed.code(),
                    seed.name(), seed.description(), divisionId, true, now)));
            created++;
        }
        LOGGER.info("Development seed: {} parking zones present ({} created).", zones.size(), created);
        return zones;
    }

    /**
     * Resolves the seeded district codes to division ids in one query. Divisions are catalogue data,
     * so this read carries no tenant — and it is narrowed by country, level and an explicit list of
     * codes rather than scanning a table that grows to millions of rows.
     */
    private Map<String, UUID> resolveDistricts(String countryCode) {
        Set<String> codes = new HashSet<>();
        for (ZoneSeed seed : ZONES) {
            codes.add(seed.districtCode());
        }
        Map<String, UUID> byCode = new HashMap<>();
        List<AdministrativeDivision> divisions =
                divisionRepository.findByCountryCodeAndLevelAndCodeIn(countryCode, DISTRICT_LEVEL, codes);
        for (AdministrativeDivision division : divisions) {
            byCode.put(division.getCode(), division.getId());
        }
        return byCode;
    }

    // --- rates -----------------------------------------------------------------------------------

    /**
     * One open-ended hourly tariff per zone, priced in the municipality's own currency. Skipped for
     * any zone that already has one: a tariff is superseded by closing its window, never by the
     * fixture writing a second row on every start.
     */
    private void ensureRates(Tenant tenant, List<ParkingZone> zones) {
        Instant now = clock.instant();
        int created = 0;
        for (int index = 0; index < zones.size(); index++) {
            ParkingZone zone = zones.get(index);
            if (rateRepository.countByTenantIdAndZoneId(tenant.getId(), zone.getId()) > 0) {
                continue;
            }
            ZoneSeed seed = ZONES.get(index);
            try {
                Money amount = Money.ofMajor(BigDecimal.valueOf(seed.hourlyMajor()), tenant.getCurrencyCode());
                rateRepository.save(new ParkingRate(Uuid7.generate(), tenant.getId(), zone.getId(), amount,
                        RATE_MINUTES, now, null, now));
                created++;
            } catch (RuntimeException exception) {
                // A currency the JDK does not know, or one whose fraction digits the amount does not
                // fit. The fixture is worth less without a tariff, but not worth a failed start.
                LOGGER.warn("Development seed: no tariff for zone {} ({}).", zone.getCode(), exception.toString());
            }
        }
        if (created > 0) {
            LOGGER.info("Development seed: {} hourly parking tariffs created in {}.", created,
                    tenant.getCurrencyCode());
        }
    }

    // --- spaces ----------------------------------------------------------------------------------

    private void ensureSpaces(Tenant tenant, List<ParkingZone> zones) {
        int target = resolveTargetCount();
        long existing = spaceRepository.countByTenantId(tenant.getId());
        if (existing >= target) {
            LOGGER.info("Development seed: {} parking spaces already present (target {}); nothing to do.",
                    existing, target);
            return;
        }

        long startedAt = System.nanoTime();
        Integer inserted = transactionTemplate.execute(status -> insertMissingSpaces(tenant, zones, target));
        long created = inserted == null ? 0L : inserted.longValue();
        long millis = (System.nanoTime() - startedAt) / 1_000_000L;
        LOGGER.info("Development seed: {} parking spaces created in {} ms ({} in total, codes {} to {}).",
                created, millis, existing + created, format(1L), format(target));
    }

    /**
     * Reads the codes already present once, then inserts every missing one in batches. Everything here
     * runs inside the caller's transaction, so an interrupted start leaves either all of this run's
     * bays or none of them — never a half-dealt block.
     */
    private int insertMissingSpaces(Tenant tenant, List<ParkingZone> zones, int target) {
        Set<String> present =
                new HashSet<>(jdbcTemplate.queryForList(SELECT_CODES_SQL, String.class, tenant.getId()));
        OffsetDateTime now = OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
        String available = ParkingSpaceStatus.AVAILABLE.name();

        int totalShare = 0;
        for (ZoneSeed seed : ZONES) {
            totalShare += seed.share();
        }

        List<Object[]> batch = new ArrayList<>(BATCH_SIZE);
        int inserted = 0;
        long cumulative = 0L;
        for (int index = 0; index < zones.size(); index++) {
            UUID zoneId = zones.get(index).getId();
            long blockStart = (long) target * cumulative / totalShare + 1L;
            cumulative += ZONES.get(index).share();
            long blockEnd = (long) target * cumulative / totalShare;
            for (long number = blockStart; number <= blockEnd; number++) {
                String code = format(number);
                if (present.contains(code)) {
                    continue;
                }
                batch.add(new Object[] {Uuid7.generate(), tenant.getId(), zoneId, code, available, now, now});
                if (batch.size() == BATCH_SIZE) {
                    jdbcTemplate.batchUpdate(INSERT_SPACE_SQL, batch);
                    inserted += batch.size();
                    batch.clear();
                }
            }
        }
        if (!batch.isEmpty()) {
            jdbcTemplate.batchUpdate(INSERT_SPACE_SQL, batch);
            inserted += batch.size();
        }
        return inserted;
    }

    /**
     * How many bays the fixture should end up with. A missing or non-positive value falls back to the
     * default; a value above the maximum is clamped and said so out loud, because silently ignoring
     * what a developer configured is how a fixture becomes confusing.
     */
    private int resolveTargetCount() {
        Integer configured = properties.parkingSpaces();
        if (configured == null || configured <= 0) {
            return DevSeedProperties.DEFAULT_PARKING_SPACES;
        }
        if (configured > DevSeedProperties.MAXIMUM_PARKING_SPACES) {
            LOGGER.warn("Development seed: luparx.dev.parking-spaces={} exceeds the maximum {}; using the maximum.",
                    configured, DevSeedProperties.MAXIMUM_PARKING_SPACES);
            return DevSeedProperties.MAXIMUM_PARKING_SPACES;
        }
        return configured;
    }

    private static String format(long number) {
        return String.format(Locale.ROOT, CODE_FORMAT, number);
    }

    /**
     * One seeded zone.
     *
     * @param code         operational code, unique inside the municipality
     * @param name         what a citizen or an inspector reads
     * @param description  one sentence of real geography, stored as tenant content
     * @param districtCode official district code, resolved against the administrative tree
     * @param share        weight of this zone in the municipality-wide code range
     * @param hourlyMajor  hourly tariff in major units of the municipality's configured currency
     */
    private record ZoneSeed(String code, String name, String description, String districtCode, int share,
                            long hourlyMajor) {
    }
}
