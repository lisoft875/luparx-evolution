package cr.luparx.enforcement.model;

import java.util.Locale;
import java.util.Set;

/**
 * The limits every evidence upload is held to, wherever the bytes end up being stored.
 *
 * <p>Configuration, not constants: a municipality on a rural connection may want smaller photographs
 * than one with fibre in every patrol car, and the day a deployment accepts a short video the list of
 * types is where that is decided. Passed to the domain as a value object so the rules are enforced
 * once, before any storage implementation sees the bytes — a filesystem store and an object store
 * must never be able to differ about what is acceptable.</p>
 *
 * @param maxBytes            largest accepted file
 * @param allowedContentTypes canonical types, as {@link ImageSniffer} reports them — never as the
 *                            client declared them
 * @param maxPhotosPerCitation how many photographs one citation may carry; a bound exists because an
 *                            unbounded one is a way to fill a disk
 * @param maxNoteLength       longest written note
 */
public record EvidencePolicy(long maxBytes, Set<String> allowedContentTypes, int maxPhotosPerCitation,
                             int maxNoteLength) {

    public EvidencePolicy {
        if (maxBytes <= 0L) {
            throw new IllegalArgumentException("maxBytes must be positive");
        }
        if (allowedContentTypes == null || allowedContentTypes.isEmpty()) {
            throw new IllegalArgumentException("allowedContentTypes must not be empty");
        }
        allowedContentTypes = allowedContentTypes.stream()
                .map(type -> type.trim().toLowerCase(Locale.ROOT))
                .collect(java.util.stream.Collectors.toUnmodifiableSet());
        if (maxPhotosPerCitation <= 0) {
            throw new IllegalArgumentException("maxPhotosPerCitation must be positive");
        }
        if (maxNoteLength <= 0) {
            throw new IllegalArgumentException("maxNoteLength must be positive");
        }
    }

    public boolean allows(String canonicalContentType) {
        return canonicalContentType != null
                && allowedContentTypes.contains(canonicalContentType.toLowerCase(Locale.ROOT));
    }
}
