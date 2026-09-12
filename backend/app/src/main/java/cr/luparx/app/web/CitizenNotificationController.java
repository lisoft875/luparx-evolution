package cr.luparx.app.web;

import cr.luparx.app.web.dto.NotificationDtos;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.notification.entity.Notification;
import cr.luparx.notification.entity.NotificationPreference;
import cr.luparx.notification.model.NotificationCategory;
import cr.luparx.notification.service.NotificationPreferenceService;
import cr.luparx.notification.service.NotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * The citizen's inbox — what the bell in the app finally points at (CONTRACT.md v0.38).
 *
 * <p>Who is asking and inside which municipality both come from {@link TenantContextHolder} and never
 * from a parameter: a notification identifier is a UUID somebody could try, and every read here is
 * narrowed by the caller's own id so that trying gets a 404 rather than somebody else's business
 * (SECURITY.md §4, BOLA).</p>
 *
 * <p>The preference endpoints are the exception to the tenant scoping, on purpose: what reaches a
 * person's inbox is a decision about their inbox, not about a municipality, and somebody who belongs
 * to three should not have to make it three times.</p>
 */
@RestController
@RequestMapping("/api/v1/citizen/notifications")
@Tag(name = "Citizen · Notifications", description = "The bell: what happened, and what of it goes out by email.")
public class CitizenNotificationController {

    private final NotificationService notifications;
    private final NotificationPreferenceService preferences;

    public CitizenNotificationController(NotificationService notifications,
                                         NotificationPreferenceService preferences) {
        this.notifications = notifications;
        this.preferences = preferences;
    }

    /** The inbox of the active municipality, newest first. */
    @GetMapping
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "My notifications in the active municipality")
    public PageResponse<NotificationDtos.NotificationResponse> list(
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        PageRequest request = PageRequest.parse(page, size, null);
        return notifications.page(TenantContextHolder.requireTenantId(), TenantContextHolder.requireUserId(),
                request).map(CitizenNotificationController::toResponse);
    }

    /**
     * The number on the bell.
     *
     * <p>Its own endpoint rather than a field on the list: the badge is polled from every screen and
     * the list is not, and answering it with a page of rows would make the cheapest question in the
     * app the most expensive one. It is one indexed count.</p>
     */
    @GetMapping("/unread-count")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "How many notifications I have not read in the active municipality")
    public NotificationDtos.UnreadCountResponse unreadCount() {
        return new NotificationDtos.UnreadCountResponse(notifications.unreadCount(
                TenantContextHolder.requireTenantId(), TenantContextHolder.requireUserId()));
    }

    @PostMapping("/{notificationId}/read")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Mark one notification read")
    public NotificationDtos.NotificationResponse markRead(@PathVariable UUID notificationId) {
        return toResponse(notifications.markRead(TenantContextHolder.requireTenantId(),
                TenantContextHolder.requireUserId(), notificationId));
    }

    @PostMapping("/read-all")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Mark every notification of the active municipality read")
    public NotificationDtos.MarkedReadResponse markAllRead() {
        return new NotificationDtos.MarkedReadResponse(notifications.markAllRead(
                TenantContextHolder.requireTenantId(), TenantContextHolder.requireUserId()));
    }

    @GetMapping("/preferences")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "What of this reaches my email")
    public NotificationDtos.NotificationPreferencesResponse preferences() {
        return toResponse(preferences.require(TenantContextHolder.requireUserId()));
    }

    /**
     * Replaces the whole preference.
     *
     * <p>Whole-form and not field-by-field, like the parking policy: the screen is one switch and its
     * ticks, and a partial update would make "I unticked fines" and "my client does not know about
     * fines" indistinguishable.</p>
     */
    @PutMapping("/preferences")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Replace what reaches my email")
    public NotificationDtos.NotificationPreferencesResponse updatePreferences(
            @Valid @RequestBody NotificationDtos.UpdateNotificationPreferencesRequest request) {
        UserId userId = TenantContextHolder.requireUserId();
        return toResponse(preferences.replace(userId, request.emailEnabled().booleanValue(),
                parseCategories(request.emailCategories())));
    }

    /**
     * A category this build does not know is refused rather than dropped.
     *
     * <p>Silently ignoring it would tell the client its choice was saved when it was not — and the
     * person would find out from the emails they kept getting, or stopped getting.</p>
     */
    private static Set<NotificationCategory> parseCategories(List<String> raw) {
        if (raw == null || raw.isEmpty()) {
            return EnumSet.noneOf(NotificationCategory.class);
        }
        Set<NotificationCategory> parsed = EnumSet.noneOf(NotificationCategory.class);
        for (String value : raw) {
            try {
                parsed.add(NotificationCategory.valueOf(value.trim().toUpperCase(Locale.ROOT)));
            } catch (IllegalArgumentException unknown) {
                throw new ValidationException("emailCategories", ErrorCode.VALIDATION_FAILED,
                        "error.notification.category.invalid");
            }
        }
        return parsed;
    }

    private static NotificationDtos.NotificationResponse toResponse(Notification notification) {
        return new NotificationDtos.NotificationResponse(
                notification.getId(),
                notification.getType().name(),
                notification.getCategory().name(),
                notification.getSubjectType().name(),
                notification.getSubjectId(),
                notification.getParams(),
                notification.getCreatedAt(),
                notification.getReadAt());
    }

    private static NotificationDtos.NotificationPreferencesResponse toResponse(NotificationPreference preference) {
        List<String> enabled = new ArrayList<>();
        for (NotificationCategory category : preference.getEmailCategories()) {
            enabled.add(category.name());
        }
        // The catalogue travels with the answer so the screen never hardcodes the list: a category
        // added next year appears on it without shipping a client (ADR 0008's rule, applied to a
        // vocabulary rather than to a country list).
        List<String> available = Arrays.stream(NotificationCategory.values()).map(Enum::name).toList();
        return new NotificationDtos.NotificationPreferencesResponse(preference.isEmailEnabled(), enabled,
                available, preference.getUpdatedAt());
    }
}
