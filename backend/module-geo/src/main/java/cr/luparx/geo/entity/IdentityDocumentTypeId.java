package cr.luparx.geo.entity;

import cr.luparx.geo.model.IdentityDocumentTypeCode;

import java.io.Serializable;
import java.util.Objects;

/** Composite identifier of {@link IdentityDocumentType}: (country_code, type). */
public class IdentityDocumentTypeId implements Serializable {

    private static final long serialVersionUID = 1L;

    private String countryCode;
    private IdentityDocumentTypeCode type;

    public IdentityDocumentTypeId() {
    }

    public IdentityDocumentTypeId(String countryCode, IdentityDocumentTypeCode type) {
        this.countryCode = countryCode;
        this.type = type;
    }

    public String getCountryCode() {
        return countryCode;
    }

    public void setCountryCode(String countryCode) {
        this.countryCode = countryCode;
    }

    public IdentityDocumentTypeCode getType() {
        return type;
    }

    public void setType(IdentityDocumentTypeCode type) {
        this.type = type;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof IdentityDocumentTypeId that)) {
            return false;
        }
        return Objects.equals(countryCode, that.countryCode) && type == that.type;
    }

    @Override
    public int hashCode() {
        return Objects.hash(countryCode, type);
    }
}
