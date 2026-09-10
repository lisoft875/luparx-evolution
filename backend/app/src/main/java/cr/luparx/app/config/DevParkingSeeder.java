package cr.luparx.app.config;

import cr.luparx.app.config.DevMunicipalities.DevMunicipality;
import cr.luparx.app.config.DevMunicipalities.FormatVariant;
import cr.luparx.app.config.DevMunicipalities.HolidaySeed;
import cr.luparx.app.config.DevMunicipalities.PolicyVariant;
import cr.luparx.app.config.DevMunicipalities.ScheduleVariant;
import cr.luparx.app.config.DevMunicipalities.ZoneSeed;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.money.Money;
import cr.luparx.geo.entity.AdministrativeDivision;
import cr.luparx.geo.repository.AdministrativeDivisionRepository;
import cr.luparx.parking.entity.ParkingPolicy;
import cr.luparx.parking.entity.ParkingRate;
import cr.luparx.parking.model.RateKind;
import cr.luparx.parking.entity.ParkingScheduleSlot;
import cr.luparx.parking.entity.ParkingSpaceFormat;
import cr.luparx.parking.entity.ParkingZone;
import cr.luparx.parking.model.ChargingBand;
import cr.luparx.parking.model.ParkingSpaceStatus;
import cr.luparx.parking.model.SpaceCodeFormat;
import cr.luparx.parking.repository.ParkingRateRepository;
import cr.luparx.parking.repository.ParkingSpaceRepository;
import cr.luparx.parking.repository.ParkingZoneRepository;
import cr.luparx.parking.service.ParkingPolicyService;
import cr.luparx.parking.service.ParkingScheduleService;
import cr.luparx.parking.service.ParkingSpaceFormatService;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.service.TenantLocaleService;
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
import java.time.DayOfWeek;
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
 * Gives a municipality the parking it operates: its policy, its charging timetable, its bay code
 * format, its zones, one tariff per zone, and the numbered bays a citizen types a code from.
 * Development only, and only alongside {@link DevDataSeeder}, which owns the tenants and the
 * accounts and calls this class once each municipality exists.
 *
 * <p><b>The municipalities are seed data, not an assumption of the code.</b> They name real cantons,
 * real districts and real sectors because a fixture that lies about the world teaches a developer the
 * wrong thing; nothing in the platform reads {@link DevMunicipalities}, and a deployment elsewhere
 * seeds a different list without a line of domain logic changing. Country, currency, locale and time
 * zone still come from {@code platform.defaults.*} through the tenant — the amounts are declared in
 * major units and converted with {@link Money#ofMajor}, so every fixture is priced in whatever
 * currency its municipality was configured with rather than in a hardcoded one.</p>
 *
 * <h2>Why each municipality is configured differently</h2>
 *
 * <p>One municipality cannot exercise a multi-tenant platform: with a single tenant, a price list
 * that leaks across municipalities, a bay code assumed to be four digits and a timetable assumed to
 * be the launch one all look correct. Each municipality here therefore makes one configuration real —
 * see the table in {@link DevMunicipalities}. A municipality whose variant is null keeps the
 * platform defaults, which is what San José does and why its behaviour is unchanged.</p>
 *
 * <h2>How the bays are distributed</h2>
 *
 * <p>Codes run from the first one upwards <em>inside each municipality</em> — they are unique per
 * tenant, so every municipality numbers from the beginning, exactly as two real ones would — and are
 * dealt to the zones in <em>contiguous blocks</em>, in the declared order, proportionally to each
 * zone's {@link ZoneSeed#share()}. Block boundaries come from the cumulative share
 * ({@code start = total × cumulative ÷ totalShare}), which partitions the range exactly: no remainder
 * to hand out, no bay in two zones, no gap. Contiguity is not cosmetic — bays are numbered along a
 * street in the real world, so a block per zone is what the paint would say.</p>
 *
 * <p>The insert is batched and runs inside one transaction, and it is idempotent by code: the codes
 * already present are read once and skipped, so an interrupted run completes on the next start
 * instead of failing on a duplicate. Only <em>missing</em> codes are created — an existing bay is
 * never moved to another zone, so changing the shares after a seed has run has no effect until the
 * database is recreated.</p>
 */
@Component
@Profile("dev")
@ConditionalOnProperty(prefix = "luparx.dev", name = "seed-demo-data", havingValue = "true", matchIfMissing = true)
public class DevParkingSeeder {

    private static final Logger LOGGER = LoggerFactory.getLogger(DevParkingSeeder.class);

    /** Rows per JDBC batch. Large enough to matter, small enough to keep one statement modest. */
    private static final int BATCH_SIZE = 1_000;

    /** Every seeded tariff is an hourly one; a real duration ladder belongs to a later prompt. */
    private static final int RATE_MINUTES = 60;

    private static final String INSERT_SPACE_SQL = """
            INSERT INTO parking_spaces (id, tenant_id, zone_id, code, status, created_at, updated_at, version)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0)
            """;

    private static final String SELECT_CODES_SQL = "SELECT code FROM parking_spaces WHERE tenant_id = ?";

    private final ParkingPolicyService policyService;
    private final ParkingSpaceFormatService spaceFormatService;
    private final ParkingScheduleService scheduleService;
    private final TenantLocaleService tenantLocaleService;
    private final ParkingZoneRepository zoneRepository;
    private final ParkingRateRepository rateRepository;
    private final ParkingSpaceRepository spaceRepository;
    private final AdministrativeDivisionRepository divisionRepository;
    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactionTemplate;
    private final Clock clock;

    public DevParkingSeeder(ParkingPolicyService policyService,
                            ParkingSpaceFormatService spaceFormatService,
                            ParkingScheduleService scheduleService,
                            TenantLocaleService tenantLocaleService,
                            ParkingZoneRepository zoneRepository,
                            ParkingRateRepository rateRepository,
                            ParkingSpaceRepository spaceRepository,
                            AdministrativeDivisionRepository divisionRepository,
                            JdbcTemplate jdbcTemplate,
                            PlatformTransactionManager transactionManager,
                            Clock clock) {
        this.policyService = policyService;
        this.spaceFormatService = spaceFormatService;
        this.scheduleService = scheduleService;
        this.tenantLocaleService = tenantLocaleService;
        this.zoneRepository = zoneRepository;
        this.rateRepository = rateRepository;
        this.spaceRepository = spaceRepository;
        this.divisionRepository = divisionRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.clock = clock;
    }

    /**
     * Seeds one municipality. Safe to call on every start: each step asks what is already there first.
     *
     * @param spaceTarget how many bays this municipality should end up with
     * @return its zones, in declared order, for whoever needs to write history against them
     */
    public List<ParkingZone> seed(Tenant tenant, DevMunicipality municipality, int spaceTarget) {
        ensurePolicy(tenant, municipality);
        ensureOperationalSettings(tenant, municipality);
        List<ParkingZone> zones = ensureZones(tenant, municipality);
        if (zones.isEmpty()) {
            LOGGER.warn("Development seed: no parking zone could be created for {}; bays skipped.",
                    municipality.slug());
            return List.of();
        }
        ensureRates(tenant, municipality, zones);
        ensureSpaces(tenant, municipality, zones, spaceTarget);
        return zones;
    }

    // --- policy ----------------------------------------------------------------------------------

    /**
     * The municipality's parking policy: the platform defaults, or the variant this one exists to
     * exercise.
     *
     * <p>Even the variant is written through {@link ParkingPolicyService#replace}, not by assembling a
     * row: the coherence rules between the fields (a cap never below the session maximum, credit that
     * requires early finish) are domain rules, and a fixture that side-stepped them could seed a
     * municipality the admin portal would refuse to save.</p>
     */
    private void ensurePolicy(Tenant tenant, DevMunicipality municipality) {
        TenantId tenantId = TenantId.of(tenant.getId());
        ParkingPolicy policy = policyService.require(tenantId);
        PolicyVariant variant = municipality.policy();
        if (variant != null && policyNeedsVariant(policy, variant)) {
            policy = policyService.replace(tenantId,
                    variant.sessionIncrements(),
                    variant.sessionMinMinutes(),
                    variant.sessionMaxMinutes(),
                    variant.extensionEnabled(),
                    variant.extensionIncrements(),
                    variant.extensionMaxTotalMinutes(),
                    variant.earlyFinishEnabled(),
                    variant.creditOnEarlyFinishEnabled(),
                    variant.creditMinRemainingMinutes(),
                    variant.creditExpiryDays(),
                    variant.graceMinutes());
        }
        LOGGER.info("Development seed: {} parking policy — start {} min, extension {} ({}), early finish {},"
                        + " credit {}.",
                municipality.slug(), policy.getSessionIncrementsMinutes(), policy.getExtensionIncrementsMinutes(),
                policy.isExtensionEnabled() ? "enabled" : "disabled",
                policy.isEarlyFinishEnabled() ? "enabled" : "disabled",
                policy.isCreditOnEarlyFinishEnabled() ? "enabled" : "disabled");
    }

    /**
     * Whether the stored policy is not yet the fixture's variant and should be replaced.
     *
     * <p>Compared on the fields the variant is defined by rather than on all of them, so a second
     * start rewrites nothing. A developer who edited some other field of this municipality's policy
     * from the admin portal keeps their change, which is the point of an idempotent fixture.</p>
     */
    private boolean policyNeedsVariant(ParkingPolicy policy, PolicyVariant variant) {
        return policy.isExtensionEnabled() != variant.extensionEnabled()
                || policy.isCreditOnEarlyFinishEnabled() != variant.creditOnEarlyFinishEnabled()
                || policy.getSessionMaxMinutes() != variant.sessionMaxMinutes();
    }

    /**
     * The municipality's bay code format, charging timetable and offered languages.
     *
     * <p>All three are materialised by the domain from {@code platform.defaults.*} on first read, and
     * only then overwritten where this municipality is meant to differ — so a fixture municipality and
     * a real one's first day go through exactly the same code path.</p>
     */
    private void ensureOperationalSettings(Tenant tenant, DevMunicipality municipality) {
        TenantId tenantId = TenantId.of(tenant.getId());

        ParkingSpaceFormat format = spaceFormatService.require(tenantId);
        FormatVariant formatVariant = municipality.format();
        if (formatVariant != null && !format.getPrefix().equals(SpaceCodeFormat.normalizePrefix(
                formatVariant.prefix()))) {
            format = spaceFormatService.replace(tenantId, formatVariant.prefix(), formatVariant.digits(),
                    formatVariant.allowLetters(), null, null);
        }

        scheduleService.require(tenantId);
        ScheduleVariant scheduleVariant = municipality.schedule();
        List<ParkingScheduleSlot> bands = scheduleService.slots(tenantId);
        if (scheduleVariant != null && !scheduleMatches(tenantId, scheduleVariant, bands)) {
            List<ParkingScheduleService.BandEntry> entries = new ArrayList<>();
            for (DayOfWeek weekday : scheduleVariant.weekdays()) {
                entries.add(new ParkingScheduleService.BandEntry(weekday, scheduleVariant.startMinute(),
                        scheduleVariant.endMinute()));
            }
            List<ParkingScheduleService.ExceptionEntry> exceptions = new ArrayList<>();
            for (HolidaySeed holiday : scheduleVariant.holidays()) {
                // charges = false: a public holiday suspends charging whatever the weekday bands say.
                exceptions.add(new ParkingScheduleService.ExceptionEntry(holiday.date(), false, false,
                        holiday.label(), List.of()));
            }
            scheduleService.replace(tenantId, scheduleVariant.chargesAllDay(), entries, exceptions);
            bands = scheduleService.slots(tenantId);
        }

        int locales = tenantLocaleService.list(tenantId).size();
        LOGGER.info("Development seed: {} bay codes look like {} (pattern {}), charging bands: {},"
                        + " languages offered: {} — exercises: {}",
                municipality.slug(), format.getExample(), format.getPattern(), bands.size(), locales,
                municipality.exercises());
    }

    /** True when the stored timetable already is the variant, so a re-run rewrites nothing. */
    private boolean scheduleMatches(TenantId tenantId, ScheduleVariant variant, List<ParkingScheduleSlot> bands) {
        if (variant.chargesAllDay()) {
            return scheduleService.require(tenantId).isChargesAllDay();
        }
        if (bands.size() != variant.weekdays().size()) {
            return false;
        }
        ChargingBand expected = new ChargingBand(variant.startMinute(), variant.endMinute());
        for (ParkingScheduleSlot band : bands) {
            if (!band.band().equals(expected) || !variant.weekdays().contains(band.weekday())) {
                return false;
            }
        }
        return true;
    }

    // --- zones -----------------------------------------------------------------------------------

    /**
     * Creates the missing zones and returns all of them in the declared order, which is the order the
     * code blocks are dealt in. A zone that already exists is returned untouched: a developer who
     * renamed one locally keeps their change.
     */
    private List<ParkingZone> ensureZones(Tenant tenant, DevMunicipality municipality) {
        Map<String, UUID> districts = resolveDistricts(tenant.getCountryCode(), municipality);
        Instant now = clock.instant();
        List<ParkingZone> zones = new ArrayList<>(municipality.zones().size());
        int created = 0;
        for (ZoneSeed seed : municipality.zones()) {
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
        LOGGER.info("Development seed: {} — {} parking zones present ({} created).", municipality.slug(),
                zones.size(), created);
        return zones;
    }

    /**
     * Resolves the seeded district codes to division ids in one query. Divisions are catalogue data,
     * so this read carries no tenant — and it is narrowed by country, level and an explicit list of
     * codes rather than scanning a table that grows to millions of rows.
     */
    private Map<String, UUID> resolveDistricts(String countryCode, DevMunicipality municipality) {
        Set<String> codes = new HashSet<>();
        for (ZoneSeed seed : municipality.zones()) {
            codes.add(seed.districtCode());
        }
        Map<String, UUID> byCode = new HashMap<>();
        List<AdministrativeDivision> divisions = divisionRepository.findByCountryCodeAndLevelAndCodeIn(
                countryCode, DevMunicipalities.DISTRICT_LEVEL, codes);
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
     *
     * <p>Prices differ between municipalities on purpose. A quote for the same duration in two of them
     * coming back with two different amounts is the cheapest possible proof that pricing is resolved
     * per tenant and not from a constant.</p>
     */
    private void ensureRates(Tenant tenant, DevMunicipality municipality, List<ParkingZone> zones) {
        Instant now = clock.instant();
        int created = 0;
        for (int index = 0; index < zones.size(); index++) {
            ParkingZone zone = zones.get(index);
            if (rateRepository.countByTenantIdAndZoneId(tenant.getId(), zone.getId()) > 0) {
                continue;
            }
            ZoneSeed seed = municipality.zones().get(index);
            try {
                Money amount = Money.ofMajor(BigDecimal.valueOf(seed.hourlyMajor()), tenant.getCurrencyCode());
                rateRepository.save(new ParkingRate(Uuid7.generate(), tenant.getId(), zone.getId(),
                        RateKind.BLOCK, amount, RATE_MINUTES, now, null, now));
                created++;
            } catch (RuntimeException exception) {
                // A currency the JDK does not know, or one whose fraction digits the amount does not
                // fit. The fixture is worth less without a tariff, but not worth a failed start.
                LOGGER.warn("Development seed: no tariff for zone {} ({}).", zone.getCode(), exception.toString());
            }
        }
        if (created > 0) {
            LOGGER.info("Development seed: {} — {} hourly tariffs created in {}.", municipality.slug(), created,
                    tenant.getCurrencyCode());
        }
    }

    // --- spaces ----------------------------------------------------------------------------------

    private void ensureSpaces(Tenant tenant, DevMunicipality municipality, List<ParkingZone> zones,
                              int target) {
        if (target <= 0) {
            return;
        }
        long existing = spaceRepository.countByTenantId(tenant.getId());
        if (existing >= target) {
            LOGGER.info("Development seed: {} — {} bays already present (target {}); nothing to do.",
                    municipality.slug(), existing, target);
            return;
        }

        // The codes are generated from the municipality's OWN stored format, not from the fixture
        // constants, so a bay the seeder writes is always one that municipality would accept — at
        // POST /admin/parking/spaces and at the moment a citizen types it.
        ParkingSpaceFormat format = spaceFormatService.require(TenantId.of(tenant.getId()));
        long startedAt = System.nanoTime();
        Integer inserted = transactionTemplate.execute(
                status -> insertMissingSpaces(tenant, municipality, zones, target, format));
        long created = inserted == null ? 0L : inserted.longValue();
        long millis = (System.nanoTime() - startedAt) / 1_000_000L;
        LOGGER.info("Development seed: {} — {} bays created in {} ms ({} in total, codes {} to {}, pattern {}).",
                municipality.slug(), created, millis, existing + created,
                code(format, 1L), code(format, target), format.getPattern());
    }

    /**
     * Reads the codes already present once, then inserts every missing one in batches. Everything here
     * runs inside the caller's transaction, so an interrupted start leaves either all of this run's
     * bays or none of them — never a half-dealt block.
     */
    private int insertMissingSpaces(Tenant tenant, DevMunicipality municipality, List<ParkingZone> zones,
                                    int target, ParkingSpaceFormat format) {
        Set<String> present =
                new HashSet<>(jdbcTemplate.queryForList(SELECT_CODES_SQL, String.class, tenant.getId()));
        OffsetDateTime now = OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
        String available = ParkingSpaceStatus.AVAILABLE.name();

        int totalShare = 0;
        for (ZoneSeed seed : municipality.zones()) {
            totalShare += seed.share();
        }

        List<Object[]> batch = new ArrayList<>(BATCH_SIZE);
        int inserted = 0;
        long cumulative = 0L;
        for (int index = 0; index < zones.size(); index++) {
            UUID zoneId = zones.get(index).getId();
            long blockStart = (long) target * cumulative / totalShare + 1L;
            cumulative += municipality.zones().get(index).share();
            long blockEnd = (long) target * cumulative / totalShare;
            for (long number = blockStart; number <= blockEnd; number++) {
                String code = code(format, number);
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
     * The code painted on bay {@code number}, built from the municipality's own stored format.
     *
     * <p>Zero-padded to the width that format declares and carrying its own prefix, so San José gets
     * {@code 0001} and Escazú {@code E-0001}. Reading the width from the row rather than from the
     * fixture constants is what guarantees the codes match: seeding a code the municipality itself
     * would refuse is the one mistake this fixture must not make.</p>
     */
    private static String code(ParkingSpaceFormat format, long number) {
        return format.getPrefix() + String.format(Locale.ROOT, "%0" + format.getDigits() + "d", number);
    }
}
