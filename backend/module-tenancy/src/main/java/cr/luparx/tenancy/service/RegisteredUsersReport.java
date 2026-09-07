package cr.luparx.tenancy.service;

import java.util.List;

/**
 * Result of the registered-users report (CONTRACT.md §4). {@code group} is the raw grouping value
 * (a tenant id, a country code, a portal slug or a {@code YYYY-MM} month); labels are resolved by
 * the client from its own catalogues so the report stays locale-agnostic.
 */
public record RegisteredUsersReport(String groupBy, List<Row> rows) {

    public record Row(String group, long count) {
    }
}
