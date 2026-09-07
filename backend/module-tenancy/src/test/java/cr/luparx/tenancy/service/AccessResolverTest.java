package cr.luparx.tenancy.service;

import cr.luparx.core.domain.Permission;
import cr.luparx.core.domain.Portal;
import cr.luparx.core.domain.Role;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ForbiddenException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.entity.TenantMembership;
import cr.luparx.tenancy.model.MembershipStatus;
import cr.luparx.tenancy.model.SelfRegistrationPolicy;
import cr.luparx.tenancy.model.TenantStatus;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Tenant isolation lives or dies here: {@link AccessResolver} is the single place that decides what a
 * user may do, and SECURITY.md §4 requires at least one test proving that knowing another tenant's
 * id is not enough to reach it.
 */
class AccessResolverTest {

    private static final Instant NOW = Instant.parse("2026-01-01T00:00:00Z");

    private final TenantId tenantA = TenantId.generate();
    private final TenantId tenantB = TenantId.generate();
    private final UserId adminOfA = UserId.generate();
    private final UserId platformOperator = UserId.generate();

    /** In-memory {@link AccessDirectory}: the port exists precisely so this needs no database. */
    private static final class InMemoryDirectory implements AccessDirectory {

        private final Map<UserId, List<TenantMembership>> memberships = new LinkedHashMap<>();
        private final Map<TenantId, Tenant> tenants = new LinkedHashMap<>();

        void addTenant(TenantId id, TenantStatus status) {
            tenants.put(id, new Tenant(id.value(), "tenant-" + id.value().toString().substring(0, 8),
                    "Legal name", "Display name", "CR", "CRC", "es-CR", "America/Costa_Rica",
                    status, SelfRegistrationPolicy.APPROVAL_REQUIRED, NOW, null));
        }

        void addMembership(UserId userId, TenantId tenantId, Portal portal, Role role, MembershipStatus status) {
            memberships.computeIfAbsent(userId, key -> new ArrayList<>())
                    .add(new TenantMembership(Uuid7.generate(),
                            tenantId == null ? null : tenantId.value(), userId.value(), portal, role, status, NOW));
        }

        @Override
        public List<TenantMembership> membershipsOf(UserId userId) {
            return memberships.getOrDefault(userId, List.of());
        }

        @Override
        public Optional<Tenant> findTenant(TenantId tenantId) {
            return Optional.ofNullable(tenants.get(tenantId));
        }
    }

    private InMemoryDirectory directoryWithTwoTenants() {
        InMemoryDirectory directory = new InMemoryDirectory();
        directory.addTenant(tenantA, TenantStatus.ACTIVE);
        directory.addTenant(tenantB, TenantStatus.ACTIVE);
        return directory;
    }

    @Test
    void resolvesRolesAndPermissionsInsideTheUsersOwnTenant() {
        InMemoryDirectory directory = directoryWithTwoTenants();
        directory.addMembership(adminOfA, tenantA, Portal.ADMIN, Role.TENANT_ADMIN, MembershipStatus.ACTIVE);
        AccessResolver resolver = new AccessResolver(directory);

        AccessGrant grant = resolver.resolve(adminOfA, Portal.ADMIN, tenantA);

        assertThat(grant.tenantId()).isEqualTo(tenantA);
        assertThat(grant.roles()).containsExactly(Role.TENANT_ADMIN);
        assertThat(grant.permissions()).contains(Permission.USER_READ, Permission.MEMBERSHIP_APPROVE);
        assertThat(grant.platformScope()).isFalse();
    }

    @Test
    void refusesAnotherTenantEvenWhenItsIdIsKnown() {
        InMemoryDirectory directory = directoryWithTwoTenants();
        directory.addMembership(adminOfA, tenantA, Portal.ADMIN, Role.TENANT_ADMIN, MembershipStatus.ACTIVE);
        AccessResolver resolver = new AccessResolver(directory);

        // The caller is a legitimate administrator — of the other municipality.
        assertThatThrownBy(() -> resolver.resolve(adminOfA, Portal.ADMIN, tenantB))
                .isInstanceOf(ForbiddenException.class)
                .extracting(exception -> ((ForbiddenException) exception).code())
                .isEqualTo(ErrorCode.MEMBERSHIP_NOT_ACTIVE);
    }

