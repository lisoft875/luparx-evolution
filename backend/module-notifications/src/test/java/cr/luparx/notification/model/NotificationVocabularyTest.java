package cr.luparx.notification.model;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Las reglas del vocabulario de notificaciones, que no se ven en ninguna pantalla.
 *
 * <h2>Por qué una prueba sobre tres enums</h2>
 *
 * <p>Porque los tres se amplían, y dos de las formas de ampliarlos mal no fallan en ninguna parte
 * visible: rompen una pantalla de OTRO portal, o producen correos que no se pueden enviar. Las dos
 * ocurrieron el 06-10-2026 al añadir los avisos del fiscalizador, y las dos están encontradas acá en
 * vez de en staging.</p>
 */
class NotificationVocabularyTest {

    /**
     * El catálogo que el ciudadano puede marcar no incluye lo que no puede recibir.
     *
     * <p>`CitizenNotificationController` publica las categorías filtrando por `emailChoice()`, a
     * propósito, para que una categoría nueva aparezca en la pantalla sin desplegar cliente. Esa
     * virtud es también el riesgo: cuando se añadió `WORK` —los avisos de quien trabaja para la
     * municipalidad— sin el filtro habría aparecido SOLA en la pantalla de preferencias de correo del
     * ciudadano, con una clave de traducción que no existe y para algo que nunca va a recibir.</p>
     */
    @Test
    @DisplayName("sólo las categorías del ciudadano se ofrecen como preferencia de correo")
    void soloLasDelCiudadanoSeEligen() {
        assertTrue(NotificationCategory.PARKING.emailChoice(), "estacionamiento sí se elige");
        assertTrue(NotificationCategory.FINES.emailChoice(), "multas sí se elige");
        assertTrue(NotificationCategory.WALLET.emailChoice(), "billetera sí se elige");
        assertFalse(NotificationCategory.WORK.emailChoice(),
                "los avisos de trabajo no se eligen por correo: no hay plantilla y no deben aparecer "
                        + "en la pantalla del ciudadano");
    }

    /**
     * Un aviso de trabajo nunca intenta salir por correo.
     *
     * <p>Ésta es la invariante que importa de verdad, y protege contra un fallo caro y tardío: si un
     * tipo de la categoría `WORK` fuera elegible por correo, alguien que es ciudadano Y fiscalizador con
     * esa categoría encendida haría que el relay buscara una plantilla
     * `email.notification.CITATION_VOIDED` que no existe. El relay lanzaría, reintentaría con backoff
     * y acabaría marcando la fila como fracasada — un fallo en un trabajo de fondo, horas después del
     * hecho, en una tabla que nadie mira.</p>
     *
     * <p>Se recorre el enum entero y no una lista escrita a mano: una prueba que enumera los tipos se
     * queda vieja exactamente cuando hace falta, que es al añadir el siguiente.</p>
     */
    @Test
    @DisplayName("ningún tipo de la categoría WORK es elegible por correo")
    void losAvisosDeTrabajoNoSalenPorCorreo() {
        List<String> ofensores = new ArrayList<>();
        for (NotificationType type : NotificationType.values()) {
            if (type.category() == NotificationCategory.WORK && type.category().emailChoice()) {
                ofensores.add(type.name());
            }
        }
        assertEquals(List.of(), ofensores,
                "un aviso de trabajo elegible por correo necesita plantilla, y no la tiene");
    }

    /**
     * Cada tipo dice de qué habla y a dónde navega.
     *
     * <p>Las dos cosas viven en el tipo y no las pasa quien lo produce, justamente para que no puedan
     * faltar. Esto comprueba que la construcción del enum siga siendo así el día que alguien añada un
     * valor con el constructor equivocado.</p>
     */
    @Test
    @DisplayName("cada tipo trae su categoría y su sujeto")
    void cadaTipoEstaCompleto() {
        for (NotificationType type : NotificationType.values()) {
            assertNotNull(type.category(), type + " sin categoría");
            assertNotNull(type.subjectType(), type + " sin tipo de sujeto");
            assertEquals("notification.type." + type.name(), type.labelKey());
            assertEquals("email.notification." + type.name(), type.emailTemplateKey());
        }
    }

    /**
     * Los cinco avisos de trabajo existen y son de la categoría que no sale por correo.
     *
     * <p>Lo único que esta prueba enumera a mano, y con motivo: son el encargo del 06-10-2026, y que
     * alguien los mueva de categoría sin querer es exactamente lo que no debe pasar en silencio.</p>
     */
    @Test
    @DisplayName("los avisos del fiscalizador son de la categoría WORK")
    void losAvisosDelFiscalizador() {
        for (NotificationType type : List.of(
                NotificationType.CITATION_VOIDED,
                NotificationType.POST_SUSPENDED,
                NotificationType.POST_REACTIVATED,
                NotificationType.POST_ROLE_CHANGED,
                NotificationType.POST_ZONES_CHANGED)) {
            assertEquals(NotificationCategory.WORK, type.category(), type + " cambió de categoría");
        }
        assertEquals(NotificationSubjectType.CITATION, NotificationType.CITATION_VOIDED.subjectType(),
                "la boleta anulada navega a la boleta");
        assertEquals(NotificationSubjectType.MEMBERSHIP, NotificationType.POST_SUSPENDED.subjectType(),
                "los avisos de puesto navegan al puesto, no a la persona: es lo que hace que dos "
                        + "puestos de la misma persona no se tapen entre sí");
    }
}
