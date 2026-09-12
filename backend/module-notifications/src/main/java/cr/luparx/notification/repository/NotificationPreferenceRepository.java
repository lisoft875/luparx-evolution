package cr.luparx.notification.repository;

import cr.luparx.notification.entity.NotificationPreference;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/** One row per person, keyed by them. Not tenant-scoped: it is a decision about their own inbox. */
public interface NotificationPreferenceRepository extends JpaRepository<NotificationPreference, UUID> {
}
