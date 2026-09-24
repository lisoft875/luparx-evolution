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

    /**
     * Un rol de consulta no escribe.
     *
     * <p>Afirmado por lo que NO tiene y no por una lista exacta, que es la corrección del
     * 24-09-2026. La versión anterior exigía que {@code TENANT_SUPPORT} fuera exactamente
     * {@code [USER_READ, AUDIT_READ]}, y el 2026-09-09 la entrega {@code d572506} le agregó
     * {@code CITATION_READ} —deliberadamente: un rol de consulta que no puede leer una boleta no
     * sirve para atender a quien reclama por una—. La prueba llevaba quince días en rojo y nadie
     * se enteró, porque el proyecto no tiene integración continua.</p>
     *
     * <p>Una lista exacta convierte cada permiso de LECTURA nuevo en un fallo, que es ruido: lo que
     * esta prueba cuida es que no aparezca uno de ESCRITURA. Escrita así, el próximo permiso de
     * lectura legítimo pasa y el próximo de escritura, que es el que importaría, no.</p>
     */
    @Test
    void readOnlyRolesCannotWrite() {
        assertThat(RolePermissions.of(Role.TENANT_SUPPORT)).doesNotContain(
                Permission.USER_WRITE,
                Permission.USER_BLOCK,
                Permission.ROLE_ASSIGN,
                Permission.ZONE_ASSIGN,
                Permission.MEMBERSHIP_APPROVE,
                Permission.TENANT_MANAGE,
                Permission.PLATFORM_MANAGE,
                Permission.CITATION_ISSUE,
                Permission.CITATION_VOID,
                Permission.CITATION_INGEST,
                Permission.ENFORCEMENT_MANAGE,
                Permission.WALLET_TOPUP);
        assertThat(RolePermissions.of(Role.PLATFORM_SUPPORT))
                .doesNotContain(Permission.USER_WRITE, Permission.USER_BLOCK, Permission.PLATFORM_MANAGE);
    }

    @Test
    void combinesTheRolesOfAUser() {
        Set<Permission> combined = RolePermissions.of(List.of(Role.TENANT_SUPPORT, Role.TENANT_FINANCE));

        assertThat(combined).contains(Permission.USER_READ, Permission.AUDIT_READ, Permission.EXPORT_RUN);
        assertThat(combined).doesNotContain(Permission.USER_WRITE);
    }

    /**
     * El fiscalizador fiscaliza y no administra.
     *
     * <p>Se llamaba {@code …NoAdministrativePermissionYet} y exigía que los tres conjuntos fueran
     * vacíos. Ese «Yet» venció el 2026-09-09, cuando {@code d572506} le dio a INSPECTOR
     * {@code CITATION_ISSUE}/{@code CITATION_READ} y a INSPECTOR_LEAD además {@code CITATION_VOID},
     * que es justamente lo que el javadoc de {@link RolePermissions} anunciaba que iba a pasar
     * «as configuration». La prueba se quedó anclada al estado anterior.</p>
     *
     * <p>Lo que de verdad hay que cuidar no es que el conjunto esté vacío —nunca más va a estarlo—
     * sino que lo que tenga sea de fiscalización y nada de administración.</p>
     */
    @Test
    void enforcementRolesCarryEnforcementPermissionsAndNothingAdministrative() {
        assertThat(RolePermissions.of(Role.INSPECTOR))
                .containsExactlyInAnyOrder(Permission.CITATION_ISSUE, Permission.CITATION_READ);
        assertThat(RolePermissions.of(Role.INSPECTOR_LEAD)).containsExactlyInAnyOrder(
                Permission.CITATION_ISSUE, Permission.CITATION_READ, Permission.CITATION_VOID);

        for (Role rol : List.of(Role.INSPECTOR, Role.INSPECTOR_LEAD)) {
            assertThat(RolePermissions.of(rol)).doesNotContain(
                    Permission.USER_WRITE,
                    Permission.USER_BLOCK,
                    Permission.ROLE_ASSIGN,
                    Permission.MEMBERSHIP_APPROVE,
                    Permission.TENANT_MANAGE,
                    Permission.PLATFORM_MANAGE,
                    Permission.WALLET_TOPUP,
                    Permission.EXPORT_RUN,
                    Permission.AUDIT_READ);
        }

        // El ciudadano sigue sin permisos administrativos: su portal no los usa.
        assertThat(RolePermissions.of(Role.CITIZEN)).isEmpty();
    }

    /**
     * Los tres criterios de aceptación de la §3 de la guía funcional (24-09-2026).
     *
     * <p>Están escritos como prueba y no como comentario porque son promesas de producto: son lo que
     * un auditor municipal va a preguntar, y la clase de cosa que se rompe sin ruido el día que
     * alguien agrega un permiso «para que no moleste». Los tres se cumplían ya antes de esta tanda;
     * lo que faltaba era que quedaran clavados.</p>
     */
    @Test
    void theSeparationOfDutiesTheMunicipalityWillAskAbout() {
        // «Un Fiscalizador no puede modificar tarifas.» Las tarifas se escriben con TENANT_MANAGE.
        assertThat(RolePermissions.grants(Role.INSPECTOR, Permission.TENANT_MANAGE)).isFalse();
        assertThat(RolePermissions.grants(Role.INSPECTOR_LEAD, Permission.TENANT_MANAGE)).isFalse();

        // «Un perfil de Finanzas accede a conciliacion/reportes financieros sin recibir
        // administracion total.» Conciliación se autoriza con WALLET_TOPUP.
        assertThat(RolePermissions.grants(Role.TENANT_FINANCE, Permission.WALLET_TOPUP)).isTrue();
        assertThat(RolePermissions.grants(Role.TENANT_FINANCE, Permission.EXPORT_RUN)).isTrue();
        assertThat(RolePermissions.grants(Role.TENANT_FINANCE, Permission.TENANT_MANAGE)).isFalse();
        assertThat(RolePermissions.grants(Role.TENANT_FINANCE, Permission.USER_WRITE)).isFalse();

        // «Un Auditor puede consultar sin modificar.»
        assertThat(RolePermissions.grants(Role.TENANT_SUPPORT, Permission.AUDIT_READ)).isTrue();
        assertThat(RolePermissions.grants(Role.TENANT_SUPPORT, Permission.USER_WRITE)).isFalse();
        assertThat(RolePermissions.grants(Role.TENANT_SUPPORT, Permission.TENANT_MANAGE)).isFalse();
        assertThat(RolePermissions.grants(Role.TENANT_SUPPORT, Permission.CITATION_VOID)).isFalse();
    }

    /**
     * Quien emite un acto no puede borrarlo.
     *
     * <p>No sale de la guía; sale de la tabla, donde está escrito como decisión deliberada. Vale
     * clavarlo por lo mismo que los de arriba.</p>
     */
    @Test
    void theOfficerWhoIssuesACitationCannotAnnulIt() {
        assertThat(RolePermissions.grants(Role.INSPECTOR, Permission.CITATION_ISSUE)).isTrue();
        assertThat(RolePermissions.grants(Role.INSPECTOR, Permission.CITATION_VOID)).isFalse();
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
