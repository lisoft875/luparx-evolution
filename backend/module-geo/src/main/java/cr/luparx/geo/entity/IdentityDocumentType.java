package cr.luparx.geo.entity;

import cr.luparx.geo.model.IdentityDocumentTypeCode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * Validation rules for one document kind in one country (CONTRACT.md §5
 * {@code identity_document_types}). Adding support for a new country is a data change: pattern,
 * normaliser and example all come from this row.
 */
@Entity
@Table(name = "identity_document_types")
@IdClass(IdentityDocumentTypeId.class)
public class IdentityDocumentType {

    @Id
    @Column(name = "country_code", nullable = false, length = 2)
    private String countryCode;

    @Id
    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 32)
    private IdentityDocumentTypeCode type;

    @Column(name = "label_key", nullable = false, length = 128)
    private String labelKey;

    /** Java-compatible regular expression the NORMALISED number must fully match. */
    @Column(name = "pattern", nullable = false, length = 256)
    private String pattern;

    /** Name of a {@link cr.luparx.geo.model.DocumentNormalizer} constant. */
    @Column(name = "normalizer", nullable = false, length = 32)
    private String normalizer;

    /** Sample value shown in the UI as a placeholder. Never a real person's document. */
    @Column(name = "example", nullable = false, length = 64)
    private String example;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    protected IdentityDocumentType() {
        // for JPA
    }

    public IdentityDocumentType(String countryCode, IdentityDocumentTypeCode type, String labelKey, String pattern,
                                String normalizer, String example, boolean active) {
        this.countryCode = countryCode;
        this.type = type;
        this.labelKey = labelKey;
        this.pattern = pattern;
        this.normalizer = normalizer;
        this.example = example;
        this.active = active;
    }

    public String getCountryCode() {
        return countryCode;
    }

    public IdentityDocumentTypeCode getType() {
        return type;
    }

    public String getLabelKey() {
        return labelKey;
    }

    public String getPattern() {
        return pattern;
    }

    public String getNormalizer() {
        return normalizer;
    }

    public String getExample() {
        return example;
    }

    public boolean isActive() {
        return active;
    }

    public void setLabelKey(String labelKey) {
        this.labelKey = labelKey;
    }

    public void setPattern(String pattern) {
        this.pattern = pattern;
    }

    public void setNormalizer(String normalizer) {
        this.normalizer = normalizer;
    }

    public void setExample(String example) {
        this.example = example;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
