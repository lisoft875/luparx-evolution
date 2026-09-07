package cr.luparx.geo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * The administrative hierarchy of a country, one row per level (CONTRACT.md §5
 * {@code country_admin_levels}). "Provincia / Cantón / Distrito" and "State / County / City" are
 * data, never UI constants (CONTRACT.md §2 item 3).
 */
@Entity
@Table(name = "country_admin_levels")
@IdClass(CountryAdminLevelId.class)
public class CountryAdminLevel {

    @Id
    @Column(name = "country_code", nullable = false, length = 2)
    private String countryCode;

    /** 1-based depth of the level inside the country's division tree. */
    @Id
    @Column(name = "level", nullable = false)
    private Integer level;

    /** i18n key of the label shown for this level. */
    @Column(name = "label_key", nullable = false, length = 128)
    private String labelKey;

    /** Whether an address in this country must supply a division at this level. */
    @Column(name = "required", nullable = false)
    private boolean required;

    protected CountryAdminLevel() {
        // for JPA
    }

    public CountryAdminLevel(String countryCode, Integer level, String labelKey, boolean required) {
        this.countryCode = countryCode;
        this.level = level;
        this.labelKey = labelKey;
        this.required = required;
    }

    public String getCountryCode() {
        return countryCode;
    }

    public Integer getLevel() {
        return level;
    }

    public String getLabelKey() {
        return labelKey;
    }

    public boolean isRequired() {
        return required;
    }

    public void setLabelKey(String labelKey) {
        this.labelKey = labelKey;
    }

    public void setRequired(boolean required) {
        this.required = required;
    }
}
