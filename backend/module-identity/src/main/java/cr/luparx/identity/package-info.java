/**
 * Identity bounded context: global users, local credentials, MFA, federation and token issuance.
 *
 * <p>Users are global — one row per person, whatever number of municipalities they belong to
 * (CONTRACT.md §1). This module therefore owns no {@code tenant_id} and has no compile-time
 * dependency on module-tenancy: the roles and permissions written into a token arrive as a parameter
 * from the application layer, which resolves them through the tenancy module.</p>
 */
package cr.luparx.identity;
