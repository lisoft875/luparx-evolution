package cr.luparx.app.web;

import cr.luparx.core.domain.Portal;
import cr.luparx.core.domain.Role;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ForbiddenException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.tenant.TenantContext;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.tenancy.entity.TenantMembership;
import cr.luparx.tenancy.model.MembershipStatus;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Las guardas que impiden que un administrador se aplique a sí mismo una acción destructiva.
 *
 * <h2>Por qué existen, y por qué esta prueba llega tarde</h2>
 *
 * <p>Tres incidentes P1 fueron el mismo defecto con tres nombres. El 24-09-2026 un administrador se
 * desactivó su propio puesto y perdió el acceso a su municipalidad. Ese mismo día se encontró que
 * podía revocárselo. El 02-10-2026 se forzó el cambio de contraseña sobre su propia cuenta, lo que
 * revoca todos los tokens de la persona objetivo: la persona objetivo era él, así que la pantalla
 * lo devolvió al login en medio de una prueba. Es la «redirección o cierre de sesión del
 * administrador» que el informe del 05-10-2026 vuelve a reportar como P0.</p>
 *
 * <p>Las guardas se escribieron en su momento. Lo que no se escribió fue esto: hasta el 05-10-2026
 * lo único que las verificaba era un arnés de navegador, por el camino de un botón. Y ese botón,
 * correctamente, dejó de ofrecerse —una acción cuya única respuesta posible es un 403 no se
 * ofrece—, con lo que la verificación se quedó sin camino. Una guarda de seguridad probada sólo
 * desde la interfaz está probada mientras la interfaz no cambie, que es tanto como decir que no
 * está probada.</p>
 *
 * <p>Que el servidor siga rechazándolo es lo que importa de verdad: un cliente viejo en caché, una
 * petición escrita a mano contra la página de OpenAPI o un error de programación futuro no pasan
 * por la pantalla.</p>
 */
class SelfActionGuardsTest {

    private static final UUID YO = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID OTRO = UUID.fromString("22222222-2222-2222-2222-222222222222");

    @AfterEach
    void limpiar() {
        // El holder es un ThreadLocal: dejarlo puesto filtraría este contexto a la prueba siguiente.
        TenantContextHolder.clear();
    }

    private static void entraComo(UUID userId) {
        TenantContextHolder.set(new TenantContext(
                new UserId(userId),
                Portal.ADMIN,
                new TenantId(UUID.fromString("33333333-3333-3333-3333-333333333333")),
                Set.of(Role.TENANT_ADMIN),
                null,
                false));
    }

    private static TenantMembership puestoDe(UUID userId) {
        return new TenantMembership(
                UUID.randomUUID(),
                UUID.fromString("33333333-3333-3333-3333-333333333333"),
                userId,
                Portal.ADMIN,
                Role.TENANT_ADMIN,
                MembershipStatus.ACTIVE,
                Instant.parse("2026-01-01T00:00:00Z"));
    }

    @Test
    @DisplayName("forzar el cambio de contraseña sobre la propia cuenta se rechaza")
    void noMePuedoForzarLaContrasena() {
        entraComo(YO);

        ForbiddenException error = assertThrows(
                ForbiddenException.class,
                () -> AdminUserController.requireNotSelf(YO));

        assertEquals(ErrorCode.SELF_ACTION_DENIED, error.code());
    }

    @Test
    @DisplayName("y sobre la cuenta de otra persona se permite: la guarda no bloquea el trabajo")
    void sobreOtroSiSePuede() {
        entraComo(YO);

        assertDoesNotThrow(() -> AdminUserController.requireNotSelf(OTRO));
    }

    @Test
    @DisplayName("desactivar, revocar o cambiar el rol del propio puesto se rechaza")
    void noMePuedoTocarMiPropioPuesto() {
        entraComo(YO);

        ForbiddenException error = assertThrows(
                ForbiddenException.class,
                () -> AdminMembershipController.requireNotOwnPost(puestoDe(YO)));

        assertEquals(ErrorCode.MEMBERSHIP_SELF_MODIFICATION_DENIED, error.code());
    }

    @Test
    @DisplayName("y el puesto de otra persona sí")
    void elPuestoDeOtroSi() {
        entraComo(YO);

        assertDoesNotThrow(() -> AdminMembershipController.requireNotOwnPost(puestoDe(OTRO)));
    }

    @Test
    @DisplayName("sin contexto autenticado no se cuela nada: falla antes de comparar")
    void sinContextoNoPasa() {
        // No se llama a `entraComo`: el holder está vacío, que es lo que ocurre en un hilo de fondo
        // o si alguien invocara esto fuera de una petición. `require()` falla, y fallar es lo
        // correcto: sin saber quién llama no se puede decidir si es él mismo.
        assertThrows(ForbiddenException.class, () -> AdminUserController.requireNotSelf(YO));
        assertThrows(ForbiddenException.class, () -> AdminMembershipController.requireNotOwnPost(puestoDe(YO)));
    }
}
