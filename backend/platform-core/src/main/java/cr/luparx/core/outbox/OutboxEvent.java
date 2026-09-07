package cr.luparx.core.outbox;

import cr.luparx.core.id.TenantId;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Transactional outbox record (ADR 0012): written in the same transaction as the state change it
 * describes, published asynchronously afterwards. This is what keeps database state and
 * cross-boundary notifications consistent without a two-phase commit.
 */
public record OutboxEvent(
        UUID id,
        String aggregateType,
        String aggregateId,
        TenantId tenantId,
        String type,
        Map<String, Object> payload,
        Instant createdAt,
        Instant publishedAt) {

    public OutboxEvent {
        payload = payload == null ? Map.of() : Map.copyOf(payload);
    }
}
