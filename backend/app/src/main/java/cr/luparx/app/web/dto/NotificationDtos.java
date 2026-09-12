package cr.luparx.app.web.dto;

import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Request and response shapes of {@code /api/v1/citizen/notifications} (CONTRACT.md v0.38). */
public final class NotificationDtos {

    private NotificationDtos() {
    }

    /**
     * One line of the citizen's inbox.
     *
     * <p>There is no {@code message} field and that is deliberate. The server sends the stable
     * {@code type} and its {@code params}; the client renders the sentence from its own bundle. A
     * server-rendered string would be frozen in the language it was written in, so a citizen who
     * switches the app to English would read their history in Spanish forever — and correcting an
     * awkward wording would mean rewriting rows.</p>
     *
     * @param subjectType where the row navigates to: PARKING_SESSION, CITATION, WALLET_TRANSACTION,
     *                    TIME_CREDIT. The client decides the route; the server does not send URLs.
     * @param params      only what the sentence needs — a plate, an instant, an amount in minor units.
     *                    Raw, so the client formats them with the reader's own locale rules.
     */
    public record NotificationResponse(
            UUID id,
            String type,
            String category,
            String subjectType,
            UUID subjectId,
            Map<String, Object> params,
            Instant createdAt,
            Instant readAt) {
    }

    /** {@code GET /citizen/notifications/unread-count} — the number on the bell, and nothing else. */
    public record UnreadCountResponse(long unread) {
    }

    /** {@code POST /citizen/notifications/read-all} — how many were still unread when it ran. */
    public record MarkedReadResponse(int marked) {
    }

    /**
     * {@code GET|PUT /citizen/notifications/preferences}.
     *
     * @param emailEnabled the master switch. False by default for a new account: the bell is the app
     *                     itself and needs no permission, somebody's inbox is not.
     * @param emailCategories which categories go out by email while the master switch is on. Kept
     *                     while it is off, so turning it back on restores what they had ticked.
     */
    public record NotificationPreferencesResponse(
            boolean emailEnabled,
            List<String> emailCategories,
            List<String> availableCategories,
            Instant updatedAt) {
    }

    /** {@code PUT} of the same, replaced whole: the screen is one switch and its list of ticks. */
    public record UpdateNotificationPreferencesRequest(
            @NotNull Boolean emailEnabled,
            /** Absent and empty mean the same thing here: nothing goes out by email. */
            List<String> emailCategories) {
    }
}
