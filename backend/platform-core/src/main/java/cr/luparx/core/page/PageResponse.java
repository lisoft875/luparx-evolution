package cr.luparx.core.page;

import java.util.List;
import java.util.function.Function;

/**
 * Wire envelope for every paginated collection, exactly as CONTRACT.md §4 defines it:
 * {@code { items, page, size, totalElements, totalPages }}.
 */
public record PageResponse<T>(List<T> items, int page, int size, long totalElements, int totalPages) {

    public PageResponse {
        items = items == null ? List.of() : List.copyOf(items);
    }

    public static <T> PageResponse<T> of(List<T> items, int page, int size, long totalElements) {
        int safeSize = size <= 0 ? PageRequest.DEFAULT_SIZE : size;
        int totalPages = (int) ((totalElements + safeSize - 1) / safeSize);
        return new PageResponse<>(items, page, safeSize, totalElements, totalPages);
    }

    public static <T> PageResponse<T> empty(PageRequest request) {
        return new PageResponse<>(List.of(), request.page(), request.size(), 0L, 0);
    }

    /** Maps the items to a DTO without losing the pagination metadata. */
    public <R> PageResponse<R> map(Function<T, R> mapper) {
        return new PageResponse<>(items.stream().map(mapper).toList(), page, size, totalElements, totalPages);
    }
}
