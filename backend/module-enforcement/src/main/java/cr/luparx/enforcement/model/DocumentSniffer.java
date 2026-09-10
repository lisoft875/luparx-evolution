package cr.luparx.enforcement.model;

import java.util.Optional;

/**
 * Decides what a <b>backing document</b> actually is, by reading its first bytes.
 *
 * <p>Same rule as {@link ImageSniffer} and for the same reason: never the extension, never the
 * {@code Content-Type} the browser declared, because both are chosen by whoever is uploading and
 * believing them is how something that is not a document at all gets stored and served back as one
 * (OWASP ASVS 5, unrestricted file upload).</p>
 *
 * <p>The list is a photograph plus a PDF, and it stops there. A disability assessment arrives as a
 * scan or as a PDF; a council agreement arrives as a PDF. What is deliberately <em>not</em> accepted
 * is everything that is a program in disguise — an office document with macros, a ZIP, an SVG, an
 * HTML file — because this platform stores these files in order to hand them back to a human years
 * later, and a file that can execute when opened is not evidence, it is a liability.</p>
 */
public final class DocumentSniffer {

    private DocumentSniffer() {
    }

    /**
     * @return the canonical content type of the bytes, or empty when they are not a supported document
     */
    public static Optional<String> sniff(byte[] content) {
        if (content == null || content.length < 12) {
            return Optional.empty();
        }
        // PDF: "%PDF-"
        if (content[0] == '%' && content[1] == 'P' && content[2] == 'D' && content[3] == 'F' && content[4] == '-') {
            return Optional.of("application/pdf");
        }
        return ImageSniffer.sniff(content);
    }
}
