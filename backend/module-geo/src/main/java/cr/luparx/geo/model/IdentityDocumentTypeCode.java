package cr.luparx.geo.model;

import java.util.Locale;
import java.util.Optional;

/** Identity document kinds accepted at registration (CONTRACT.md §2 item 2). */
public enum IdentityDocumentTypeCode {
    NATIONAL_ID,
    FOREIGN_RESIDENT_ID,
    PASSPORT,
    TAX_ID,
    OTHER;

    public static Optional<IdentityDocumentTypeCode> fromName(String name) {
        if (name == null) {
            return Optional.empty();
        }
        String normalized = name.trim().toUpperCase(Locale.ROOT);
        for (IdentityDocumentTypeCode value : values()) {
            if (value.name().equals(normalized)) {
                return Optional.of(value);
            }
        }
        return Optional.empty();
    }
}
