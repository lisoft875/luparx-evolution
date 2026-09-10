package cr.luparx.enforcement.model;

import java.util.Locale;
import java.util.Set;

/**
 * The limits every backing document of a permit is held to, wherever the bytes end up being stored
 * (CONTRACT.md v0.30).
 *
 * <p>Separate from {@link EvidencePolicy} rather than folded into it, because the two answer different
 * questions. A citation photograph comes off a municipal phone in the street and is an image; a permit
 * document is a scanned assessment or a council agreement, arrives from a desk, and is usually a PDF
 * of several pages. Sharing one limit would mean either refusing legitimate paperwork or letting a
 * patrol upload ten megabytes over mobile data.</p>
 *
 * <p>Configuration and not constants, for the same reason the evidence limits are: the deployment
 * knows what its storage and its connections can take, and nobody should redeploy to accept a longer
 * assessment.</p>
 *
 * @param maxBytes             largest accepted file
 * @param allowedContentTypes  canonical types as {@link DocumentSniffer} reports them — never as the
 *                             client declared them
 * @param maxDocumentsPerPermit how many documents one permit may carry; a bound exists because an
 *                             unbounded one is a way to fill a disk
 */
public record DocumentPolicy(long maxBytes, Set<String> allowedContentTypes, int maxDocumentsPerPermit) {

    public DocumentPolicy {
        if (maxBytes <= 0L) {
            throw new IllegalArgumentException("maxBytes must be positive");
        }
        if (allowedContentTypes == null || allowedContentTypes.isEmpty()) {
            throw new IllegalArgumentException("allowedContentTypes must not be empty");
        }
        allowedContentTypes = allowedContentTypes.stream()
                .map(type -> type.trim().toLowerCase(Locale.ROOT))
                .collect(java.util.stream.Collectors.toUnmodifiableSet());
        if (maxDocumentsPerPermit <= 0) {
            throw new IllegalArgumentException("maxDocumentsPerPermit must be positive");
        }
    }

    public boolean allows(String canonicalContentType) {
        return canonicalContentType != null
                && allowedContentTypes.contains(canonicalContentType.toLowerCase(Locale.ROOT));
    }
}
