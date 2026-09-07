package cr.luparx.core.tenant;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ForbiddenException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;

import java.util.Optional;

/**
 * Request-scoped holder of the {@link TenantContext}, plus the guards that every tenant-owned query
 * must go through.
 *
 * <p>Implemented with an {@link InheritableThreadLocal} so that a request-bound worker thread keeps
 * the context; background jobs must never inherit an ambient tenant — they set it explicitly per
 * tenant they process (docs/ARCHITECTURE.md §4). The web layer always clears the holder in a
 * {@code finally} block so a pooled thread cannot leak a tenant into the next request.</p>
 */
public final class TenantContextHolder {

    private static final ThreadLocal<TenantContext> HOLDER = new ThreadLocal<>();

    private TenantContextHolder() {
    }

    public static void set(TenantContext context) {
        HOLDER.set(context);
    }

    public static void clear() {
        HOLDER.remove();
    }

    public static Optional<TenantContext> current() {
        return Optional.ofNullable(HOLDER.get());
    }

    /** @throws ForbiddenException when there is no authenticated context at all. */
    public static TenantContext require() {
        TenantContext context = HOLDER.get();
        if (context == null) {
            throw new ForbiddenException(ErrorCode.ACCESS_DENIED, "error.access.context.missing");
        }
        return context;
    }

    public static UserId requireUserId() {
        return require().userId();
    }

    /**
     * The active tenant of the current request.
     *
     * @throws ForbiddenException when the caller has no tenant selected; a tenant-owned query must
     *                            never fall back to "all tenants".
     */
    public static TenantId requireTenantId() {
        TenantContext context = require();
        if (context.tenantId() == null) {
            throw new ForbiddenException(ErrorCode.TENANT_CONTEXT_REQUIRED, "error.tenant.context.required");
        }
        return context.tenantId();
    }

    /**
     * Guard for resources that carry their own tenant: the resource's tenant must match the active
     * one, unless the caller is platform-scoped (in which case the access is audited by the caller).
     *
     * @throws ForbiddenException on any cross-tenant attempt
     */
    public static void requireAccessTo(TenantId resourceTenantId) {
        TenantContext context = require();
        if (context.platformScope()) {
            return;
        }
        if (resourceTenantId == null || !resourceTenantId.equals(context.tenantId())) {
            throw new ForbiddenException(ErrorCode.CROSS_TENANT_ACCESS_DENIED, "error.tenant.cross.access");
        }
    }

    /** Runs an action under an explicit tenant context (background jobs, tests) and restores the previous one. */
    public static void runAs(TenantContext context, Runnable action) {
        TenantContext previous = HOLDER.get();
        HOLDER.set(context);
        try {
            action.run();
        } finally {
            if (previous == null) {
                HOLDER.remove();
            } else {
                HOLDER.set(previous);
            }
        }
    }
}
