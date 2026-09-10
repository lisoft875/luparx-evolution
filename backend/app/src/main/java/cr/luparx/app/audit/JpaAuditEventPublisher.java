package cr.luparx.app.audit;

import cr.luparx.core.audit.AuditEvent;
import cr.luparx.core.audit.AuditEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Writes audit rows inside the caller's transaction, so a business change and its audit record
 * either both commit or both roll back (docs/ARCHITECTURE.md §1). That property is the reason the
 * audit trail can be trusted at all.
 */
@Component
public class JpaAuditEventPublisher implements AuditEventPublisher {

    private final AuditEventRepository repository;

    public JpaAuditEventPublisher(AuditEventRepository repository) {
        this.repository = repository;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void publish(AuditEvent event) {
        repository.save(new AuditEventEntity(
                event.id(),
                event.tenantId() == null ? null : event.tenantId().value(),
                event.actorUserId() == null ? null : event.actorUserId().value(),
                event.actorPortal(),
                event.action(),
                event.resourceType(),
                event.resourceId(),
                event.ipHash(),
                event.userAgent(),
                event.metadata(),
                event.changes(),
                null,
                event.occurredAt()));
    }
}
