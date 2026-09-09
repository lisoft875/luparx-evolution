package cr.luparx.app.audit;

import cr.luparx.app.config.SecurityProperties;
import cr.luparx.app.security.RequestCorrelationFilter;
import cr.luparx.core.audit.AuditEvent;
import cr.luparx.core.domain.Portal;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.tenant.TenantContext;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.identity.service.Hashing;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.time.Clock;
import java.util.Map;
import java.util.Optional;

/**
 * Convenience layer over the audit port: fills in actor, tenant, portal, hashed IP, user agent and
 * trace id from the current request so that a call site only states <em>what</em> happened.
 *
 * <p>Every administrative write goes through here (CONTRACT.md §7). The IP is stored hashed and the
 * metadata map must never carry secrets or full personal identifiers (SECURITY.md §11).</p>
 */
@Service
public class AuditRecorder {

    private final AuditEventRepository repository;
    private final SecurityProperties securityProperties;
    private final Clock clock;

    public AuditRecorder(AuditEventRepository repository, SecurityProperties securityProperties, Clock clock) {
        this.repository = repository;
        this.securityProperties = securityProperties;
        this.clock = clock;
    }

    /** Records an action performed by the caller of the current request. */
    @Transactional
    public void record(String action, String resourceType, String resourceId, Map<String, Object> metadata) {
        Optional<TenantContext> context = TenantContextHolder.current();
        record(action, resourceType, resourceId,
                context.map(TenantContext::tenantId).orElse(null),
                context.map(TenantContext::userId).orElse(null),
                context.map(TenantContext::portal).orElse(null),
                metadata);
    }

    /**
     * Records an action whose actor and tenant are not (yet) in the request context — registration
     * and login, where the caller is anonymous at the time the filter ran.
     */
    @Transactional
    public void record(String action, String resourceType, String resourceId, TenantId tenantId, UserId actor,
                       Portal portal, Map<String, Object> metadata) {
        HttpServletRequest request = currentRequest();
        AuditEvent event = new AuditEvent(
                Uuid7.generate(),
                tenantId,
                actor,
                portal,
                action,
                resourceType,
                resourceId,
                request == null ? null : Hashing.ipHash(clientIp(request), securityProperties.ipHashPepper()),
                request == null ? null : truncate(request.getHeader("User-Agent")),
                metadata == null ? Map.of() : metadata,
                clock.instant());
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
                RequestCorrelationFilter.currentTraceId(),
                event.occurredAt()));
    }

    /**
     * The caller's IP, hashed with the platform pepper — the same value this recorder writes into
     * {@code audit_events}.
     *
     * <p>Exposed because the enforcement module keeps a citation's history <em>inside the citation</em>
     * (it is part of the administrative act, not a platform log) and that history has to carry the
     * same hash, so the two records can be correlated without either of them storing a raw address.
     * Returns null outside a request, which is what a scheduled job is.</p>
     */
    public String currentIpHash() {
        HttpServletRequest request = currentRequest();
        return request == null ? null : Hashing.ipHash(clientIp(request), securityProperties.ipHashPepper());
    }

    /** Client address, honouring a single-hop {@code X-Forwarded-For} set by our own proxy. */
    public static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            return (comma > 0 ? forwarded.substring(0, comma) : forwarded).trim();
        }
        return request.getRemoteAddr();
    }

    public static HttpServletRequest currentRequest() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes) {
            return attributes.getRequest();
        }
        return null;
    }

    private static String truncate(String value) {
        if (value == null) {
            return null;
        }
        return value.length() <= 400 ? value : value.substring(0, 400);
    }
}
