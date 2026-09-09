package cr.luparx.enforcement.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * The legal notice a citizen reads before writing a defence ({@code appeal_notices}, V18_0).
 *
 * <h2>Why this is a row and not a translation key</h2>
 *
 * <p>The text warns that insulting a public official can be a crime. It is a statement about a
 * jurisdiction, it will be rewritten by the municipality's own lawyer, and the day somebody argues
 * "nobody warned me" the only answer that counts is <em>this exact text, this version, accepted at
 * this moment</em>. A message key has no version, no effective date, cannot be changed without a
 * deployment, and leaves no record of what the person actually read.</p>
 *
 * <h2>Two scopes</h2>
 *
 * <p>A notice belongs either to one municipality or to a country. The country row is the default the
 * municipalities of that country inherit — a penal code is national, so writing it once is right —
 * and a municipality with its own counsel overrides it without waiting for a release.</p>
 *
 * <h2>Never edited</h2>
 *
 * <p>A change inserts a new {@link #getVersion() version}. {@code CitationAppeal} points at the exact
 * row that was on screen, so a defence filed last year still quotes the text that was shown then.</p>
 *
 * <p><b>The seeded Costa Rican wording is a starting point, not legal advice.</b> It must be reviewed
 * and approved by the client's lawyer before production; it lives in a table precisely so they can
 * correct it from the admin portal.</p>
 */
@Entity
@Table(name = "appeal_notices")
public class AppealNotice {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    /** Set when the notice belongs to one municipality; null for a country default. */
    @Column(name = "tenant_id")
    private UUID tenantId;

    /** Set when the notice is a country default; null for a municipality's own. */
    @Column(name = "country_code", length = 2)
    private String countryCode;

    @Column(name = "locale", nullable = false, length = 35)
    private String locale;

    @Column(name = "version", nullable = false)
    private int version;

    @Column(name = "body", nullable = false, columnDefinition = "text")
    private String body;

    @Column(name = "effective_from", nullable = false)
    private Instant effectiveFrom;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "created_by")
    private UUID createdBy;

    protected AppealNotice() {
        // for JPA
    }

    public static AppealNotice forTenant(UUID id, UUID tenantId, String locale, int version, String body,
                                         Instant effectiveFrom, UUID createdBy, Instant now) {
        AppealNotice notice = new AppealNotice();
        notice.id = id;
        notice.tenantId = tenantId;
        notice.locale = locale;
        notice.version = version;
        notice.body = body;
        notice.effectiveFrom = effectiveFrom;
        notice.createdBy = createdBy;
        notice.createdAt = now;
        return notice;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public String getCountryCode() {
        return countryCode;
    }

    public String getLocale() {
        return locale;
    }

    public int getVersion() {
        return version;
    }

    public String getBody() {
        return body;
    }

    public Instant getEffectiveFrom() {
        return effectiveFrom;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public UUID getCreatedBy() {
        return createdBy;
    }

    /** True when this is the country-wide default rather than one municipality's own wording. */
    public boolean isCountryDefault() {
        return tenantId == null;
    }
}
