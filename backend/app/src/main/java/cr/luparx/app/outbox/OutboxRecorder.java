package cr.luparx.app.outbox;

import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.outbox.OutboxEvent;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Map;

/** Small helper so call sites do not build identifiers and timestamps by hand. */
@Service
public class OutboxRecorder {

    private final OutboxEventRepository repository;
    private final Clock clock;

    public OutboxRecorder(OutboxEventRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    @Transactional
    public void record(String aggregateType, String aggregateId, TenantId tenantId, String type,
                       Map<String, Object> payload) {
        OutboxEvent event = new OutboxEvent(
                Uuid7.generate(),
                aggregateType,
                aggregateId,
                tenantId,
                type,
                payload,
                clock.instant(),
                null);
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
