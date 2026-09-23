package cr.luparx.app.config;

import cr.luparx.core.domain.Portal;
import cr.luparx.core.domain.Role;
import cr.luparx.core.email.EmailAddress;
import cr.luparx.core.i18n.CountryCodes;
import cr.luparx.core.id.UserId;
import cr.luparx.geo.entity.AdministrativeDivision;
import cr.luparx.geo.model.IdentityDocumentTypeCode;
import cr.luparx.geo.repository.AdministrativeDivisionRepository;
import cr.luparx.geo.service.PhoneNumberService;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.repository.UserRepository;
import cr.luparx.identity.service.EmailVerificationService;
import cr.luparx.identity.service.RegistrationCommand;
import cr.luparx.identity.service.UserRegistrationService;
import cr.luparx.core.id.TenantId;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.entity.TenantMembership;
import cr.luparx.tenancy.model.MembershipStatus;
import cr.luparx.tenancy.model.SelfRegistrationPolicy;
import cr.luparx.tenancy.model.TenantBranding;
import cr.luparx.tenancy.model.TenantStatus;
import cr.luparx.tenancy.repository.TenantMembershipRepository;
import cr.luparx.tenancy.repository.TenantRepository;
import cr.luparx.tenancy.service.MembershipService;
import cr.luparx.tenancy.service.TenantService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

