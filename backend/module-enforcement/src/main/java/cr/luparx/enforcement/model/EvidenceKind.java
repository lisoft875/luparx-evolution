package cr.luparx.enforcement.model;

import java.util.Locale;
import java.util.Optional;

/**
 * What a piece of evidence is. A photograph has bytes in the store behind it; a note has only text
 * written by the officer. They live in the same table because they are the same thing legally — what
 * the municipality offers as proof of the act — and separating them would make "show me everything
 * that backs this citation" two queries that can disagree.
 */
public enum EvidenceKind {

    PHOTO,
    NOTE;

    public static Optional<EvidenceKind> parse(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        for (EvidenceKind kind : values()) {
            if (kind.name().equals(normalized)) {
                return Optional.of(kind);
            }
        }
        return Optional.empty();
    }

    public String labelKey() {
        return "citation.evidence." + name().toLowerCase(Locale.ROOT);
    }
}
