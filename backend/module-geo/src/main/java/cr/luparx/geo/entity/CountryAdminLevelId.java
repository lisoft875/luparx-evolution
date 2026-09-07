package cr.luparx.geo.entity;

import java.io.Serializable;
import java.util.Objects;

/** Composite identifier of {@link CountryAdminLevel}: (country_code, level). */
public class CountryAdminLevelId implements Serializable {

    private static final long serialVersionUID = 1L;

    private String countryCode;
    private Integer level;

    public CountryAdminLevelId() {
    }

    public CountryAdminLevelId(String countryCode, Integer level) {
        this.countryCode = countryCode;
        this.level = level;
    }

    public String getCountryCode() {
        return countryCode;
    }

    public void setCountryCode(String countryCode) {
        this.countryCode = countryCode;
    }

    public Integer getLevel() {
        return level;
    }

    public void setLevel(Integer level) {
        this.level = level;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof CountryAdminLevelId that)) {
            return false;
        }
        return Objects.equals(countryCode, that.countryCode) && Objects.equals(level, that.level);
    }

    @Override
    public int hashCode() {
        return Objects.hash(countryCode, level);
    }
}
