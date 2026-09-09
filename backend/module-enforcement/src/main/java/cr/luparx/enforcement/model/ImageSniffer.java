package cr.luparx.enforcement.model;

import java.util.Optional;

/**
 * Decides what an uploaded file actually is, by reading its first bytes.
 *
 * <p>Never by its extension and never by the {@code Content-Type} the client declared: both are
 * chosen by whoever is uploading, and "trust the caller's label" is how a payload that is not an
 * image at all ends up stored, served back with an image content type, and executed somewhere
 * downstream (OWASP ASVS 5, unrestricted file upload). The magic number is the only part of an
 * upload the uploader cannot lie about without changing the file into the thing it claims to be.</p>
 *
 * <p>The list is short on purpose: what a phone camera produces. Anything else — a PDF, a ZIP, an
 * SVG (which is a script container), a TIFF nothing in the product can display — is refused with the
 * same clear error rather than stored in the hope that some viewer copes.</p>
 */
public final class ImageSniffer {

    private ImageSniffer() {
    }

    /**
     * @return the canonical content type of the bytes, or empty when they are not a supported image
     */
    public static Optional<String> sniff(byte[] content) {
        if (content == null || content.length < 12) {
            return Optional.empty();
        }
        // JPEG: FF D8 FF
        if (unsigned(content[0]) == 0xFF && unsigned(content[1]) == 0xD8 && unsigned(content[2]) == 0xFF) {
            return Optional.of("image/jpeg");
        }
        // PNG: 89 50 4E 47 0D 0A 1A 0A
        if (unsigned(content[0]) == 0x89 && content[1] == 'P' && content[2] == 'N' && content[3] == 'G'
                && unsigned(content[4]) == 0x0D && unsigned(content[5]) == 0x0A && unsigned(content[6]) == 0x1A
                && unsigned(content[7]) == 0x0A) {
            return Optional.of("image/png");
        }
        // WebP: "RIFF" .... "WEBP"
        if (content[0] == 'R' && content[1] == 'I' && content[2] == 'F' && content[3] == 'F'
                && content[8] == 'W' && content[9] == 'E' && content[10] == 'B' && content[11] == 'P') {
            return Optional.of("image/webp");
        }
        // HEIC/HEIF: an ISO-BMFF box whose brand starts with "heic", "heix", "hevc" or "mif1". This
        // is what an iPhone produces by default, so refusing it would mean refusing half the phones
        // in the street.
        if (content.length >= 16 && content[4] == 'f' && content[5] == 't' && content[6] == 'y' && content[7] == 'p') {
            String brand = new String(content, 8, 4, java.nio.charset.StandardCharsets.US_ASCII);
            if (brand.startsWith("hei") || brand.startsWith("hev") || "mif1".equals(brand) || "msf1".equals(brand)) {
                return Optional.of("image/heic");
            }
        }
        return Optional.empty();
    }

    private static int unsigned(byte value) {
        return value & 0xFF;
    }
}
