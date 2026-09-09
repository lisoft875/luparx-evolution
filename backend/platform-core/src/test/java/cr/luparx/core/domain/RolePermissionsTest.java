package cr.luparx.core.domain;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The role → permission table is configuration, not scattered {@code if (role == ADMIN)} checks
 * (CONTRACT.md §1). These tests protect the two invariants that matter for security: a tenant role
 * never carries platform authority, and the table is immutable at runtime.
 */
class RolePermissionsTest {

    @Test
    void everyRoleHasAnEntry() {
        for (Role role : Role.values()) {
            assertThat(RolePermissions.of(role)).as("permissions of %s", role).isNotNull();
        }
    }

    @Test
    void onlyPlatformAdminMayManageThePlatform() {
        for (Role role : Role.values()) {
            boolean grants = RolePermissions.grants(role, Permission.PLATFORM_MANAGE);
            assertThat(grants)
                    .as("%s granting PLATFORM_MANAGE", role)
                    .isEqualTo(role == Role.PLATFORM_ADMIN);
        }
    }

    @Test
    void tenantAdminManagesItsTenantButNotThePlatform() {
        Set<Permission> permissions = RolePermissions.of(Role.TENANT_ADMIN);

        assertThat(permissions).contains(Permission.USER_READ, Permission.USER_WRITE, Permission.USER_BLOCK,
                Permission.MEMBERSHIP_APPROVE, Permission.ROLE_ASSIGN, Permission.TENANT_MANAGE);
        assertThat(permissions).doesNotContain(Permission.PLATFORM_MANAGE);
    }

    @Test
    void readOnlyRolesCannotWrite() {
        assertThat(RolePermissions.of(Role.TENANT_SUPPORT))
                .containsExactlyInAnyOrder(Permission.USER_READ, Permission.AUDIT_READ);
        assertThat(RolePermissions.of(Role.PLATFORM_SUPPORT))
                .doesNotContain(Permission.USER_WRITE, Permission.USER_BLOCK, Permission.PLATFORM_MANAGE);
    }

    @Test
    void combinesTheRolesOfAUser() {
        Set<Permission> combined = RolePermissions.of(List.of(Role.TENANT_SUPPORT, Role.TENANT_FINANCE));

        assertThat(combined).contains(Permission.USER_READ, Permission.AUDIT_READ, Permission.EXPORT_RUN);
        assertThat(combined).doesNotContain(Permission.USER_WRITE);
    }

    @Test
    void inspectorAndCitizenCarryNoAdministrativePermissionYet() {
        assertThat(RolePermissions.of(Role.INSPECTOR)).isEmpty();
        assertThat(RolePermissions.of(Role.INSPECTOR_LEAD)).isEmpty();
        assertThat(RolePermissions.of(Role.CITIZEN)).isEmpty();
    }

    @Test
    void theTableCannotBeMutatedAtRuntime() {
        assertThatThrownBy(() -> RolePermissions.of(Role.CITIZEN).add(Permission.PLATFORM_MANAGE))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void eachRoleBelongsToExactlyOnePortal() {
        assertThat(Role.PLATFORM_ADMIN.portal()).isEqualTo(Portal.PLATFORM);
        assertThat(Role.TENANT_ADMIN.portal()).isEqualTo(Portal.ADMIN);
        assertThat(Role.INSPECTOR.portal()).isEqualTo(Portal.INSPECTOR);
        assertThat(Role.CITIZEN.portal()).isEqualTo(Portal.CITIZEN);
        assertThat(Role.TENANT_ADMIN.isPlatformScoped()).isFalse();
        assertThat(Role.PLATFORM_SUPPORT.isPlatformScoped()).isTrue();
    }

    @Test
    void portalsDeclareTheirOwnAudienceAndRegistrationRule() {
        assertThat(Portal.CITIZEN.audience()).isEqualTo("luparx:portal:citizen");
        assertThat(Portal.CITIZEN.selfRegistrationAllowed()).isTrue();
        assertThat(Portal.ADMIN.selfRegistrationAllowed()).isFalse();
        assertThat(Portal.INSPECTOR.selfRegistrationAllowed()).isFalse();
        assertThat(Portal.PLATFORM.selfRegistrationAllowed()).isFalse();
    }
}
