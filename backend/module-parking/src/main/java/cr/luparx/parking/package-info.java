/**
 * Parking bounded context (CONTRACT.md §4 "Dominio parquímetros").
 *
 * <p>The module existed from v0.1 so that the boundary would be a fact of the build rather than an
 * intention: it may depend on platform-core and module-tenancy, only the {@code app} bootstrap
 * depends on it, and the compiler enforces both. Zones, tariffs and numbered spaces now live here as
 * entities and repositories ({@code entity}, {@code model}, {@code repository}); parking sessions,
 * patrols, citations and finance are still deferred and will land here without any other module
 * changing shape.</p>
 *
 * <p>The tenant and the administrative division of a zone are referenced by raw {@code UUID}: the
 * foreign keys live in the schema, the boundary lives in the build. In particular there is no Maven
 * dependency on module-geo and there must not be one.</p>
 *
 * <p>Rules this module commits to in advance:</p>
 * <ul>
 *   <li>every table it owns carries {@code tenant_id NOT NULL} with a foreign key to {@code tenants}
 *       from its very first migration (docs/DATA_MODEL.md §3);</li>
 *   <li>money is {@code amount_minor bigint} plus {@code currency_code char(3)}, represented in code
 *       by {@link cr.luparx.core.money.Money} — never a floating-point type (ADR 0009);</li>
 *   <li>it reaches identity and tenancy only through their published DTOs, ports and outbox events,
 *       never through their tables — which is what makes it the first realistic candidate for
 *       extraction into its own service when citizen traffic peaks justify it
 *       (docs/ARCHITECTURE.md §5).</li>
 * </ul>
 *
 * <p>The v0.1 REST surface ({@code /citizen/vehicles}, {@code /citizen/parking-sessions},
 * {@code /inspector/patrols}, {@code /inspector/citations}, {@code /admin/zones},
 * {@code /admin/rates}, {@code /admin/finance/*}) is published by the {@code app} module as
 * documented 501 responses, so the contract is visible in OpenAPI without pretending to work.</p>
 */
package cr.luparx.parking;
