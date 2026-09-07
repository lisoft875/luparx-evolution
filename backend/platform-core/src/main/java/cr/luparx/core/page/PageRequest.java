package cr.luparx.core.page;

/**
 * Pagination is mandatory for every collection (CONTRACT.md §4): no endpoint may return an unbounded
 * result set, so this type clamps whatever the client asks for into a safe range.
 *
 * @param page       zero-based page index
 * @param size       page size, clamped to {@link #MAX_SIZE}
 * @param sortField  property to sort by, or null for the repository's default order
 * @param direction  sort direction, never null
 */
public record PageRequest(int page, int size, String sortField, SortDirection direction) {

    public static final int DEFAULT_SIZE = 20;
    public static final int MAX_SIZE = 100;

    public PageRequest {
        if (page < 0) {
            page = 0;
        }
        if (size <= 0) {
            size = DEFAULT_SIZE;
        }
        if (size > MAX_SIZE) {
            size = MAX_SIZE;
        }
        if (direction == null) {
            direction = SortDirection.ASC;
        }
        if (sortField != null && sortField.isBlank()) {
            sortField = null;
        }
    }

    public static PageRequest of(int page, int size) {
        return new PageRequest(page, size, null, SortDirection.ASC);
    }

    /**
     * Parses the {@code sort=field,asc} form used by the contract. An unknown or malformed value
     * degrades to the repository default rather than failing the request.
     */
    public static PageRequest parse(Integer page, Integer size, String sort) {
        String field = null;
        SortDirection direction = SortDirection.ASC;
        if (sort != null && !sort.isBlank()) {
            String[] parts = sort.split(",", 2);
            field = parts[0].trim();
            if (field.isEmpty()) {
                field = null;
            }
            if (parts.length == 2) {
                direction = SortDirection.parse(parts[1]);
            }
        }
        return new PageRequest(page == null ? 0 : page, size == null ? DEFAULT_SIZE : size, field, direction);
    }

    public int offset() {
        return page * size;
    }
}
