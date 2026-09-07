package cr.luparx.core.page;

import java.util.Locale;

/** Sort direction of a paged query, parsed from the {@code sort=field,asc} query parameter. */
public enum SortDirection {
    ASC,
    DESC;

    public static SortDirection parse(String text) {
        if (text == null || text.isBlank()) {
            return ASC;
        }
        return "desc".equals(text.trim().toLowerCase(Locale.ROOT)) ? DESC : ASC;
    }
}
