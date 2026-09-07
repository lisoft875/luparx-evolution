package cr.luparx.core.audit;

/**
 * Output port for the audit trail. Domain modules depend on this interface only; the JPA adapter
 * that writes {@code audit_events} lives in the {@code app} module (dependency inversion at the
 * infrastructure boundary).
 */
public interface AuditEventPublisher {

    /**
     * Records the event. Implementations participate in the caller's transaction so that a business
     * change and its audit row commit together (docs/ARCHITECTURE.md §1).
     */
    void publish(AuditEvent event);
}