import cr.luparx.app.config.DevMunicipalities.DevMunicipality;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Creates the launch municipality, one account per portal, and — through {@link DevParkingSeeder} —
 * the zones, tariffs and numbered bays that municipality operates, so a developer can log in and
 * exercise a real flow on a fresh database. Development only, twice over: the bean exists solely
 * under the {@code dev} profile and can still be switched off with
 * {@code luparx.dev.seed-demo-data=false}.
 *
 * <p>Idempotent by construction. Every step first asks whether the row already exists (tenant by
 * slug, user by email, membership by tenant+user+portal) and does nothing when it does, so the
 * seeder runs on every start without duplicating anything and without failing on the second one.
 * A single account that cannot be created — a catalogue that does not offer the document type used
 * here, or an administrative tree the deployment default country has no rows for — is logged and
 * skipped rather than allowed to break startup.</p>
 *
 * <p>There is exactly one municipality. The placeholder tenant earlier revisions of this fixture
 * created ({@value #LEGACY_TENANT_SLUG}) is closed rather than deleted when it is found: a tenant is
 * never removed — its memberships, audit rows and ledgers reference it — but leaving it ACTIVE would
 * show a developer two municipalities where the product has one. A database created after this
 * change simply never has it.</p>
 *
 * <p>Closing it is not sufficient, and that is what {@link #repairMemberships} is for: an account
 * seeded before San José existed keeps its membership in the closed municipality, gains one in San
 * José, and ends up with two — which leaves its session with no municipality selected and every
 * tenant-owned endpoint refusing the call. The repair revokes the membership that can no longer grant
 * anything, so every seeded account ends each start with exactly one usable membership, in the active
 * municipality. It is idempotent and does nothing on a database that never had the legacy tenant.</p>
 *
 * <p>Nothing here is written with SQL or by assembling entities by hand: the accounts go through
 * {@link UserRegistrationService}, the address chain comes from the divisions actually seeded in the
 * migrations, the password is hashed by the real {@code PasswordService} behind the registration
 * service, and the memberships are granted by {@link MembershipService}. What the seeder produces is
 * therefore exactly what a real registration produces — a fixture that lies about the domain would
 * be worse than no fixture at all.</p>
 *
 * <p>The country, currency, locale and time zone of the municipality are read from
 * {@code platform.defaults.*}: no market is assumed here either (CONTRACT.md §7). San José is seed
 * DATA — a real customer to develop against — and a deployment elsewhere changes the constants below,
 * never a line of domain logic.</p>
 */
@Component
// `demo` es el mismo sembrado en una instancia publicada, pero sin las concesiones de `dev`
// (llaves efímeras, pepper del repositorio, SQL en el log). Ver application-demo.yml.
@Profile({"dev", "demo"})
@ConditionalOnProperty(prefix = "luparx.dev", name = "seed-demo-data", havingValue = "true", matchIfMissing = true)
public class DevDataSeeder implements ApplicationRunner {

    private static final Logger LOGGER = LoggerFactory.getLogger(DevDataSeeder.class);

    /** The launch municipality. Seed data, not an assumption: see the class javadoc. */
    private static final String TENANT_SLUG = "san-jose";
    private static final String TENANT_LEGAL_NAME = "Municipalidad de San José";
    private static final String TENANT_DISPLAY_NAME = "San José";

    /** The placeholder municipality earlier revisions created; closed on sight, never deleted. */
    private static final String LEGACY_TENANT_SLUG = "demo-municipality";
    /** Written on the membership the repair below retires, so the row says why it was retired. */
    private static final String ORPHANED_MEMBERSHIP_REASON =
            "Municipality is closed; the development account was moved to the active one.";
    private static final String LEGACY_TENANT_REASON =
            "Replaced by the San José development seed; closed so only one municipality is active.";

    /** Well-known and intentionally weak: it is printed to the console on every start. */
    private static final String PASSWORD = "Password123!";
    private static final LocalDate BIRTH_DATE = LocalDate.of(1990, 1, 1);
    private static final String ADDRESS_LINE1 = "1 Development Street";

    /**
     * A passport is the one document kind every seeded country offers with a permissive pattern, so
     * the same synthetic numbers stay valid whatever {@code platform.defaults.country-code} is.
     */
    private static final IdentityDocumentTypeCode DOCUMENT_TYPE = IdentityDocumentTypeCode.PASSPORT;

    /**
     * The original four accounts, all of them in the launch municipality. Unchanged: a developer who
     * has these memorised keeps them working exactly as before.
     */
    private static final List<DemoAccount> ACCOUNTS = List.of(
            new DemoAccount("citizen@luparx.test", "Dev", "Citizen", Portal.CITIZEN, Role.CITIZEN, "DEV000001"),
            new DemoAccount("admin@luparx.test", "Dev", "Admin", Portal.ADMIN, Role.TENANT_ADMIN, "DEV000002"),
            new DemoAccount("inspector@luparx.test", "Dev", "Inspector", Portal.INSPECTOR, Role.INSPECTOR,
                    "DEV000003"),
            new DemoAccount("platform@luparx.test", "Dev", "Platform", Portal.PLATFORM, Role.PLATFORM_ADMIN,
                    "DEV000004"));

    /**
     * The three citizens the fixture exists for, each carrying a different amount of money and a
     * different number of municipalities.
     *
     * <p><b>Ana belongs to three municipalities</b>, which is the only way to exercise two things that
     * cannot be reached with a single-tenant account: switching the active municipality
     * ({@code POST /citizen/session/tenant}) and the {@code TENANT_CONTEXT_REQUIRED} answer a session
     * gets before one is chosen. Bruno and Carla belong to one each, so their sessions resolve a
     * municipality automatically and the ordinary flow stays one call away.</p>
     *
     * <p>The wallet is <b>per municipality</b> (CONTRACT.md v0.2, rule 6): Ana's three balances are
     * three separate accounts and spending in one leaves the others untouched. The amounts are round
     * so that a total is readable at a glance in a ledger, and they are declared in MAJOR units of
     * whatever currency the municipality was configured with.</p>
     */
    /**
     * An ORDERED map of municipality slug to opening balance. {@code Map.of} would not do: its
     * iteration order is deliberately unspecified, and the first entry decides which municipality the
     * account is registered against.
     */
    private static Map<String, Long> balances(Object... pairs) {
        Map<String, Long> ordered = new LinkedHashMap<>();
        for (int index = 0; index < pairs.length; index += 2) {
            ordered.put((String) pairs[index], (Long) pairs[index + 1]);
        }
        return ordered;
    }

    private static final List<DemoCitizen> CITIZENS = List.of(
            new DemoCitizen("ana.morales@luparx.test", "Ana", "Morales", "DEV100001",
                    balances("san-jose", 150_000L, "escazu", 100_000L, "montes-de-oca", 50_000L),
                    "high balance, member of three municipalities"),
            new DemoCitizen("bruno.castro@luparx.test", "Bruno", "Castro", "DEV100002",
                    balances("cartago", 20_000L),
                    "medium balance, one municipality"),
            new DemoCitizen("carla.jimenez@luparx.test", "Carla", "Jiménez", "DEV100003",
                    balances("la-union", 2_000L),
                    "low balance, one municipality — the account that runs into INSUFFICIENT_BALANCE"));

    private final PlatformDefaultsProperties defaults;
    private final TenantService tenantService;
    private final TenantRepository tenantRepository;
    private final UserRegistrationService registrationService;
    private final EmailVerificationService emailVerificationService;
    private final UserRepository userRepository;
    private final MembershipService membershipService;
    private final TenantMembershipRepository membershipRepository;
    private final AdministrativeDivisionRepository divisionRepository;
    private final PhoneNumberService phoneNumberService;
    private final DevParkingSeeder parkingSeeder;
    private final DevActivitySeeder activitySeeder;
    private final DevEnforcementSeeder enforcementSeeder;
    private final DevSeedProperties properties;
    /**
     * El andamio visual del Inicio, cuando está encendido.
     *
     * <p>{@code ObjectProvider} y no una dependencia normal: ese bean sólo existe cuando
     * {@code luparx.dev.seed-dashboard-demo} vale {@code true}, y exigirlo siempre convertiría una
     * bandera apagada en un arranque fallido.</p>
     */
    private final ObjectProvider<DevDashboardSeeder> dashboardSeeder;

    public DevDataSeeder(PlatformDefaultsProperties defaults,
                         TenantService tenantService,
                         TenantRepository tenantRepository,
                         UserRegistrationService registrationService,
                         EmailVerificationService emailVerificationService,
                         UserRepository userRepository,
                         MembershipService membershipService,
                         TenantMembershipRepository membershipRepository,
                         AdministrativeDivisionRepository divisionRepository,
                         PhoneNumberService phoneNumberService,
                         DevParkingSeeder parkingSeeder,
                         DevActivitySeeder activitySeeder,
                         DevEnforcementSeeder enforcementSeeder,
                         DevSeedProperties properties,
                         ObjectProvider<DevDashboardSeeder> dashboardSeeder) {
        this.defaults = defaults;
        this.tenantService = tenantService;
        this.tenantRepository = tenantRepository;
        this.registrationService = registrationService;
        this.emailVerificationService = emailVerificationService;
        this.userRepository = userRepository;
        this.membershipService = membershipService;
        this.membershipRepository = membershipRepository;
        this.divisionRepository = divisionRepository;
        this.phoneNumberService = phoneNumberService;
        this.parkingSeeder = parkingSeeder;
        this.activitySeeder = activitySeeder;
        this.enforcementSeeder = enforcementSeeder;
        this.properties = properties;
        this.dashboardSeeder = dashboardSeeder;
    }

    @Override
    public void run(ApplicationArguments args) {
        String countryCode = CountryCodes.normalize(defaults.countryCode());
        List<DemoAccount> available = new ArrayList<>();
        try {
            retireLegacyTenant();
            AddressChain address = resolveAddressChain(countryCode);
            String phoneNumber = phoneNumberService.exampleNationalNumber(countryCode);

            // Every municipality of the fixture, launch one first. They are created before any account
            // so that a citizen who belongs to three of them can be given all three memberships in one
            // pass, rather than being revisited as each municipality appears.
            Map<String, Tenant> tenants = new LinkedHashMap<>();
            for (DevMunicipality municipality : DevMunicipalities.all()) {
                tenants.put(municipality.slug(), ensureTenant(municipality, countryCode));
            }
            Tenant launchTenant = tenants.get(DevMunicipalities.SAN_JOSE.slug());

            for (DemoAccount account : ACCOUNTS) {
                try {
                    seed(account, launchTenant, countryCode, address, phoneNumber);
                    available.add(account);
                } catch (RuntimeException exception) {
                    LOGGER.warn("Development seed: {} could not be created ({}). Continuing.",
                            account.email(), exception.toString());
                }
            }
            seedStaff(tenants, countryCode, address, phoneNumber);
            Map<String, UserId> citizens = seedCitizens(tenants, countryCode, address, phoneNumber);
            seedParking(tenants);
            seedActivity(tenants, citizens);
        } catch (RuntimeException exception) {
            // A broken fixture must never stop the application from starting.
            LOGGER.warn("Development seed skipped: {}", exception.toString());
            return;
        }
        announce(available);
    }

    /**
     * A municipal administrator and an inspector for every municipality, with predictable addresses:
     * {@code admin.<slug>@luparx.test} and {@code inspector.<slug>@luparx.test}.
     *
     * <p>The launch municipality keeps its original {@code admin@luparx.test} and
     * {@code inspector@luparx.test} <em>as well</em>, so nothing a developer already had memorised
     * stops working. Staff are seeded per municipality rather than given access to all of them
     * because that is how a municipality actually works, and because an administrator who could see
     * every municipality would make cross-tenant leaks invisible in development.</p>
     */
    private void seedStaff(Map<String, Tenant> tenants, String countryCode, AddressChain address,
                           String phoneNumber) {
        int document = 200_001;
        for (DevMunicipality municipality : DevMunicipalities.ADDITIONAL) {
            Tenant tenant = tenants.get(municipality.slug());
            for (StaffRole role : StaffRole.values()) {
                DemoAccount account = new DemoAccount(
                        role.emailOf(municipality),
                        role.givenName(),
                        municipality.displayName(),
                        role.portal(),
                        role.role(),
                        "DEV" + (document++));
                try {
                    seed(account, tenant, countryCode, address, phoneNumber);
                } catch (RuntimeException exception) {
                    LOGGER.warn("Development seed: {} could not be created ({}). Continuing.",
                            account.email(), exception.toString());
                }
            }
        }
    }

    /**
     * The three citizens, each with a membership in every municipality their wallet names.
     *
     * @return the user id of each seeded citizen by email, for whoever writes their history
     */
    private Map<String, UserId> seedCitizens(Map<String, Tenant> tenants, String countryCode,
                                             AddressChain address, String phoneNumber) {
        Map<String, UserId> seeded = new LinkedHashMap<>();
        for (DemoCitizen citizen : CITIZENS) {
            try {
                // Registered against the first municipality on their list; the rest are granted below,
                // exactly as a back-office would add them.
                String firstSlug = citizen.openingBalances().keySet().iterator().next();
                DemoAccount account = new DemoAccount(citizen.email(), citizen.givenName(),
                        citizen.familyName(), Portal.CITIZEN, Role.CITIZEN, citizen.documentNumber());
                UserId userId = ensureUser(account, tenants.get(firstSlug), countryCode, address, phoneNumber);
                ensureEmailVerified(userId);
                for (String slug : citizen.openingBalances().keySet()) {
                    ensureMembership(account, tenants.get(slug), userId);
                }
                seeded.put(citizen.email(), userId);
                LOGGER.info("Development seed: citizen {} — {} ({}).", citizen.email(), citizen.exercises(),
                        String.join(", ", citizen.openingBalances().keySet()));
            } catch (RuntimeException exception) {
                LOGGER.warn("Development seed: {} could not be created ({}). Continuing.",
                        citizen.email(), exception.toString());
            }
        }
        return seeded;
    }

    // --- steps -----------------------------------------------------------------------------------

    /**
     * Closes the placeholder municipality of earlier revisions if this database still has it. Closing
     * rather than deleting is not caution about foreign keys alone — a municipality is a soft
     * lifecycle by contract (CONTRACT.md §4), so the fixture uses the same transition the back-office
     * would. Accounts keep their old membership and gain one in San José, which is harmless.
     */
    private void retireLegacyTenant() {
        tenantRepository.findBySlug(LEGACY_TENANT_SLUG)
                .filter(legacy -> legacy.getStatus() != TenantStatus.CLOSED)
                .ifPresent(legacy -> {
                    tenantService.changeStatus(legacy.getTenantId(), TenantStatus.CLOSED, LEGACY_TENANT_REASON, null);
                    LOGGER.warn("Development seed: legacy municipality '{}' closed; '{}' is now the only active one.",
                            LEGACY_TENANT_SLUG, TENANT_SLUG);
                });
    }

    /**
     * Zones, tariffs, policies, timetables, code formats and bays, for every municipality. Isolated
     * from the accounts on purpose: a parking fixture that fails is worth a warning, never the loss of
     * the credentials a developer needs to log in at all.
     *
     * <p>The launch municipality gets {@code luparx.dev.parking-spaces} bays of its own; the others
     * share {@code luparx.dev.parking-spaces-total} between them, dealt by weight. Five municipalities
     * with five thousand bays each would be a load test, not a fixture.</p>
     */
    private void seedParking(Map<String, Tenant> tenants) {
        Map<String, Integer> targets = resolveSpaceTargets();
        for (DevMunicipality municipality : DevMunicipalities.all()) {
            Tenant tenant = tenants.get(municipality.slug());
            if (tenant == null) {
                continue;
            }
            try {
                parkingSeeder.seed(tenant, municipality, targets.getOrDefault(municipality.slug(),
                        Integer.valueOf(0)).intValue());
            } catch (RuntimeException exception) {
                LOGGER.warn("Development seed: parking fixture skipped for {} ({}).", municipality.slug(),
                        exception.toString());
            }
        }
    }

    /**
     * How many bays each municipality gets.
     *
     * <p>The launch one is unchanged and keeps its own property. The rest split a pool in proportion
     * to their weight, with the boundaries computed from the cumulative share so the split is exact:
     * every bay of the pool is handed out and none twice.</p>
     */
    private Map<String, Integer> resolveSpaceTargets() {
        Map<String, Integer> targets = new LinkedHashMap<>();
        targets.put(DevMunicipalities.SAN_JOSE.slug(), Integer.valueOf(resolveCount(properties.parkingSpaces(),
                DevSeedProperties.DEFAULT_PARKING_SPACES, "luparx.dev.parking-spaces")));

        int pool = resolveCount(properties.parkingSpacesTotal(), DevSeedProperties.DEFAULT_PARKING_SPACES_TOTAL,
                "luparx.dev.parking-spaces-total");
        int totalShare = 0;
        for (DevMunicipality municipality : DevMunicipalities.ADDITIONAL) {
            totalShare += municipality.spaceShare();
        }
        long cumulative = 0L;
        for (DevMunicipality municipality : DevMunicipalities.ADDITIONAL) {
            long from = (long) pool * cumulative / totalShare;
            cumulative += municipality.spaceShare();
            long to = (long) pool * cumulative / totalShare;
            targets.put(municipality.slug(), Integer.valueOf((int) (to - from)));
        }
        LOGGER.info("Development seed: bays per municipality {}.", targets);
        return targets;
    }

    /**
     * A configured count, defaulted when absent and clamped when absurd. Silently ignoring what a
     * developer configured is how a fixture becomes confusing, so the clamp is said out loud.
     */
    private int resolveCount(Integer configured, int fallback, String property) {
        if (configured == null || configured.intValue() <= 0) {
            return fallback;
        }
        if (configured.intValue() > DevSeedProperties.MAXIMUM_PARKING_SPACES) {
            LOGGER.warn("Development seed: {}={} exceeds the maximum {}; using the maximum.", property,
                    configured, DevSeedProperties.MAXIMUM_PARKING_SPACES);
            return DevSeedProperties.MAXIMUM_PARKING_SPACES;
        }
        return configured.intValue();
    }

    /**
     * Vehicles, past and running sessions, wallet movements and minute credits. Last, because it is
     * the only step that needs everything else to exist, and isolated for the same reason as the
     * parking fixture: history is the most expendable part of a fixture and must never cost a start.
     */
    private void seedActivity(Map<String, Tenant> tenants, Map<String, UserId> citizens) {
        try {
            activitySeeder.seed(tenants, citizens, CITIZENS);
        } catch (RuntimeException exception) {
            LOGGER.warn("Development seed: activity fixture skipped ({}).", exception.toString());
        }
        // Enforcement last of all: it needs the zones, the bays, the officers and the vehicles that
        // every step above created. Isolated for the same reason as the rest — a fixture must never
        // be able to stop the application from starting.
        try {
            enforcementSeeder.seed(tenants, citizens);
        } catch (RuntimeException exception) {
            LOGGER.warn("Development seed: enforcement fixture skipped ({}).", exception.toString());
        }
        // Y al final del todo, si alguien lo encendió: los pagos y la ocupación que hacen mirable la
        // portada del administrador. Va acá y no como su propio ApplicationRunner para no depender
        // del orden en que Spring los llame: necesita las zonas y las bahías que creó todo lo de
        // arriba.
        dashboardSeeder.ifAvailable(seeder -> {
            try {
                seeder.seed(tenants, citizenUserId());
            } catch (RuntimeException exception) {
                LOGGER.warn("Development seed: dashboard demo data skipped ({}).", exception.toString());
            }
        });
    }

    /**
     * The development citizen, resolved by email rather than remembered from the loop above: the
     * account may already have existed from an earlier start, in which case nothing was created for
     * it this time and there is no id to carry.
     *
     * @return null when the account could not be created at all, which the parking seeder handles
     */
    private UUID citizenUserId() {
        for (DemoAccount account : ACCOUNTS) {
            if (account.portal() != Portal.CITIZEN) {
                continue;
            }
            User user = userRepository.findByEmail(EmailAddress.normalize(account.email())).orElse(null);
            if (user != null) {
                return user.getId();
            }
        }
        return null;
    }

    /**
     * One municipality of the fixture, created if this database does not have it yet.
     *
     * <p>Country, currency, locale and time zone come from {@code platform.defaults.*}, exactly as
     * before: the fixture names municipalities, it does not decide what market the deployment serves
     * (CONTRACT.md §7).</p>
     */
    private Tenant ensureTenant(DevMunicipality municipality, String countryCode) {
        Optional<Tenant> existing = tenantRepository.findBySlug(municipality.slug());
        if (existing.isPresent()) {
            return ensureBranding(existing.get(), municipality);
        }
        return tenantService.create(municipality.slug(), municipality.legalName(), municipality.displayName(),
                countryCode, defaults.currencyCode(), defaults.locale(), defaults.timeZone(),
                SelfRegistrationPolicy.APPROVAL_REQUIRED, brandingOf(municipality), null);
    }

    /**
     * Gives a municipality seeded before V14_0 the visual identity the picker needs, once.
     *
     * <p>Only when it has none: a developer who set a colour or uploaded an emblem from the admin
     * portal keeps it, which is what makes this safe to run on every start. The logo is the
     * <b>generated monogram</b> and never a real coat of arms — a municipal emblem belongs to the
     * municipality and is uploaded by them.</p>
     */
    private Tenant ensureBranding(Tenant tenant, DevMunicipality municipality) {
        if (tenant.getLogoAssetKey() != null || tenant.getBrandColor() != null) {
            return tenant;
        }
        Tenant rebranded = tenantService.rebrand(tenant.getTenantId(), brandingOf(municipality), null);
        LOGGER.info("Development seed: {} had no visual identity; gave it the generated monogram over {}.",
                municipality.slug(), municipality.brandColor());
        return rebranded;
    }

    private static TenantBranding brandingOf(DevMunicipality municipality) {
        return new TenantBranding(TenantBranding.GENERATED_MONOGRAM, municipality.brandColor(),
                municipality.shortName());
    }

    private void seed(DemoAccount account, Tenant tenant, String countryCode, AddressChain address,
                      String phoneNumber) {
        UserId userId = ensureUser(account, tenant, countryCode, address, phoneNumber);
        ensureEmailVerified(userId);
        ensureMembership(account, tenant, userId);
        repairMemberships(account, tenant, userId);
    }

    /**
     * Leaves every seeded account with <b>exactly one</b> usable membership: an active one in the
     * active municipality.
     *
     * <p><b>Why this exists.</b> Databases created before San José did have their development accounts
     * in {@value #LEGACY_TENANT_SLUG}, and {@link #retireLegacyTenant()} closes that municipality on
     * the next start. Adding the San José membership — which {@link #ensureMembership} does — is not
     * enough on its own: the account is then left holding <em>two</em> ACTIVE memberships on the same
     * portal, one of them pointing at a closed municipality. A session with two municipalities to
     * choose from starts with none selected, so the token carries no {@code tid}, no roles and no
     * permissions, and every tenant-owned endpoint answers "access denied" — for an account that in
     * truth belongs to exactly one municipality. The account is not broken, it is <em>orphaned</em>,
     * and nothing short of editing the database by hand would have unstuck it.</p>
     *
     * <p>So the membership that can no longer grant anything is revoked, with a reason that says why.
     * Revoked and not deleted: a membership is history, and the fixture uses the same transition the
     * back-office would.</p>
     *
     * <p>Idempotent, like everything else here: on a database that never had the legacy municipality
     * there is nothing to revoke and this does nothing at all. It runs only under the {@code dev}
     * profile, because it is a repair of <em>development fixtures</em> — a real deployment's
     * memberships are somebody's decision and are never rewritten on start. The equivalent for a real
     * environment is not a silent repair but an explicit answer, which is what
     * {@code NO_ACTIVE_MEMBERSHIP} is for.</p>
     */
    private void repairMemberships(DemoAccount account, Tenant tenant, UserId userId) {
        if (account.portal() == Portal.PLATFORM) {
            // A platform membership is not bound to a municipality, so it cannot be orphaned by one.
            return;
        }
        for (TenantMembership membership : membershipRepository.findByUserId(userId.value())) {
            if (membership.getPortal() != account.portal()
                    || membership.getStatus() != MembershipStatus.ACTIVE
                    || membership.getTenantId() == null
                    || membership.getTenantId().equals(tenant.getId())) {
                continue;
            }
            boolean stillOpen = tenantRepository.findById(membership.getTenantId())
                    .map(other -> other.getStatus().allowsAccess())
                    .orElse(Boolean.FALSE)
                    .booleanValue();
            if (stillOpen) {
                // Another municipality that is genuinely open: a legitimate second membership, and
                // choosing between them is the person's business, not the fixture's.
                continue;
            }
            membershipService.revoke(membership.getId(), TenantId.of(membership.getTenantId()),
                    ORPHANED_MEMBERSHIP_REASON);
            LOGGER.warn("Development seed: {} still held an active membership in a closed municipality;"
                            + " revoked it so the account belongs only to '{}'.",
                    account.email(), TENANT_SLUG);
        }
    }

    private UserId ensureUser(DemoAccount account, Tenant tenant, String countryCode, AddressChain address,
                              String phoneNumber) {
        Optional<User> existing = userRepository.findByEmail(EmailAddress.normalize(account.email()));
        if (existing.isPresent()) {
            return existing.get().userId();
        }
        RegistrationCommand command = new RegistrationCommand(
                account.givenName(),
                account.familyName(),
                null,
                countryCode,
                DOCUMENT_TYPE,
                account.documentNumber(),
                countryCode,
                address.level1Id(),
                address.level2Id(),
                address.level3Id(),
                ADDRESS_LINE1,
                null,
                null,
                countryCode,
                phoneNumber,
                countryCode,
                account.email(),
                BIRTH_DATE,
                PASSWORD,
                defaults.locale(),
                defaults.timeZone(),
                defaults.termsVersion(),
                tenant.getId(),
                // ALWAYS citizen, whatever portal this account is for.
                //
                // Registration is self-registration, and since v0.13 only the citizen portal allows it
                // (`Portal.selfRegistrationAllowed`): admin, inspector and platform accounts are
                // granted from the back-office. Passing their own portal here makes
                // UserRegistrationService throw SELF_REGISTRATION_DISABLED, the per-account catch in
                // seed() logs a warning, and the fixture quietly ends up WITHOUT an administrator,
                // WITHOUT an inspector and without any municipal staff — which is exactly what
                // happened on the first database created after that rule landed. It went unnoticed for
                // as long as it did because existing databases already had those rows.
                //
                // This mirrors what the platform actually does (see AuthController#register): a person
                // who is to become a municipal admin or an inspector registers as themselves, like
                // anyone else, and what the back-office adds afterwards is the MEMBERSHIP — which
                // ensureMembership() below creates with the real portal and role, ACTIVE.
                Portal.CITIZEN);
        return registrationService.register(command).userId();
    }

    /**
     * Consumes a freshly issued verification token instead of writing the column directly, so the
     * account ends up in the same state a person reaches by clicking the link in their email.
     */
    private void ensureEmailVerified(UserId userId) {
        User user = userRepository.findById(userId.value()).orElse(null);
        if (user == null || user.isEmailVerified()) {
            return;
        }
        emailVerificationService.verify(emailVerificationService.issueToken(userId));
    }

    private void ensureMembership(DemoAccount account, Tenant tenant, UserId userId) {
        if (account.portal() == Portal.PLATFORM) {
            // A platform membership belongs to the operator of the product, never to a municipality
            // (CONTRACT.md §0), so its tenant is null and its uniqueness is per user.
            boolean alreadyGranted = membershipRepository.findByUserId(userId.value()).stream()
                    .anyMatch(membership -> membership.getPortal() == Portal.PLATFORM);
            if (!alreadyGranted) {
                membershipService.create(userId, null, Portal.PLATFORM, account.role(), MembershipStatus.ACTIVE);
            }
            return;
        }
        boolean alreadyGranted = membershipRepository
                .findByTenantIdAndUserIdAndPortal(tenant.getId(), userId.value(), account.portal())
                .isPresent();
        if (!alreadyGranted) {
            // ACTIVE on purpose: a seeded account waiting for an approval nobody can give would be
            // useless. This is the administrative grant path, not self-registration.
            membershipService.create(userId, tenant.getTenantId(), account.portal(), account.role(),
                    MembershipStatus.ACTIVE);
        }
    }

    // --- helpers ---------------------------------------------------------------------------------

    /**
     * Walks the administrative tree of the configured default country down to three levels, taking
     * the first active division at each level. Nothing about a particular country is assumed: a
     * country whose tree stops at level 2 simply yields a two-level address.
     */
    /**
     * The two staff roles every municipality gets. An enum rather than two literal accounts so that
     * adding a municipality cannot leave one of them behind.
     */
    private enum StaffRole {

        ADMIN("admin", "Admin", Portal.ADMIN, Role.TENANT_ADMIN),
        INSPECTOR("inspector", "Inspector", Portal.INSPECTOR, Role.INSPECTOR);

        private final String localPart;
        private final String givenName;
        private final Portal portal;
        private final Role role;

        StaffRole(String localPart, String givenName, Portal portal, Role role) {
            this.localPart = localPart;
            this.givenName = givenName;
            this.portal = portal;
            this.role = role;
        }

        String emailOf(DevMunicipality municipality) {
            return localPart + "." + municipality.slug() + "@luparx.test";
        }

        String givenName() {
            return givenName;
        }

        Portal portal() {
            return portal;
        }

        Role role() {
            return role;
        }
    }

    private AddressChain resolveAddressChain(String countryCode) {
        PageRequest firstOne = PageRequest.of(0, 1);
        UUID level1Id = divisionRepository
                .findByCountryCodeAndParentIdIsNullAndActiveTrueOrderByNameAsc(countryCode, firstOne)
                .stream().findFirst().map(AdministrativeDivision::getId).orElse(null);
        UUID level2Id = level1Id == null ? null : divisionRepository
                .findByCountryCodeAndParentIdAndActiveTrueOrderByNameAsc(countryCode, level1Id, firstOne)
                .stream().findFirst().map(AdministrativeDivision::getId).orElse(null);
        UUID level3Id = level2Id == null ? null : divisionRepository
                .findByCountryCodeAndParentIdAndActiveTrueOrderByNameAsc(countryCode, level2Id, firstOne)
                .stream().findFirst().map(AdministrativeDivision::getId).orElse(null);
        return new AddressChain(level1Id, level2Id, level3Id);
    }

    /**
     * Printed at WARN so it is impossible to miss in a console and impossible to ignore in a log
     * aggregator: these credentials are public knowledge and must never exist anywhere but a laptop.
     */
    private void announce(List<DemoAccount> accounts) {
        if (accounts.isEmpty()) {
            LOGGER.warn("Development seed produced no account. Check the warnings above.");
            return;
        }
        LOGGER.warn("=================================================================================");
        LOGGER.warn("DEMO SEED DATA — these accounts and their passwords are written in the repository");
        LOGGER.warn("and must NEVER exist alongside real data. Profiles 'dev' and 'demo' only; disable");
        LOGGER.warn("with luparx.dev.seed-demo-data=false.");
        for (DemoAccount account : accounts) {
            LOGGER.warn("  portal={} email={} password={}", account.portal().slug(), account.email(), PASSWORD);
        }
        for (DemoCitizen citizen : CITIZENS) {
            LOGGER.warn("  portal=citizen email={} password={} — {}", citizen.email(), PASSWORD,
                    citizen.exercises());
        }
        for (DevMunicipality municipality : DevMunicipalities.ADDITIONAL) {
            LOGGER.warn("  portal=admin/inspector email={} / {} password={}", municipality.adminEmail(),
                    municipality.inspectorEmail(), PASSWORD);
        }
        LOGGER.warn("Municipalities: {}", DevMunicipalities.all().stream().map(DevMunicipality::slug).toList());
        LOGGER.warn("=================================================================================");
    }

    /** One seeded account: who they are, which portal they belong to and with which role. */
    private record DemoAccount(String email, String givenName, String familyName, Portal portal, Role role,
                               String documentNumber) {
    }

    /**
     * One seeded citizen.
     *
     * @param openingBalances municipality slug to opening top-up, in MAJOR units of that
     *                        municipality's currency. The iteration order is the declaration order,
     *                        and its first entry is the municipality the account is registered
     *                        against; the rest are granted as additional memberships.
     * @param exercises       one sentence naming what this account is for, printed on every start
     */
    record DemoCitizen(String email, String givenName, String familyName, String documentNumber,
                       Map<String, Long> openingBalances, String exercises) {

        DemoCitizen {
            // LinkedHashMap: which municipality comes first decides where the account is registered,
            // so the order has to survive being copied.
            openingBalances = java.util.Collections.unmodifiableMap(new LinkedHashMap<>(openingBalances));
        }
    }

    /** The administrative divisions used for the seeded address; deeper levels may be null. */
    private record AddressChain(UUID level1Id, UUID level2Id, UUID level3Id) {
    }
}
