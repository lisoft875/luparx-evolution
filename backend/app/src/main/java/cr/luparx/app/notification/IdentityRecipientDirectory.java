package cr.luparx.app.notification;

import cr.luparx.core.i18n.Locales;
import cr.luparx.core.id.UserId;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.service.UserDirectoryService;
import cr.luparx.notification.port.RecipientDirectory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * The adapter that lets the notifications module reach the user register without depending on it.
 *
 * <p>It lives here, in the composition root, for the same reason {@code ParkingStatusAdapter} does
 * (ADR 0014): the module declares the question, the application answers it, and the day identity
 * moves behind an HTTP call this class is the only thing that changes.</p>
 *
 * <p>It hands back three fields and stops there. A directory that returned the {@code User} would
 * make the whole identity record reachable from a module whose entire business is deciding where to
 * post a sentence.</p>
 */
@Component
public class IdentityRecipientDirectory implements RecipientDirectory {

    private final UserDirectoryService users;

    public IdentityRecipientDirectory(UserDirectoryService users) {
        this.users = users;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Recipient> find(UserId userId) {
        return users.findAllById(List.of(userId.value())).stream()
                .findFirst()
                // No address is an ordinary state, not a failure: an account can exist without a
                // usable one, and the notification itself is already recorded either way.
                .filter(user -> user.getEmail() != null && !user.getEmail().isBlank())
                .map(IdentityRecipientDirectory::toRecipient);
    }

    private static Recipient toRecipient(User user) {
        // Locale.ROOT and not a hardcoded es-CR: the platform's own fallback chain decides
        // (ADR 0008), and a default written here would be a language choice made in the wrong place.
        Locale locale = Locales.parse(user.getLocale()).orElse(Locale.ROOT);
        return new Recipient(UserId.of(user.getId()), user.getEmail(), user.getGivenName(), locale);
    }
}
