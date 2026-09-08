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
import cr.luparx.tenancy.model.TenantStatus;
import cr.luparx.tenancy.repository.TenantMembershipRepository;
import cr.luparx.tenancy.repository.TenantRepository;
import cr.luparx.tenancy.service.MembershipService;
import cr.luparx.tenancy.service.TenantService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
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
@Profile("dev")
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

    private static final List<DemoAccount> ACCOUNTS = List.of(
            new DemoAccount("citizen@luparx.test", "Dev", "Citizen", Portal.CITIZEN, Role.CITIZEN, "DEV000001"),
            new DemoAccount("admin@luparx.test", "Dev", "Admin", Portal.ADMIN, Role.TENANT_ADMIN, "DEV000002"),
            new DemoAccount("inspector@luparx.test", "Dev", "Inspector", Portal.INSPECTOR, Role.INSPECTOR,
                    "DEV000003"),
            new DemoAccount("platform@luparx.test", "Dev", "Platform", Portal.PLATFORM, Role.PLATFORM_ADMIN,
                    "DEV000004"));

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
                         DevParkingSeeder parkingSeeder) {
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
    }

    @Override
    public void run(ApplicationArguments args) {
        String countryCode = CountryCodes.normalize(defaults.countryCode());
        List<DemoAccount> available = new ArrayList<>();
        try {
            retireLegacyTenant();
            Tenant tenant = ensureTenant(countryCode);
            AddressChain address = resolveAddressChain(countryCode);
            String phoneNumber = phoneNumberService.exampleNationalNumber(countryCode);
            for (DemoAccount account : ACCOUNTS) {
                try {
                    seed(account, tenant, countryCode, address, phoneNumber);
                    available.add(account);
                } catch (RuntimeException exception) {
                    LOGGER.warn("Development seed: {} could not be created ({}). Continuing.",
                            account.email(), exception.toString());
                }
            }
            seedParking(tenant);
        } catch (RuntimeException exception) {
            // A broken fixture must never stop the application from starting.
            LOGGER.warn("Development seed skipped: {}", exception.toString());
            return;
        }
        announce(available);
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
     * Zones, tariffs and bays. Isolated from the accounts on purpose: a parking fixture that fails is
     * worth a warning, never the loss of the credentials a developer needs to log in at all.
     */
    private void seedParking(Tenant tenant) {
        try {
            parkingSeeder.seed(tenant, citizenUserId());
        } catch (RuntimeException exception) {
            LOGGER.warn("Development seed: parking fixture skipped ({}).", exception.toString());
        }
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

    private Tenant ensureTenant(String countryCode) {
        Optional<Tenant> existing = tenantRepository.findBySlug(TENANT_SLUG);
        if (existing.isPresent()) {
            return existing.get();
        }
        return tenantService.create(TENANT_SLUG, TENANT_LEGAL_NAME, TENANT_DISPLAY_NAME, countryCode,
                defaults.currencyCode(), defaults.locale(), defaults.timeZone(),
                SelfRegistrationPolicy.APPROVAL_REQUIRED, null);
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
                // The registration service reads the portal only to refuse self-registration where the
                // contract forbids it, which is the platform portal. The platform operator is created
                // as an ordinary person and receives its platform membership below, exactly as the
                // back-office would grant it.
                account.portal() == Portal.PLATFORM ? Portal.CITIZEN : account.portal());
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
        LOGGER.warn("DEVELOPMENT SEED DATA — these accounts are public and must NEVER exist outside a");
        LOGGER.warn("developer laptop. Profile 'dev' only; disable with luparx.dev.seed-demo-data=false.");
        for (DemoAccount account : accounts) {
            LOGGER.warn("  portal={} email={} password={}", account.portal().slug(), account.email(), PASSWORD);
        }
        LOGGER.warn("Municipality: {} (slug '{}')", TENANT_DISPLAY_NAME, TENANT_SLUG);
        LOGGER.warn("=================================================================================");
    }

    /** One seeded account: who they are, which portal they belong to and with which role. */
    private record DemoAccount(String email, String givenName, String familyName, Portal portal, Role role,
                               String documentNumber) {
    }

    /** The administrative divisions used for the seeded address; deeper levels may be null. */
    private record AddressChain(UUID level1Id, UUID level2Id, UUID level3Id) {
    }
}
