package cr.luparx.app.notification;

import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.enforcement.entity.Citation;
import cr.luparx.tenancy.entity.TenantMembership;
import cr.luparx.notification.model.NotificationType;
import cr.luparx.notification.service.NotificationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.function.Consumer;

/**
 * Lo que se le cuenta a quien trabaja PARA una municipalidad.
 *
 * <h2>Por qué existe, y qué no existía antes</h2>
 *
 * <p>Los cinco hechos de acá ya se registraban todos: anular una boleta, desactivar un puesto,
 * restablecerlo, cambiar un rol, reasignar sectores. Todos quedan en la bitácora de auditoría. Pero
 * una bitácora es para quien audita, no para quien trabaja: el fiscalizador al que le anularon una
 * boleta no tenía forma de enterarse, y el que llegó un lunes con el acceso desactivado tampoco.</p>
 *
 * <h2>Por qué acá y no dentro de los módulos</h2>
 *
 * <p>Mismo sitio y misma razón que {@link CitizenNotifier}: {@code module-enforcement} y
 * {@code module-identity} no saben que existen las notificaciones y no deben aprenderlo. Una boleta es
 * un acto administrativo con su propio ciclo de vida, y una membresía es una relación laboral; el día
 * que cualquiera de los dos se extraiga a su propio servicio no debería llevarse un buzón encima. La
 * unión se hace en la raíz de composición, que es este paquete.</p>
 *
 * <h2>Después del hecho, nunca en vez de él</h2>
 *
 * <p>Cada método se llama cuando el acto ya quedó escrito, y cada uno se come sus propios fallos. Es
 * el trato que este código ya tenía: una anulación que no se pudiera registrar porque falló el insert
 * de una notificación sería un acto administrativo perdido por un buzón. Al revés —un aviso que
 * silenciosamente no ocurrió— cuesta que alguien se entere al abrir la aplicación, que es donde se iba
 * a enterar de todos modos.</p>
 *
 * <h2>Lo que NO se avisa, y es deliberado</h2>
 *
 * <p>Nada de esto sale por correo. La categoría {@code WORK} no es elegible como preferencia de
 * correo, así que {@code sendsByEmail} siempre contesta falso para ella y el relay nunca ve un evento.
 * Es a propósito: estos avisos son del turno, se leen en la aplicación, y mandarle correo a alguien
 * por cada reasignación de sector es la forma de que deje de leer los correos que sí importan. El día
 * que se quiera, son una fila en {@code notification_email_categories} y dos plantillas.</p>
 *
 * <p>Tampoco se avisa «tenés boletas sin subir». Eso vive en el teléfono: la cola sin conexión son
 * boletas que el servidor todavía no conoce, así que una fila en la base diciendo que existen sería
 * una contradicción. La campana del fiscalizador la suma desde el cliente, que es quien la sabe.</p>
 */
@Component
public class StaffNotifier {

    private static final Logger LOGGER = LoggerFactory.getLogger(StaffNotifier.class);

    private final NotificationService notifications;

    public StaffNotifier(NotificationService notifications) {
        this.notifications = notifications;
    }

    /**
     * Le anularon una boleta.
     *
     * <p>Se le avisa a quien la EMITIÓ —{@code inspectorUserId}, que la boleta guarda desde que
     * existe— y nunca a quien la anuló. Que no sean la misma persona lo garantiza la separación de
     * funciones: {@code PERM_CITATION_VOID} lo tienen el administrador y el jefe de fiscalización, y
     * quien escribió la boleta no puede anularla.</p>
     *
     * <p>El motivo viaja en los parámetros. Es obligatorio al anular, y es lo único que convierte el
     * aviso en algo útil: «te anularon la boleta 00042» sin el motivo obliga a preguntar.</p>
     */
    public void citationVoided(Citation citation, String reason) {
        proteger("citation-voided", citation.getId().toString(), () -> {
            Map<String, Object> params = new HashMap<>();
            params.put("citationNumber", citation.getNumber());
            params.put("plate", citation.getPlate());
            if (reason != null && !reason.isBlank()) {
                params.put("reason", reason);
            }
            notifications.record(TenantId.of(citation.getTenantId()),
                    UserId.of(citation.getInspectorUserId()),
                    NotificationType.CITATION_VOIDED, citation.getId(), params);
        });
    }

