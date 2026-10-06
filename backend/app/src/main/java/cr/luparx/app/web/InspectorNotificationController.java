package cr.luparx.app.web;

import cr.luparx.app.web.dto.NotificationDtos;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.notification.entity.Notification;
import cr.luparx.notification.service.NotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * La campana del fiscalizador: lo que le pasó a su trabajo.
 *
 * <h2>Por qué un controlador aparte y no el del ciudadano</h2>
 *
 * <p>Porque el del ciudadano está cerrado con {@code hasRole('CITIZEN')} en cada método, y con razón:
 * ahí vive el buzón de una persona como vecina —su estadía, su multa, su saldo—. Un fiscalizador que
 * llamara a esa ruta recibiría un 403, y si se le abriera vería SU buzón de ciudadano dentro de la
 * aplicación de trabajo, que es justamente lo que no se quiere.</p>
 *
 * <p>Lo que SÍ se reutiliza es todo lo que había debajo: {@link NotificationService}, la tabla, la
 * idempotencia y el relay de correo. Nada de eso fue nunca del ciudadano — {@code notifications} tiene
 * {@code user_id} y {@code tenant_id} y nada más—; lo que era del ciudadano eran el vocabulario, las
 * categorías y el controlador. Así que esto son cuarenta líneas y no un sistema nuevo.</p>
 *
 * <h2>Lo que no tiene</h2>
 *
 * <p>No tiene preferencias de correo. Los avisos de trabajo son de la categoría {@code WORK}, que no
 * es elegible por correo, así que no hay nada que preferir: se leen en la aplicación. Dar una pantalla
 * de preferencias con una sola casilla que no hace nada sería peor que no darla.</p>
 *
 * <h2>Quién pregunta, y por dónde no se puede preguntar</h2>
 *
 * <p>La persona y la municipalidad salen de {@link TenantContextHolder} y nunca de un parámetro. Un
 * identificador de notificación es un UUID que alguien podría probar, y cada lectura va acotada por el
 * id de quien pregunta, así que probar da 404 y no los asuntos de otro (SECURITY.md §4, BOLA).</p>
 */
@RestController
@RequestMapping("/api/v1/inspector/notifications")
@Tag(name = "Inspector · Notifications",
        description = "La campana del fiscalizador: su boleta anulada, su puesto cambiado.")
public class InspectorNotificationController {

    /**
     * Los dos roles del portal de fiscalización.
     *
     * <p>`hasAnyRole` y no el permiso: no hay un `PERM_*` para «leer mi propio buzón», y crearlo sería
     * inventar una capacidad para algo que no es una capacidad — nadie puede leer el buzón de otro, así
     * que no hay nada que autorizar más allá de estar dentro del portal. Es el mismo criterio que usa
     * el controlador del ciudadano con `hasRole('CITIZEN')`.</p>
     */
    private static final String ROLES = "hasAnyRole('INSPECTOR','INSPECTOR_LEAD')";

    private final NotificationService notifications;

    public InspectorNotificationController(NotificationService notifications) {
        this.notifications = notifications;
    }

    /** Lo que le pasó, en la municipalidad activa, lo más nuevo primero. */
    @GetMapping
    @PreAuthorize(ROLES)
    @Operation(summary = "Mis avisos de trabajo en la municipalidad activa")
    public PageResponse<NotificationDtos.NotificationResponse> list(
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        PageRequest request = PageRequest.parse(page, size, null);
        return notifications.page(TenantContextHolder.requireTenantId(), TenantContextHolder.requireUserId(),
                request).map(InspectorNotificationController::toResponse);
    }

    /**
     * El número de la campana.
     *
     * <p>Su propio endpoint y no un campo de la lista, por lo mismo que en el ciudadano: la insignia se
     * consulta desde cualquier pantalla y la lista no, así que contestarla con una página de filas
     * convertiría la pregunta más barata de la aplicación en la más cara. Es un conteo indexado.</p>
     */
    @GetMapping("/unread-count")
    @PreAuthorize(ROLES)
    @Operation(summary = "Cuántos avisos no he leído en la municipalidad activa")
    public NotificationDtos.UnreadCountResponse unreadCount() {
        return new NotificationDtos.UnreadCountResponse(notifications.unreadCount(
                TenantContextHolder.requireTenantId(), TenantContextHolder.requireUserId()));
    }

    @PostMapping("/{notificationId}/read")
    @PreAuthorize(ROLES)
    @Operation(summary = "Marcar un aviso como leído")
    public NotificationDtos.NotificationResponse markRead(@PathVariable UUID notificationId) {
        return toResponse(notifications.markRead(TenantContextHolder.requireTenantId(),
                TenantContextHolder.requireUserId(), notificationId));
    }

    @PostMapping("/read-all")
    @PreAuthorize(ROLES)
    @Operation(summary = "Marcar como leídos todos los avisos de la municipalidad activa")
    public NotificationDtos.MarkedReadResponse markAllRead() {
        return new NotificationDtos.MarkedReadResponse(notifications.markAllRead(
                TenantContextHolder.requireTenantId(), TenantContextHolder.requireUserId()));
    }

    /**
     * La fila, tal como la lee la pantalla.
     *
     * <p>El mismo DTO que el ciudadano, y a propósito: una fila de notificación es un tipo, un sujeto y
     * unos parámetros, y el texto lo arma el cliente con su diccionario. Dos formas distintas para la
     * misma cosa habrían obligado a mantener dos clientes.</p>
     */
    private static NotificationDtos.NotificationResponse toResponse(Notification notification) {
        return new NotificationDtos.NotificationResponse(
                notification.getId(),
                notification.getType().name(),
                notification.getType().category().name(),
                notification.getType().subjectType().name(),
                notification.getSubjectId(),
                notification.getParams(),
                notification.getCreatedAt(),
                notification.getReadAt());
    }
}
