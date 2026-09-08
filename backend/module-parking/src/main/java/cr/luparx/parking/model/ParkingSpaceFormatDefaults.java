package cr.luparx.parking.model;

/**
 * The bay-code shape a municipality starts with ({@code platform.defaults.parking.space-format.*}).
 *
 * <p>Four plain digits with no prefix is the default of <em>this deployment</em>, matching the bays
 * San José paints ({@code 0001}–{@code 5000}) — not a claim that every municipality numbers its bays
 * that way. One that paints {@code A-12} or {@code LUP-0001} edits its row; nothing in the domain
 * carries a code shape as a constant (CONTRACT.md v0.3, "Formato del código de espacio").</p>
 *
 * @param prefix       literal prefix every code starts with; empty for plain numbering
 * @param digits       how many characters follow the prefix
 * @param allowLetters whether those characters may be letters as well as digits
 */
public record ParkingSpaceFormatDefaults(String prefix, int digits, boolean allowLetters) {

    public ParkingSpaceFormatDefaults {
        prefix = SpaceCodeFormat.normalizePrefix(prefix);
        if (!SpaceCodeFormat.isValidPrefix(prefix)) {
            throw new IllegalArgumentException("a bay-code prefix is capitals, digits and hyphens: " + prefix);
        }
        if (digits < 1 || digits > 12 || prefix.length() + digits > SpaceCodeFormat.MAX_CODE_LENGTH) {
            throw new IllegalArgumentException("a bay code must fit in " + SpaceCodeFormat.MAX_CODE_LENGTH
                    + " characters: " + prefix + " + " + digits);
        }
    }

    public String pattern() {
        return SpaceCodeFormat.derivePattern(prefix, digits, allowLetters);
    }

    public String example() {
        return SpaceCodeFormat.deriveExample(prefix, digits);
    }
}
