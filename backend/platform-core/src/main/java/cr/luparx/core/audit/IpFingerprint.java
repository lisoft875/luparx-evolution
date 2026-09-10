package cr.luparx.core.audit;

/**
 * The short form of a hashed address, for a person to read (CONTRACT.md v0.33).
 *
 * <h2>Why the trail shows a fingerprint and never an address</h2>
 *
 * <p>The platform stores {@code sha256(address + per-deployment pepper)} and never the address
 * itself (SECURITY.md §11). That is the right call — a stolen database backup should not be a list of
 * where every citizen was — but a sixty-four character hash in a table cell is unreadable, and
 * unreadable evidence gets "improved" by somebody storing the raw address instead. Twelve hexadecimal
 * characters are enough that two entries from the same connection visibly match and different ones
 * visibly do not, which is the question an investigator actually asks of this column: <em>were these
 * forty plate lookups all made from the same place?</em></p>
 *
 * <h2>What it does not do</h2>
 *
 * <p>It does not identify a person, a household or a place, and it cannot be turned back into an
 * address: without the deployment's pepper the hash is not guessable, and the fingerprint is a prefix
 * of a hash rather than of anything meaningful. To go the other way somebody has to <em>already
 * hold</em> the address they suspect and ask the platform to hash it — which is exactly what
 * {@code POST /admin/audit-events/ip-fingerprint} is for, and why that request is itself audited.</p>
 *
 * <p>Twelve characters is 48 bits. Two unrelated addresses colliding needs on the order of sixteen
 * million distinct addresses in one municipality's trail before it is even likely, and a collision
 * costs a false lead rather than a false record — the full hash is still there and is what the filter
 * actually compares.</p>
 */
public final class IpFingerprint {

    /** Long enough that collisions are not a practical concern, short enough to read at a glance. */
    private static final int LENGTH = 12;

    private IpFingerprint() {
    }

    /** @return the readable prefix, or null when there was no request to take an address from. */
    public static String of(String ipHash) {
        if (ipHash == null || ipHash.isBlank()) {
            return null;
        }
        return ipHash.length() <= LENGTH ? ipHash : ipHash.substring(0, LENGTH);
    }
}
