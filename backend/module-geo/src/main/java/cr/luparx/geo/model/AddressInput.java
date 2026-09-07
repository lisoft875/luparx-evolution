package cr.luparx.geo.model;

import java.util.UUID;

/**
 * Address as submitted at registration (CONTRACT.md §2 item 3). Levels beyond the first are null
 * when the country's admin-level catalogue does not define them.
 */
public record AddressInput(
        String countryCode,
        UUID level1Id,
        UUID level2Id,
        UUID level3Id,
        String line1,
        String line2,
        String postalCode) {
}
