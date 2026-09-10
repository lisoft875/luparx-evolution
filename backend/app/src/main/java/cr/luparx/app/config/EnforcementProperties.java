package cr.luparx.app.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * Deployment-level settings of the enforcement module ({@code luparx.enforcement.*}).
 *
 * <p>These are infrastructure decisions, not municipal ones: where evidence is kept and how large a
 * file may be depend on the deployment, while what is fined and for how much belongs to each
 * municipality's own catalogue in the database. Keeping the two apart is what stops a municipality
 * from having to ask an operator to change a fine, and an operator from having to redeploy to move a
 * storage directory.</p>
 *
 * @param evidenceRoot        directory the development evidence store writes under
 * @param maxEvidenceBytes    largest accepted upload
 * @param allowedImageTypes   canonical image types accepted, as verified from the file's own header
 * @param maxPhotosPerCitation how many photographs one citation may carry
 * @param maxNoteLength       longest written note
 * @param maxAppealImageBytes hard limit for an image attached to a citizen's defence (1 MB). The
 *                            client compresses; the server decides
 * @param maxDocumentBytes    largest accepted backing document of a permit (v0.30). Higher than a
 *                            photograph's, because a scanned assessment runs to several pages
 * @param allowedDocumentTypes canonical types accepted as backing documents, verified from the file's
 *                            own header. A PDF and the phone images, and deliberately nothing that
 *                            can execute when opened
 * @param maxDocumentsPerPermit how many documents one permit may carry
 */
@ConfigurationProperties(prefix = "luparx.enforcement")
public record EnforcementProperties(String evidenceRoot,
                                    Long maxEvidenceBytes,
                                    List<String> allowedImageTypes,
                                    Integer maxPhotosPerCitation,
                                    Integer maxNoteLength,
                                    Long maxAppealImageBytes,
                                    Long maxDocumentBytes,
                                    List<String> allowedDocumentTypes,
                                    Integer maxDocumentsPerPermit) {

    /** 10 MB: a phone photograph with room to spare, and far below what would fill a disk by accident. */
    private static final long DEFAULT_MAX_BYTES = 10L * 1024L * 1024L;

    /** 1 MB, as the product asked: a compressed phone photograph of a windscreen fits comfortably. */
    private static final long DEFAULT_MAX_APPEAL_BYTES = 1024L * 1024L;

    private static final List<String> DEFAULT_TYPES = List.of("image/jpeg", "image/png", "image/webp", "image/heic");

    /** 20 MB: a scanned multi-page assessment, uploaded from a desk rather than from the street. */
    private static final long DEFAULT_MAX_DOCUMENT_BYTES = 20L * 1024L * 1024L;

    private static final List<String> DEFAULT_DOCUMENT_TYPES =
            List.of("application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic");

    public EnforcementProperties {
        evidenceRoot = evidenceRoot == null || evidenceRoot.isBlank() ? "./data/evidence" : evidenceRoot.trim();
        maxEvidenceBytes = maxEvidenceBytes == null || maxEvidenceBytes <= 0L ? DEFAULT_MAX_BYTES : maxEvidenceBytes;
        allowedImageTypes = allowedImageTypes == null || allowedImageTypes.isEmpty()
                ? DEFAULT_TYPES
                : List.copyOf(allowedImageTypes);
        maxPhotosPerCitation = maxPhotosPerCitation == null || maxPhotosPerCitation <= 0 ? 6 : maxPhotosPerCitation;
        maxNoteLength = maxNoteLength == null || maxNoteLength <= 0 ? 2000 : maxNoteLength;
        maxAppealImageBytes = maxAppealImageBytes == null || maxAppealImageBytes <= 0L
                ? DEFAULT_MAX_APPEAL_BYTES
                : maxAppealImageBytes;
        maxDocumentBytes = maxDocumentBytes == null || maxDocumentBytes <= 0L
                ? DEFAULT_MAX_DOCUMENT_BYTES
                : maxDocumentBytes;
        allowedDocumentTypes = allowedDocumentTypes == null || allowedDocumentTypes.isEmpty()
                ? DEFAULT_DOCUMENT_TYPES
                : List.copyOf(allowedDocumentTypes);
        maxDocumentsPerPermit = maxDocumentsPerPermit == null || maxDocumentsPerPermit <= 0
                ? 10
                : maxDocumentsPerPermit;
    }
}
