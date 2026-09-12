package cr.luparx.notification.service;

import cr.luparx.core.id.UserId;
import cr.luparx.notification.entity.NotificationPreference;
import cr.luparx.notification.model.NotificationCategory;
import cr.luparx.notification.repository.NotificationPreferenceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Collection;

/**
 * What each person wants in their inbox, materialised on first read.
 *
 * <p>The row is created the first time anybody asks rather than when the account is: a preference
 * table with one row per registered user, most of them never touched, is a table that has to be
 * backfilled by every future migration for no benefit. The defaults live in
 * {@link NotificationPreference#initial} so that a person who has never opened the screen and one
 * who opened it and changed nothing are treated identically.</p>
 */
@Service
public class NotificationPreferenceService {

    private final NotificationPreferenceRepository repository;
    private final Clock clock;

    public NotificationPreferenceService(NotificationPreferenceRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    /** The row as it stands, creating the default one if this person has never had it. */
    @Transactional
    public NotificationPreference require(UserId userId) {
        return repository.findById(userId.value())
                .orElseGet(() -> repository.save(NotificationPreference.initial(userId, clock.instant())));
    }

    /**
     * The read used while deciding whether to send. Never writes.
     *
     * <p>Separate from {@link #require} on purpose: sending happens inside the transaction of the
     * stay or the citation that caused it, and a read that could insert a row would make an
     * unrelated business write fail on a preference-table conflict under concurrency.</p>
     */
    @Transactional(readOnly = true)
    public boolean sendsByEmail(UserId userId, NotificationCategory category) {
        return repository.findById(userId.value())
                .map(preference -> preference.sendsByEmail(category))
                .orElse(Boolean.FALSE)
                .booleanValue();
    }

    /** Whole-form replacement: the screen is one master switch and its list of ticks. */
    @Transactional
    public NotificationPreference replace(UserId userId, boolean emailEnabled,
                                          Collection<NotificationCategory> categories) {
        NotificationPreference preference = require(userId);
        preference.replace(emailEnabled, categories, clock.instant());
        return repository.save(preference);
    }
}
