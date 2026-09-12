package cr.luparx.notification.entity;

import cr.luparx.core.id.UserId;
import cr.luparx.notification.model.NotificationCategory;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.Collection;
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

/**
 * What this person wants in their inbox ({@code notification_preferences}, V35_0).
 *
 * <h2>Por persona, no por municipalidad</h2>
 *
 * <p>Someone who belongs to three municipalities should not have to make the same decision about
 * their own inbox three times, and would not remember which of the three they made it in.</p>
 *
 * <h2>Apagado por defecto</h2>
 *
 * <p>The bell asks nobody's permission — it is the app itself. Email is somebody else's inbox, and
 * sending it unasked is how a sender ends up in a spam folder, taking the messages that actually
 * matter (verification, password reset) with it. So a new row is off, with every category ticked
 * underneath: turning the master switch on then does something useful immediately, and the person
 * unticks what they do not want instead of hunting for what they do.</p>
 */
@Entity
@Table(name = "notification_preferences")
public class NotificationPreference {

    @Id
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "email_enabled", nullable = false)
    private boolean emailEnabled;

    /**
     * The categories that go out by email. <b>The row is the permission</b>: no row means no.
     *
     * <p>A child table rather than three boolean columns, so the next category is a row and not a
     * migration — and so that "absent" has one meaning instead of forcing a decision about what a
     * NULL boolean would mean for a person who signed up before the category existed.</p>
     */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "notification_email_categories", joinColumns = @JoinColumn(name = "user_id"))
    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false, length = 24)
    private Set<NotificationCategory> emailCategories = EnumSet.noneOf(NotificationCategory.class);

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected NotificationPreference() {
        // for JPA
    }

    private NotificationPreference(UUID userId, Instant now) {
        this.userId = userId;
        this.emailEnabled = false;
        this.emailCategories = EnumSet.allOf(NotificationCategory.class);
        this.createdAt = now;
        this.updatedAt = now;
    }

    /** The row somebody starts with: master off, everything ticked underneath. See the class note. */
    public static NotificationPreference initial(UserId userId, Instant now) {
        return new NotificationPreference(userId.value(), now);
    }

    public UUID getUserId() {
        return userId;
    }

    public boolean isEmailEnabled() {
        return emailEnabled;
    }

    public Set<NotificationCategory> getEmailCategories() {
        return emailCategories == null
                ? EnumSet.noneOf(NotificationCategory.class)
                : EnumSet.copyOf(emailCategories);
    }

    /**
     * Whether this category leaves by email right now.
     *
     * <p>The master switch is an AND and not a default: someone who turns email off and later back
     * on finds the same categories they had ticked, which is the behaviour a switch is expected to
     * have.</p>
     */
    public boolean sendsByEmail(NotificationCategory category) {
        return emailEnabled && emailCategories != null && emailCategories.contains(category);
    }

    public void replace(boolean emailEnabled, Collection<NotificationCategory> categories, Instant now) {
        this.emailEnabled = emailEnabled;
        this.emailCategories = categories == null || categories.isEmpty()
                ? EnumSet.noneOf(NotificationCategory.class)
                : EnumSet.copyOf(categories);
        this.updatedAt = now;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public long getVersion() {
        return version;
    }
}
