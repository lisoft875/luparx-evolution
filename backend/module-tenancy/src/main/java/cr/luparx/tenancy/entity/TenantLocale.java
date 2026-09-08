package cr.luparx.tenancy.entity;

import cr.luparx.core.id.TenantId;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/**
 * One language a municipality offers ({@code tenant_locales}, V12_0 — CONTRACT.md v0.3, "Idiomas por
 * municipalidad").
 *
 * <p>A row, not a JSON setting, because there are four independent facts per language: the tag,
 * whether it is offered at all, whether it is the fallback, and where it sits in the dropdown. The
 * login screen reads this list before anybody is authenticated, so it has to be queryable and
 * constrained rather than a blob somebody has to parse.</p>
 *
 * <p>{@code locale} is a BCP 47 tag ({@code es-CR}, {@code en}, {@code pt-BR}) — never an enum and
 * never a two-state flag: a platform that expands across countries offers more than two languages.</p>
 */
@Entity
@Table(name = "tenant_locales")
public class TenantLocale {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "locale", nullable = false, length = 35)
    private String locale;

    @Column(name = "enabled", nullable = false)
    private boolean enabled;

    /** At most one per tenant, enforced by a partial unique index rather than by application code. */
    @Column(name = "is_default", nullable = false)
    private boolean defaultLocale;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected TenantLocale() {
        // for JPA
    }

    public TenantLocale(UUID id, UUID tenantId, String locale, boolean enabled, boolean defaultLocale,
                        int sortOrder, Instant createdAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.locale = locale;
        this.enabled = enabled;
        this.defaultLocale = defaultLocale;
        this.sortOrder = sortOrder;
        this.createdAt = createdAt;
        this.updatedAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public TenantId tenant() {
        return TenantId.of(tenantId);
    }

    public String getLocale() {
        return locale;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public boolean isDefaultLocale() {
        return defaultLocale;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public long getVersion() {
        return version;
    }

    public void update(boolean enabled, boolean defaultLocale, int sortOrder, Instant now) {
        this.enabled = enabled;
        this.defaultLocale = defaultLocale;
        this.sortOrder = sortOrder;
        this.updatedAt = now;
    }
}
