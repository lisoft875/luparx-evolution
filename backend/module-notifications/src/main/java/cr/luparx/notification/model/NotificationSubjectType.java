package cr.luparx.notification.model;

/**
 * What {@code notifications.subject_id} points at.
 *
 * <p>A string and not a foreign key: the identifier reaches three tables in three modules, and a
 * notification outlives what produced it — a stay is purged, a citation is voided, and "you were
 * told on Tuesday" stays true. It is stored rather than derived from the type so that a screen can
 * decide where a row navigates to without a switch over every type that will ever exist.</p>
 */
public enum NotificationSubjectType {
    PARKING_SESSION,
    CITATION,
    WALLET_TRANSACTION,
    TIME_CREDIT
}
