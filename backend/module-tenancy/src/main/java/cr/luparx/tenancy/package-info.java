/**
 * Tenancy bounded context: municipalities, their typed settings, memberships and the resolution of
 * effective roles and permissions.
 *
 * <p>This module owns {@code tenant_id}. It references users only through
 * {@link cr.luparx.core.id.UserId} — there is no compile-time dependency on module-identity, so the
 * boundary that would become a network call in an extracted service already exists today
 * (docs/ARCHITECTURE.md §5).</p>
 */
package cr.luparx.tenancy;
