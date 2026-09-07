package cr.luparx.app.web;

import cr.luparx.core.domain.Portal;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;

/**
 * Resolves the {@code {portal}} path variable shared by every portal-scoped route.
 *
 * <p>An unknown slug is a 404, not a 400: {@code /api/v1/auth/banana/login} is simply not a route
 * that exists, and answering 404 avoids confirming which portal names are valid.</p>
 */
public final class PortalPathVariable {

    private PortalPathVariable() {
    }

    public static Portal require(String slug) {
        return Portal.fromSlug(slug)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.NOT_FOUND, "error.notFound"));
    }
}
