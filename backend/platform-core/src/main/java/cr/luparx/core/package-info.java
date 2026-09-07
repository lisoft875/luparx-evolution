/**
 * LupaRX shared kernel.
 *
 * <p>Framework-free building blocks consumed by every bounded context: identifiers, exact money,
 * portals/roles/permissions, RFC 9457 errors, pagination, the request-scoped tenant context and the
 * audit/outbox output ports. Nothing here depends on Spring, JPA or HTTP, which is what allows any
 * module to be extracted into its own service later without dragging infrastructure along.</p>
 */
package cr.luparx.core;
