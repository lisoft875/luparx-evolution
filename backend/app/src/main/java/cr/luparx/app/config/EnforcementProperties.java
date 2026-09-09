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
 */
@ConfigurationProperties(prefix = "luparx.enforcement")
public record EnforcementProperties(String evidenceRoot,
                                    Long maxEvidenceBytes,
                                    List<String> allowedImageTypes,
                                    Integer maxPhotosPerCitation,
                                    Integer maxNoteLength) {

    /** 10 MB: a phone photograph with room to spare, and far below what would fill a disk by accident. */
    private static final long DEFAULT_MAX_BYTES = 10L * 1024L * 1024L;

    private static final List<String> DEFAULT_TYPES = List.of("image/jpeg", "image/png", "image/webp", "image/heic");

    public EnforcementProperties {
        evidenceRoot = evidenceRoot == null || evidenceRoot.isBlank() ? "./data/evidence" : evidenceRoot.trim();
        maxEvidenceBytes = maxEvidenceBytes == null || maxEvidenceBytes <= 0L ? DEFAULT_MAX_BYTES : maxEvidenceBytes;
        allowedImageTypes = allowedImageTypes == null || allowedImageTypes.isEmpty()
                ? DEFAULT_TYPES
                : List.copyOf(allowedImageTypes);
        maxPhotosPerCitation = maxPhotosPerCitation == null || maxPhotosPerCitation <= 0 ? 6 : maxPhotosPerCitation;
        maxNoteLength = maxNoteLength == null || maxNoteLength <= 0 ? 2000 : maxNoteLength;
    }
}
