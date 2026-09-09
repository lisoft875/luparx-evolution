package cr.luparx.parking.model;

import java.util.UUID;

/**
 * Which bay codes a zone actually has: the first, the last and how many.
 *
 * <p>It exists because a citizen who picks Barrio Amón and types {@code 1500} is told the code does
 * not exist in that zone and has no way to find out which ones do. The information was always
 * there — bays are dealt to zones in contiguous blocks — it simply was not exposed, so the app could
 * not put "0001–0500" under the field.</p>
 *
 * <p><b>First and last are the extremes of the codes, compared as text.</b> That is exact here and
 * not a happy accident: every code a municipality issues is zero-padded to the width its own format
 * declares ({@code 0001}, {@code E-0001}), so all the codes of one municipality are the same length
 * and lexicographic order is numeric order. A municipality that later adopts variable-width codes
 * would need this computed differently, and the format row is what would tell it so.</p>
 *
 * <p>{@code count} is not implied by the range: a bay taken out of service in the middle leaves the
 * extremes untouched, and "0001–0500, 498 bays" is a truer thing to show than either number alone.</p>
 *
 * @param zoneId    the zone these bays belong to
 * @param firstCode lowest code in the zone
 * @param lastCode  highest code in the zone
 * @param count     how many bays the zone has
 */
public record ParkingSpaceRange(UUID zoneId, String firstCode, String lastCode, long count) {
}
