package cr.luparx.tenancy.entity;

import cr.luparx.core.id.TenantId;
import cr.luparx.tenancy.model.SelfRegistrationPolicy;
import cr.luparx.tenancy.model.TenantStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/**
 * A municipality (CONTRACT.md §5 {@code tenants}). Country, currency, locale and time zone are
 * per-tenant configuration: the platform defaults only seed the form, they are never assumed.
 */
@Entity
@Table(name = "tenants")
public class Tenant {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    /** Public, URL-safe identifier. Unique across the platform. */
    @Column(name = "slug", nullable = false, length = 64)
    private String slug;

    @Column(name = "legal_name", nullable = false, length = 200)
    private String legalName;

    @Column(name = "display_name", nullable = false, length = 160)
    private String displayName;

    @Column(name = "country_code", nullable = false, length = 2)
    private String countryCode;

    @Column(name = "currency_code", nullable = false, length = 3)
    private String currencyCode;

    @Column(name = "locale", nullable = false, length = 35)
    private String locale;

    @Column(name = "time_zone", nullable = false, length = 64)
    private String timeZone;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private TenantStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "self_registration_policy", nullable = false, length = 32)
    private SelfRegistrationPolicy selfRegistrationPolicy;

    @Column(name = "status_reason", length = 500)
    private String statusReason;

    /**
     * How to obtain this municipality's logo, as a key the API resolves into a URL — never a stored
     * URL (see the column comment in V14_0). Null means it has not provided an emblem yet, which is a
     * valid state: the client draws a monogram over {@link #brandColor}.
     */
    @Column(name = "logo_asset_key", length = 400)
    private String logoAssetKey;

    /** Primary brand colour as {@code #rrggbb}, lower case. Null until the municipality picks one. */
    @Column(name = "brand_color", length = 7)
    private String brandColor;

    /** What fits in a top bar when the display name does not. Null means "use the display name". */
    @Column(name = "short_name", length = 40)
    private String shortName;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "updated_by")
    private UUID updatedBy;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected Tenant() {
        // for JPA
    }

    public Tenant(UUID id, String slug, String legalName, String displayName, String countryCode, String currencyCode,
                  String locale, String timeZone, TenantStatus status,
                  SelfRegistrationPolicy selfRegistrationPolicy, Instant createdAt, UUID createdBy) {
        this.id = id;
        this.slug = slug;
        this.legalName = legalName;
        this.displayName = displayName;
        this.countryCode = countryCode;
        this.currencyCode = currencyCode;
        this.locale = locale;
        this.timeZone = timeZone;
        this.status = status;
        this.selfRegistrationPolicy = selfRegistrationPolicy;
        this.createdAt = createdAt;
        this.updatedAt = createdAt;
        this.createdBy = createdBy;
        this.updatedBy = createdBy;
    }

    public UUID getId() {
        return id;
    }

    public TenantId getTenantId() {
        return TenantId.of(id);
    }

    public String getSlug() {
        return slug;
    }

    public String getLegalName() {
        return legalName;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getCountryCode() {
        return countryCode;
    }

    public String getCurrencyCode() {
        return currencyCode;
    }

    public String getLocale() {
        return locale;
    }

    public String getTimeZone() {
        return timeZone;
    }

    public TenantStatus getStatus() {
        return status;
    }

    public SelfRegistrationPolicy getSelfRegistrationPolicy() {
        return selfRegistrationPolicy;
    }

    public String getStatusReason() {
        return statusReason;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public UUID getCreatedBy() {
        return createdBy;
    }

    public UUID getUpdatedBy() {
        return updatedBy;
    }

    public long getVersion() {
        return version;
    }

    public void rename(String legalName, String displayName) {
        this.legalName = legalName;
        this.displayName = displayName;
    }

    public void reconfigure(String currencyCode, String locale, String timeZone,
                            SelfRegistrationPolicy selfRegistrationPolicy) {
        this.currencyCode = currencyCode;
        this.locale = locale;
        this.timeZone = timeZone;
        this.selfRegistrationPolicy = selfRegistrationPolicy;
    }

    public String getLogoAssetKey() {
        return logoAssetKey;
    }

    public String getBrandColor() {
        return brandColor;
    }

    public String getShortName() {
        return shortName;
    }

    /**
     * Replaces the visual identity, as one form. Every value is already normalised and validated by
     * the caller; nulls are meaningful and mean "this municipality has none", never "leave it".
     */
    public void rebrand(String logoAssetKey, String brandColor, String shortName) {
        this.logoAssetKey = logoAssetKey;
        this.brandColor = brandColor;
        this.shortName = shortName;
    }

    public void changeStatus(TenantStatus status, String reason) {
        this.status = status;
        this.statusReason = reason;
    }

    public void touch(Instant now, UUID actor) {
        this.updatedAt = now;
        this.updatedBy = actor;
    }
}
