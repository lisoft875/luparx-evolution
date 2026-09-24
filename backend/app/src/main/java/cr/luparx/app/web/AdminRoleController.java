package cr.luparx.app.web;

import cr.luparx.core.domain.Permission;
import cr.luparx.core.domain.Portal;
import cr.luparx.core.domain.Role;
import cr.luparx.core.domain.RolePermissions;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Comparator;
import java.util.List;

/**
 * Qué puede hacer cada rol, dicho por el servidor.
 *
 * <h2>Por qué existe</h2>
 *
 * <p>La tabla de roles y permisos existe desde el primer día en {@link RolePermissions} y se aplica
 * en cada endpoint con {@code @PreAuthorize("hasAuthority('PERM_…')")}. Lo que no existía era una
 * forma de <b>verla</b>: para responder «¿un fiscalizador puede cambiar una tarifa?» había que abrir
 * el código fuente. La §3 de la guía funcional (24-09-2026) pide poder consultar los permisos
 * efectivos, y eso es exactamente esto.</p>
 *
 * <h2>Qué NO es</h2>
 *
 * <p>Es de <b>sólo lectura</b>, y a propósito. Cambiar la tabla desde una pantalla significaría que
 * los permisos dejan de estar en el código, versionados y revisables en un diff, para pasar a estar
 * en una fila de base de datos que nadie audita. Esa es una decisión de arquitectura y está marcada
 * VALIDAR CON JAVIER, junto con la de partir {@code TENANT_MANAGE} en permisos por módulo.</p>
 *
 * <p>Tampoco inventa una taxonomía: devuelve los {@link Role} y los {@link Permission} que de verdad
 * existen. Si la pantalla mostrara «Aprobar/Resolver» o «Anular» por módulo —los verbos que pide la
 * guía— estaría dibujando permisos que ningún endpoint comprueba, que es la peor clase de pantalla
 * de seguridad: la que tranquiliza sin proteger.</p>
 */
@RestController
@RequestMapping("/api/v1/admin")
@Tag(name = "Admin · roles")
public class AdminRoleController {

    /**
     * La matriz completa, un renglón por rol.
     *
     * <p>Pide {@code PERM_USER_READ} y no {@code PERM_ROLE_ASSIGN}: esto no cambia nada, y quien
     * puede ver el directorio de personas debería poder entender qué significa el rol que ve al lado
     * de cada nombre. Asignarlo sigue necesitando {@code ROLE_ASSIGN}.</p>
     */
    @GetMapping("/roles")
    @PreAuthorize("hasAuthority('PERM_USER_READ')")
    @Operation(summary = "Role → permission matrix as the server enforces it (read-only)")
    public List<RoleMatrixRow> roles() {
        return RolePermissions.table().entrySet().stream()
                // Los roles de plataforma quedan fuera: una municipalidad no los asigna ni los
                // padece, y listarlos acá sugeriría que son suyos.
                .filter(entry -> !entry.getKey().isPlatformScoped())
                .map(entry -> new RoleMatrixRow(
                        entry.getKey().name(),
                        entry.getKey().portal(),
                        entry.getValue().stream().map(Permission::name).sorted().toList()))
                .sorted(Comparator.comparing(RoleMatrixRow::role))
                .toList();
    }

    /**
     * Un rol y lo que puede hacer.
     *
     * @param role        el nombre del enum, no una etiqueta. El cliente traduce; el backend no pone
     *                    español en un campo (la misma regla que sigue {@code AuditEventResponse})
     * @param portal      en qué portal se usa ese rol, que es lo que explica por qué un fiscalizador
     *                    no aparece en el directorio administrativo
     * @param permissions los permisos que la tabla del servidor le concede, ordenados
     */
    public record RoleMatrixRow(String role, Portal portal, List<String> permissions) {
    }
}
