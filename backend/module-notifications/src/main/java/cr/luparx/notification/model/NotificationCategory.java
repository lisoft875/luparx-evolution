package cr.luparx.notification.model;

/**
 * What a notification is <em>about</em>, at the grain the citizen chooses by.
 *
 * <p>This is the unit of the email preference and nothing else. It is deliberately coarse: a person
 * deciding what reaches their inbox is answering "do I want to hear about my fines", not "do I want
 * `CITATION_ISSUED` but not `APPEAL_RESOLVED`". A preference screen with one switch per event type
 * is a screen nobody finishes reading, and the switches nobody read are the ones that end up wrong.</p>
 *
 * <p>Adding a category is a row in {@code notification_email_categories} and a translation, never a
 * migration — which is the reason that table exists instead of three boolean columns.</p>
 */
public enum NotificationCategory {

    /** Stays: about to run out, ran out. */
    PARKING(true),
    /** Citations and the appeals against them. */
    FINES(true),
    /** Money and saved minutes. */
    WALLET(true),
    /**
     * El trabajo de quien trabaja PARA la municipalidad: su boleta anulada, su puesto cambiado.
     *
     * <p>No se elige por correo, y por eso existe como categoría aparte en vez de reusar FINES.
     * Dos razones medidas, no de gusto:</p>
     *
     * <p>La primera es una trampa real. `CitizenNotificationController` publica
     * `NotificationCategory.values()` como el catálogo de lo que el ciudadano puede marcar —a
     * propósito, para que una categoría nueva aparezca sin desplegar cliente— así que meter los avisos
     * del fiscalizador en FINES, o añadir esta categoría sin más, la habría hecho aparecer en la
     * pantalla de preferencias del CIUDADANO: una casilla para algo que nunca va a recibir, con una
     * clave de traducción que no existe. `emailChoice()` es lo que lo evita, y lo evita para la
     * próxima también.</p>
     *
     * <p>La segunda es peor si pasa. Si estos avisos cayeran en FINES, alguien que es ciudadano Y
     * fiscalizador con el correo de multas encendido recibiría un correo por «te anularon la boleta»
     * usando una plantilla que no existe: el relay lanzaría, reintentaría con backoff y acabaría
     * marcando la fila como fracasada. Sin fila de preferencia no hay correo, y sin correo no hay
     * plantilla que falte.</p>
     */
    WORK(false);

    private final boolean emailChoice;

    NotificationCategory(boolean emailChoice) {
        this.emailChoice = emailChoice;
    }

    /**
     * ¿Es una categoría que una persona marca o desmarca para su correo?
     *
     * <p>Vive en el enum y no en una lista dentro de un controlador porque la pregunta es sobre la
     * categoría, no sobre la pantalla: una lista en el controlador se queda vieja en silencio la
     * próxima vez que alguien añada un valor acá.</p>
     */
    public boolean emailChoice() {
        return emailChoice;
    }

    /** The i18n key both the app and the email bundle resolve this by. */
    public String labelKey() {
        return "notification.category." + name();
    }
}
