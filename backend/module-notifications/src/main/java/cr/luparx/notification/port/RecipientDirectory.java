package cr.luparx.notification.port;

import cr.luparx.core.id.UserId;

import java.util.Locale;
import java.util.Optional;

/**
 * Where to write to somebody, and in what language — and nothing else about them.
 *
 * <p>This module does not depend on {@code module-identity}. It depends on this interface, and the
 * application wires an adapter that reads the user register today. Same seam and same reason as
 * {@code ParkingStatusPort} (ADR 0014): a notification is not an identity concern, and the day
 * either side moves, this is the only thing that changes.</p>
 *
 * <p>Resolved at <b>send</b> time and never copied into the queued event. Someone who changes their
 * address between the stay running out and the relay's next pass should get the message at the new
 * one, and an address sitting in {@code outbox_events.payload} would be a personal identifier in a
 * table that keeps rows for diagnosis (SECURITY.md §11).</p>
 */
public interface RecipientDirectory {

    /**
     * @return empty when the person no longer exists or has no usable address. Empty is an ordinary
     *         answer, not an error: the notification itself is already recorded and the bell will
     *         show it — only the copy by email has nowhere to go.
     */
    Optional<Recipient> find(UserId userId);

    /**
     * @param displayName what the greeting says. A given name, never the full identity document —
     *                    an email body is the least private place this platform writes to.
     */
    record Recipient(UserId userId, String email, String displayName, Locale locale) {
    }
}
