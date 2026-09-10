package cr.luparx.core.audit;

import cr.luparx.core.domain.Portal;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Append-only record of a security- or business-relevant action (CONTRACT.md §7, ADR 0013).
 *
 * <p>{@code tenantId} is null only for platform-scoped actions. The client IP is stored hashed
 * ({@code ipHash}) and {@code metadata} must never contain secrets or full personal identifiers
 * (SECURITY.md §11).</p>
 *
 * <p>{@code changes} carries the field-by-field before and after (v0.32), and only the fields that
 * actually changed. It is kept apart from {@code metadata} on purpose: metadata is context somebody
 * chose to note, and this is the answer to "what did they alter" — an auditor reads them differently
 * and a screen renders them differently.</p>
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
        List<AuditChange> changes,
        Instant occurredAt) {

    public AuditEvent {
        metadata = metadata == null ? Map.of() : Map.copyOf(metadata);
        changes = changes == null ? List.of() : List.copyOf(changes);
    }
}
