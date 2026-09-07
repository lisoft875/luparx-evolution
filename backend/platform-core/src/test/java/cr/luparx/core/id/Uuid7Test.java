package cr.luparx.core.id;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** UUID v7 identifiers must be well-formed and time-ordered (CONTRACT.md §5). */
class Uuid7Test {

    @Test
    void generatesVersion7VariantRfc4122() {
        UUID id = Uuid7.generate();

        assertThat(id.version()).isEqualTo(7);
        assertThat(id.variant()).isEqualTo(2);
    }

    @Test
    void isOrderedByGenerationTime() {
        UUID earlier = Uuid7.generate(1_700_000_000_000L);
        UUID later = Uuid7.generate(1_700_000_001_000L);

        // Comparing the timestamp halves: the first 48 bits are the epoch millisecond.
        assertThat(earlier.getMostSignificantBits() >>> 16)
                .isLessThan(later.getMostSignificantBits() >>> 16);
    }

    @Test
    void doesNotRepeatWithinTheSameMillisecond() {
        Set<UUID> generated = new HashSet<>();
        for (int index = 0; index < 1_000; index++) {
            generated.add(Uuid7.generate(1_700_000_000_000L));
        }
        assertThat(generated).hasSize(1_000);
    }
}
