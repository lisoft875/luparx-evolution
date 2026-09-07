/**
 * Geo bounded context: countries, the generic N-level administrative division tree, identity
 * document rules per country and phone-number validation.
 *
 * <p>This catalogue is global (no {@code tenant_id}) and read-only for every other module. It is the
 * module that keeps the platform free of single-country assumptions: currencies, locales, time
 * zones, dial codes, division labels and document patterns are all rows here, never constants in
 * code (CONTRACT.md §7, ADR 0008).</p>
 */
package cr.luparx.geo;
