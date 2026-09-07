package cr.luparx.geo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A supported country (CONTRACT.md §5 {@code countries}). Everything the platform treats as a
 * "default" — currency, locale, time zone, dial code — hangs off this row, so no country is baked
 * into the code (CONTRACT.md §7).
 */
@Entity
@Table(name = "countries")
public class Country {

    /** ISO 3166-1 alpha-2, upper case. */
    @Id
    @Column(name = "code", nullable = false, length = 2)
    private String code;

    /** i18n key for the country name; the display string never lives in the database. */
    @Column(name = "name_key", nullable = false, length = 128)
    private String nameKey;

    /** E.164 country calling code including the leading '+', e.g. "+506". */
    @Column(name = "dial_code", nullable = false, length = 8)
    private String dialCode;

    @Column(name = "default_locale", nullable = false, length = 35)
    private String defaultLocale;

    @Column(name = "default_currency", nullable = false, length = 3)
    private String defaultCurrency;

    @Column(name = "default_time_zone", nullable = false, length = 64)
    private String defaultTimeZone;

    /**
     * How a person's name is rendered in this country, e.g. {@code GIVEN_FAMILY} or
     * {@code GIVEN_FAMILY_SECOND} (CONTRACT.md §2 item 1). The UI reads it; it is never assumed.
     */
    @Column(name = "display_name_format", nullable = false, length = 32)
    private String displayNameFormat;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    protected Country() {
        // for JPA
    }

    public Country(String code, String nameKey, String dialCode, String defaultLocale, String defaultCurrency,
                   String defaultTimeZone, String displayNameFormat, boolean active) {
        this.code = code;
        this.nameKey = nameKey;
        this.dialCode = dialCode;
        this.defaultLocale = defaultLocale;
        this.defaultCurrency = defaultCurrency;
        this.defaultTimeZone = defaultTimeZone;
        this.displayNameFormat = displayNameFormat;
        this.active = active;
    }

    public String getCode() {
        return code;
    }

    public String getNameKey() {
        return nameKey;
    }

    public String getDialCode() {
        return dialCode;
    }

    public String getDefaultLocale() {
        return defaultLocale;
    }

    public String getDefaultCurrency() {
        return defaultCurrency;
    }

    public String getDefaultTimeZone() {
        return defaultTimeZone;
    }

    public String getDisplayNameFormat() {
        return displayNameFormat;
    }

    public boolean isActive() {
        return active;
    }

    public void setNameKey(String nameKey) {
        this.nameKey = nameKey;
    }

    public void setDialCode(String dialCode) {
        this.dialCode = dialCode;
    }

    public void setDefaultLocale(String defaultLocale) {
        this.defaultLocale = defaultLocale;
    }

    public void setDefaultCurrency(String defaultCurrency) {
        this.defaultCurrency = defaultCurrency;
    }

    public void setDefaultTimeZone(String defaultTimeZone) {
        this.defaultTimeZone = defaultTimeZone;
    }

    public void setDisplayNameFormat(String displayNameFormat) {
        this.displayNameFormat = displayNameFormat;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
