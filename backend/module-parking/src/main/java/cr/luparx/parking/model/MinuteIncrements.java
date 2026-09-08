package cr.luparx.parking.model;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.TreeSet;

/**
 * The minute options a municipality offers, as a value object.
 *
 * <p>Stored as a canonical comma-separated list of positive integers ({@code "30,60,120"}) and
 * always read through this type, so the parsing rule exists once. The canonical form is sorted and
 * duplicate-free: two municipalities that configured {@code 60,30,60} and {@code 30,60} offer the
 * same thing and must not produce two different strings in the database.</p>
 *
 * <p>{@link #allows(int)} is the whole point. A requested value that is not on the list is refused
 * with {@code INVALID_INCREMENT}; it is never rounded to the nearest offered option, because
 * charging for something other than what the citizen asked for is worse than an error.</p>
 */
public record MinuteIncrements(List<Integer> values) {

    /** A municipality that offers nothing — the legitimate state of a policy with extensions off. */
    private static final MinuteIncrements EMPTY = new MinuteIncrements(List.of());

    public MinuteIncrements {
        if (values == null || values.isEmpty()) {
            values = List.of();
        } else {
            TreeSet<Integer> sorted = new TreeSet<>();
            for (Integer value : values) {
                if (value == null || value <= 0) {
                    throw new IllegalArgumentException("minute increments must be positive: " + value);
                }
                sorted.add(value);
            }
            values = Collections.unmodifiableList(new ArrayList<>(sorted));
        }
    }

    public static MinuteIncrements empty() {
        return EMPTY;
    }

    public static MinuteIncrements of(List<Integer> values) {
        return new MinuteIncrements(values);
    }

    /**
     * Parses the stored form. Blank text yields an empty set of options rather than an error: the
     * column is {@code NOT NULL DEFAULT ''} exactly so that "offers nothing" is representable.
     *
     * @throws IllegalArgumentException when an element is not a positive integer
     */
    public static MinuteIncrements parse(String csv) {
        if (csv == null || csv.isBlank()) {
            return EMPTY;
        }
        List<Integer> parsed = new ArrayList<>();
        for (String part : csv.split(",")) {
            String trimmed = part.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            parsed.add(Integer.valueOf(Integer.parseInt(trimmed)));
        }
        return new MinuteIncrements(parsed);
    }

    /** Canonical stored form; matches the CHECK constraint of {@code parking_policies} in V11_0. */
    public String toCsv() {
        StringBuilder builder = new StringBuilder();
        for (int index = 0; index < values.size(); index++) {
            if (index > 0) {
                builder.append(',');
            }
            builder.append(values.get(index).intValue());
        }
        return builder.toString();
    }

    public boolean isEmpty() {
        return values.isEmpty();
    }

    public boolean allows(int minutes) {
        for (Integer value : values) {
            if (value.intValue() == minutes) {
                return true;
            }
        }
        return false;
    }
}