    @Test
    void refusesAMembershipGrantedOnAnotherPortal() {
        InMemoryDirectory directory = directoryWithTwoTenants();
        directory.addMembership(adminOfA, tenantA, Portal.ADMIN, Role.TENANT_ADMIN, MembershipStatus.ACTIVE);
        AccessResolver resolver = new AccessResolver(directory);

        assertThatThrownBy(() -> resolver.resolve(adminOfA, Portal.INSPECTOR, tenantA))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void refusesAMembershipThatIsNotYetApproved() {
        InMemoryDirectory directory = directoryWithTwoTenants();
        directory.addMembership(adminOfA, tenantA, Portal.ADMIN, Role.TENANT_ADMIN,
                MembershipStatus.PENDING_APPROVAL);
        AccessResolver resolver = new AccessResolver(directory);

        assertThatThrownBy(() -> resolver.resolve(adminOfA, Portal.ADMIN, tenantA))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void refusesEveryAccessToASuspendedTenant() {
        InMemoryDirectory directory = new InMemoryDirectory();
        directory.addTenant(tenantA, TenantStatus.SUSPENDED);
        directory.addMembership(adminOfA, tenantA, Portal.ADMIN, Role.TENANT_ADMIN, MembershipStatus.ACTIVE);
        AccessResolver resolver = new AccessResolver(directory);

        assertThatThrownBy(() -> resolver.resolve(adminOfA, Portal.ADMIN, tenantA))
                .isInstanceOf(ForbiddenException.class)
                .extracting(exception -> ((ForbiddenException) exception).code())
                .isEqualTo(ErrorCode.TENANT_NOT_ACTIVE);
    }

    @Test
    void grantsPlatformScopeWithoutBindingTheSessionToOneTenant() {
        InMemoryDirectory directory = directoryWithTwoTenants();
        directory.addMembership(platformOperator, null, Portal.PLATFORM, Role.PLATFORM_ADMIN,
                MembershipStatus.ACTIVE);
        AccessResolver resolver = new AccessResolver(directory);

        AccessGrant grant = resolver.resolve(platformOperator, Portal.PLATFORM, null);

        assertThat(grant.platformScope()).isTrue();
        assertThat(grant.tenantId()).isNull();
        assertThat(grant.permissions()).contains(Permission.PLATFORM_MANAGE);
        assertThat(resolver.hasPlatformScope(platformOperator)).isTrue();
        assertThat(resolver.hasPlatformScope(adminOfA)).isFalse();
    }

    @Test
    void refusesThePlatformPortalToATenantAdministrator() {
        InMemoryDirectory directory = directoryWithTwoTenants();
        directory.addMembership(adminOfA, tenantA, Portal.ADMIN, Role.TENANT_ADMIN, MembershipStatus.ACTIVE);
        AccessResolver resolver = new AccessResolver(directory);

        assertThatThrownBy(() -> resolver.resolve(adminOfA, Portal.PLATFORM, null))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void allowsACitizenSessionWithNoTenantSelectedYet() {
        InMemoryDirectory directory = directoryWithTwoTenants();
        UserId citizen = UserId.generate();
        AccessResolver resolver = new AccessResolver(directory);

        AccessGrant grant = resolver.resolve(citizen, Portal.CITIZEN, null);

        assertThat(grant.tenantId()).isNull();
        assertThat(grant.roles()).isEmpty();
        assertThat(grant.permissions()).isEmpty();
    }

    @Test
    void aSessionWithNoMunicipalitySelectedCarriesNoAuthority() {
        // Someone who administers two municipalities signs in before choosing one. The session is
        // valid (they must be able to call /me/memberships and /session/tenant) but grants nothing:
        // any tenant-owned operation fails later, at TenantContextHolder.requireTenantId().
        InMemoryDirectory directory = directoryWithTwoTenants();
        directory.addMembership(adminOfA, tenantA, Portal.ADMIN, Role.TENANT_ADMIN, MembershipStatus.ACTIVE);
        directory.addMembership(adminOfA, tenantB, Portal.ADMIN, Role.TENANT_ADMIN, MembershipStatus.ACTIVE);
        AccessResolver resolver = new AccessResolver(directory);

        AccessGrant grant = resolver.resolve(adminOfA, Portal.ADMIN, null);

        assertThat(grant.tenantId()).isNull();
        assertThat(grant.roles()).isEmpty();
        assertThat(grant.permissions()).isEmpty();
    }

    @Test
    void picksTheDefaultTenantOnlyWhenThereIsNoChoice() {
        InMemoryDirectory directory = directoryWithTwoTenants();
        directory.addMembership(adminOfA, tenantA, Portal.ADMIN, Role.TENANT_ADMIN, MembershipStatus.ACTIVE);
        AccessResolver resolver = new AccessResolver(directory);

        assertThat(resolver.defaultTenant(adminOfA, Portal.ADMIN)).contains(tenantA);

        directory.addMembership(adminOfA, tenantB, Portal.ADMIN, Role.TENANT_SUPPORT, MembershipStatus.ACTIVE);
        assertThat(resolver.defaultTenant(adminOfA, Portal.ADMIN)).isEmpty();
    }

    @Test
    void combinesEveryActiveRoleTheUserHoldsInTheTenant() {
        InMemoryDirectory directory = directoryWithTwoTenants();
        directory.addMembership(adminOfA, tenantA, Portal.ADMIN, Role.TENANT_SUPPORT, MembershipStatus.ACTIVE);
        directory.addMembership(adminOfA, tenantA, Portal.ADMIN, Role.TENANT_FINANCE, MembershipStatus.ACTIVE);
        AccessResolver resolver = new AccessResolver(directory);

        AccessGrant grant = resolver.resolve(adminOfA, Portal.ADMIN, tenantA);

        assertThat(grant.roles()).containsExactlyInAnyOrder(Role.TENANT_SUPPORT, Role.TENANT_FINANCE);
        assertThat(grant.permissions()).contains(Permission.USER_READ, Permission.AUDIT_READ,
                Permission.EXPORT_RUN);
        assertThat(grant.permissions()).doesNotContain(Permission.USER_WRITE);
    }
}
