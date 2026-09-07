package cr.luparx.app.outbox;

import cr.luparx.core.outbox.OutboxEvent;
import cr.luparx.core.outbox.OutboxEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Enqueues an outbox row inside the caller's transaction. {@code MANDATORY} propagation is
 * deliberate: writing an event outside a transaction would defeat the whole point of the pattern, so
 * such a call fails loudly instead of silently losing the guarantee.
 */
@Component
public class JpaOutboxEventPublisher implements OutboxEventPublisher {

    private final OutboxEventRepository repository;

    public JpaOutboxEventPublisher(OutboxEventRepository repository) {
        this.repository = repository;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void publish(OutboxEvent event) {
        repository.save(new OutboxEventEntity(
                event.id(),
                event.aggregateType(),
                event.aggregateId(),
                event.tenantId() == null ? null : event.tenantId().value(),
                event.type(),
                event.payload(),
                event.createdAt()));
    }
}
