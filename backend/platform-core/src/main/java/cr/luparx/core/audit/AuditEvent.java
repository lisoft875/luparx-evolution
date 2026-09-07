package cr.luparx.core.audit;

import cr.luparx.core.domain.Portal;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Append-only record of a security- or business-relevant action (CONTRACT.md §7, ADR 0013).
 *
 * <p>{@code tenantId} is null only for platform-scoped actions. The client IP is stored hashed
 * ({@code ipHash}) and {@code metadata} must never contain secrets or full personal identifiers
 * (SECURITY.md §11).</p>
 */
public record AuditEvent(
        UUID id,
        TenantId tenantId,
        UserId actorUserId,
        Portal actorPortal,
        String action,
        String resourceType,
        String resourceId,
        String ipHash,
        String userAgent,
        Map<String, Object> metadata,
        Instant occurredAt) {

    public AuditEvent {
        metadata = metadata == null ? Map.of() : Map.copyOf(metadata);
    }
}