    /** Su puesto quedó desactivado. El motivo, cuando alguien lo dio. */
    public void postSuspended(TenantMembership membership, String reason) {
        notificarPuesto(NotificationType.POST_SUSPENDED, membership, params -> {
            if (reason != null && !reason.isBlank()) {
                params.put("reason", reason);
            }
        });
    }

    /** Le restablecieron el acceso. */
    public void postReactivated(TenantMembership membership) {
        notificarPuesto(NotificationType.POST_REACTIVATED, membership, params -> { });
    }

    /**
     * Le cambiaron el rol.
     *
     * <p>Van los dos, el anterior y el nuevo: la pregunta de quien lo recibe es «de qué a qué», y con
     * uno solo tiene que acordarse de cuál tenía. Como nombres del enum y no como etiquetas: el texto
     * lo arma el cliente en el idioma que la persona tenga hoy.</p>
     */
    public void postRoleChanged(TenantMembership membership, String previousRole) {
        notificarPuesto(NotificationType.POST_ROLE_CHANGED, membership, params -> {
            params.put("previousRole", previousRole);
            params.put("role", membership.getRole().name());
        });
    }

    /**
     * Le reasignaron los sectores.
     *
     * <p>Viaja la CANTIDAD, no los nombres. Dos razones: los nombres cambian y el aviso quedaría
     * hablando de un sector que se renombró, y la pantalla del fiscalizador ya sabe leer sus sectores
     * actuales —que es lo que de verdad quiere ver cuando lee esto—. Cero es un dato y no un vacío:
     * significa sin restricción, o sea todos.</p>
     */
    public void postZonesChanged(TenantMembership membership, int zoneCount) {
        notificarPuesto(NotificationType.POST_ZONES_CHANGED, membership,
                params -> params.put("zoneCount", Integer.valueOf(zoneCount)));
    }

    /**
     * Lo común de los cuatro avisos de puesto.
     *
     * <p>El sujeto es la MEMBRESÍA y no la persona, que es lo que hace que los avisos de dos puestos
     * distintos de la misma persona no se tapen entre sí: la idempotencia es
     * {@code (user_id, type, subject_id)}, así que con la persona como sujeto el segundo puesto
     * suspendido nunca habría avisado.</p>
     *
     * <p>Se avisa a cualquier puesto, no sólo a los de fiscalización. Un administrador municipal al
     * que desactivan también tiene derecho a saberlo; hoy no tiene campana donde verlo, y la fila
     * queda escrita para cuando la tenga. Lo que no se hace es decidir acá quién merece el aviso.</p>
     */
    private void notificarPuesto(NotificationType type, TenantMembership membership,
                                 Consumer<Map<String, Object>> extras) {
        proteger(type.name(), membership.getId().toString(), () -> {
            Map<String, Object> params = new HashMap<>();
            extras.accept(params);
            notifications.record(TenantId.of(membership.getTenantId()),
                    UserId.of(membership.getUserId()), type, membership.getId(), params);
        });
    }

    /**
     * Corre el aviso y se come el fallo.
     *
     * <p>Una sola forma de hacerlo, para que no haya un método que por olvido deje la excepción subir
     * y tumbe el acto que ya estaba escrito. Lo que se registra es qué aviso y sobre qué: con eso
     * alguien puede contestar «¿por qué no me avisaron?» sin adivinar.</p>
     */
    private void proteger(String que, String sobre, Runnable aviso) {
        try {
            aviso.run();
        } catch (RuntimeException failure) {
            LOGGER.warn("No se pudo registrar el aviso {} sobre {}.", que, sobre, failure);
        }
    }
}
